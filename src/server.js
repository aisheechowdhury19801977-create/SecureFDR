require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { Pool } = require("pg");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const uploadDir = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("Only PDF FDR documents are allowed"));
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function extractFdrFields(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  const fdrMatch = clean.match(/(?:FDR|FD|DEPOSIT)[\s:#\/-]*([A-Z0-9][A-Z0-9\/-]{3,})/i);
  const amountMatch = clean.match(/(?:amount|principal|value|deposit)\s*(?:amount)?\s*[:=-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const bankMatch = clean.match(/(?:bank(?: name)?|banking institution)\s*[:=-]\s*([A-Za-z][A-Za-z &.\-]{2,70})/i);
  const dateMatches = [...clean.matchAll(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/g)].map(m => m[0]);

  const issueDate = normalizeDate(dateMatches[0]);
  const expiryDate = normalizeDate(dateMatches[1]);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const fdrNumber = fdrMatch ? fdrMatch[1].replace(/\s/g, "") : null;
  const bankName = bankMatch ? bankMatch[1].trim().replace(/[.,;]$/, "") : null;

  let score = 0;
  if (fdrNumber) score += 30;
  if (bankName) score += 25;
  if (amount) score += 20;
  if (issueDate) score += 12.5;
  if (expiryDate) score += 12.5;

  const issues = [];
  if (!fdrNumber) issues.push("FDR number could not be confidently extracted");
  if (!bankName) issues.push("Bank name could not be confidently extracted");
  if (!amount) issues.push("Deposit amount could not be confidently extracted");
  if (!issueDate || !expiryDate) issues.push("Issue/expiry dates could not both be extracted");
  if (issueDate && expiryDate && new Date(expiryDate) <= new Date(issueDate)) issues.push("Expiry date is not after issue date");

  return { fdrNumber, bankName, amount, issueDate, expiryDate, confidence: Math.round(score), passed: score >= 75 && issues.length === 0, issues };
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, service: "SecureFDR" }); }
  catch { res.status(503).json({ ok: false }); }
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, LOWER($2), $3, 'INSTITUTION') RETURNING id, name, email, role`, [name.trim(), email.trim(), passwordHash]);
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email already registered" });
    console.error(error); res.status(500).json({ error: "Unable to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  const result = await pool.query("SELECT id, name, email, role, password_hash FROM users WHERE email = LOWER($1)", [email.trim()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid email or password" });
  const token = signToken(user); delete user.password_hash;
  await pool.query(`INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, 'LOGIN', 'USER', $2)`, [user.id, JSON.stringify({ role: user.role })]);
  res.json({ accessToken: token, tokenType: "Bearer", user });
});

app.get("/api/me", authenticate, async (req, res) => {
  const result = await pool.query("SELECT id, name, email, role FROM users WHERE id = $1", [req.user.sub]);
  if (!result.rows[0]) return res.status(401).json({ error: "User not found" });
  res.json({ user: result.rows[0] });
});

app.post("/api/fdr/verify-document", authenticate, requireRole("INSTITUTION"), upload.single("document"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload an FDR PDF" });
  try {
    const buffer = fs.readFileSync(req.file.path);
    const parsed = await pdfParse(buffer);
    const extraction = extractFdrFields(parsed.text || "");
    const documentPath = `/api/documents/${path.basename(req.file.path)}`;
    await pool.query(`INSERT INTO document_verifications (user_id, original_filename, stored_path, extracted_data, confidence, passed) VALUES ($1,$2,$3,$4,$5,$6)`, [req.user.sub, req.file.originalname, documentPath, JSON.stringify(extraction), extraction.confidence, extraction.passed]);
    res.json({ message: extraction.passed ? "Document passed the initial automated checks" : "Document needs review or correction", documentPath, extraction });
  } catch (error) {
    try { fs.unlinkSync(req.file.path); } catch {}
    console.error(error); res.status(422).json({ error: "Unable to read or verify this PDF" });
  }
});

app.get("/api/documents/:filename", authenticate, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(uploadDir, filename);
  const result = await pool.query("SELECT user_id FROM document_verifications WHERE stored_path = $1 LIMIT 1", [`/api/documents/${filename}`]);
  if (!result.rows[0]) return res.status(404).json({ error: "Document not found" });
  if (req.user.role === "INSTITUTION" && req.user.sub !== result.rows[0].user_id) return res.status(403).json({ error: "Document access denied" });
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Document file not found" });
  res.sendFile(file);
});

app.post("/api/fdr", authenticate, requireRole("INSTITUTION"), async (req, res) => {
  const { fdrNumber, bankName, amount, issueDate, expiryDate, documentName, documentUrl, verification } = req.body;
  if (!fdrNumber || !bankName || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !issueDate || !expiryDate) return res.status(400).json({ error: "Valid FDR number, bank, amount and dates are required" });
  if (new Date(expiryDate) <= new Date(issueDate)) return res.status(400).json({ error: "Expiry date must be after issue date" });
  const result = await pool.query(`INSERT INTO fdr_records (institution_id, fdr_number, bank_name, amount, issue_date, expiry_date, document_name, document_url, verification_status, verification_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.user.sub, fdrNumber.trim(), bankName.trim(), amount, issueDate, expiryDate, documentName || null, documentUrl || null, verification?.passed ? "AUTO_PASSED" : "NEEDS_REVIEW", verification?.confidence || 0]);
  await pool.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1,'CREATE','FDR',$2,$3)`, [req.user.sub, result.rows[0].id, JSON.stringify({ fdrNumber, verification })]);
  res.status(201).json({ fdr: result.rows[0] });
});

app.get("/api/fdr", authenticate, async (req, res) => {
  const params = [];
  let query = `SELECT f.*, u.name AS institution_name FROM fdr_records f JOIN users u ON u.id = f.institution_id`;
  if (req.user.role === "INSTITUTION") { params.push(req.user.sub); query += " WHERE f.institution_id = $1"; }
  query += " ORDER BY f.created_at DESC";
  const result = await pool.query(query, params);
  res.json({ fdrs: result.rows });
});

app.get("/api/review/queue", authenticate, requireRole("OFFICER", "ADMIN"), async (_req, res) => {
  const result = await pool.query(`SELECT f.*, u.name AS institution_name, u.email AS institution_email FROM fdr_records f JOIN users u ON u.id = f.institution_id WHERE f.status IN ('SUBMITTED','UNDER_REVIEW') ORDER BY f.created_at ASC`);
  res.json({ queue: result.rows });
});

app.get("/api/dashboard", authenticate, async (req, res) => {
  const params = req.user.role === "INSTITUTION" ? [req.user.sub] : [];
  const where = req.user.role === "INSTITUTION" ? "WHERE institution_id = $1" : "";
  const summary = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='VERIFIED')::int AS verified, COUNT(*) FILTER (WHERE status IN ('SUBMITTED','UNDER_REVIEW'))::int AS pending, COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE)::int AS expired, COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring_30, COALESCE(SUM(amount),0)::numeric AS total_value FROM fdr_records ${where}`, params);
  const alerts = await pool.query(`SELECT f.id, f.fdr_number, f.bank_name, f.amount, f.expiry_date, f.status, u.name AS institution_name, CASE WHEN f.expiry_date < CURRENT_DATE THEN 'EXPIRED' ELSE 'EXPIRING_SOON' END AS alert_type, GREATEST(0, (f.expiry_date - CURRENT_DATE))::int AS days_remaining FROM fdr_records f JOIN users u ON u.id=f.institution_id ${req.user.role === "INSTITUTION" ? "WHERE f.institution_id=$1 AND f.expiry_date <= CURRENT_DATE + INTERVAL '30 days'" : "WHERE f.expiry_date <= CURRENT_DATE + INTERVAL '30 days'"} ORDER BY f.expiry_date ASC LIMIT 20`, params);
  res.json({ summary: summary.rows[0], alerts: alerts.rows });
});

app.patch("/api/fdr/:id/status", authenticate, requireRole("OFFICER", "ADMIN"), async (req, res) => {
  const { status, reason } = req.body;
  const allowed = ["UNDER_REVIEW", "VERIFIED", "REJECTED", "EXPIRING", "EXPIRED"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid FDR status" });
  if (status === "REJECTED" && !String(reason || "").trim()) return res.status(400).json({ error: "A rejection reason is required" });
  const result = await pool.query("UPDATE fdr_records SET status = $1, review_reason = $2 WHERE id = $3 RETURNING *", [status, reason ? String(reason).trim() : null, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: "FDR not found" });
  await pool.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1,'STATUS_CHANGE','FDR',$2,$3)`, [req.user.sub, req.params.id, JSON.stringify({ status, reason: reason || null })]);
  res.json({ fdr: result.rows[0] });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "PDF must be 5 MB or smaller" : error.message });
  if (error?.message === "Only PDF FDR documents are allowed") return res.status(400).json({ error: error.message });
  console.error(error); res.status(500).json({ error: "Unexpected server error" });
});

app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SecureFDR API listening on ${port}`));
