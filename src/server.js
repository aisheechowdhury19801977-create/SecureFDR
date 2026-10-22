require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
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

function validateDocument(documentUrl) {
  if (!documentUrl) return { ok: true };
  if (typeof documentUrl !== "string") return { ok: false, error: "Invalid certificate data" };
  if (!/^data:(application\/pdf|image\/jpeg|image\/png);base64,/i.test(documentUrl)) {
    return { ok: false, error: "Certificate must be a PDF, JPG or PNG" };
  }
  if (documentUrl.length > 1500000) return { ok: false, error: "Certificate is too large" };
  return { ok: true };
}

async function ensureVerificationColumns() {
  await pool.query(`
    ALTER TABLE fdr_records
      ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verification_note TEXT
  `);
}

app.get("/health", async (_req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ ok: false, error: "DATABASE_URL is not configured" });
  try {
    await pool.query("SELECT 1");
    await ensureVerificationColumns();
    res.json({ ok: true, service: "SecureFDR" });
  } catch (error) {
    console.error("Database health check failed:", error);
    res.status(503).json({ ok: false, error: "Database connection failed" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database is not configured on the server" });
  if (!process.env.JWT_SECRET) return res.status(503).json({ error: "JWT_SECRET is not configured on the server" });

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, 'INSTITUTION')
       RETURNING id, name, email, role`,
      [name.trim(), email.trim(), passwordHash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email already registered" });
    console.error("Registration database error:", error);
    if (error.code === "42P01") return res.status(503).json({ error: "Database schema is not initialized. Run src/schema.sql." });
    res.status(500).json({ error: "Unable to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database is not configured on the server" });
  if (!process.env.JWT_SECRET) return res.status(503).json({ error: "JWT_SECRET is not configured on the server" });

  try {
    const result = await pool.query(
      "SELECT id, name, email, role, password_hash FROM users WHERE email = LOWER($1)",
      [email.trim()]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user);
    delete user.password_hash;
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, details)
       VALUES ($1, 'LOGIN', 'USER', $2)`,
      [user.id, JSON.stringify({ role: user.role })]
    );
    res.json({ accessToken: token, tokenType: "Bearer", user });
  } catch (error) {
    console.error("Login database error:", error);
    if (error.code === "42P01") return res.status(503).json({ error: "Database schema is not initialized. Run src/schema.sql." });
    res.status(500).json({ error: "Unable to sign in" });
  }
});

app.get("/api/me", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, role FROM users WHERE id = $1", [req.user.sub]);
    if (!result.rows[0]) return res.status(401).json({ error: "User not found" });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Me database error:", error);
    res.status(500).json({ error: "Unable to load user" });
  }
});

app.post("/api/fdr", authenticate, requireRole("INSTITUTION"), async (req, res) => {
  const { fdrNumber, bankName, amount, issueDate, expiryDate, documentName, documentUrl } = req.body;
  if (!fdrNumber || !bankName || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !issueDate || !expiryDate) {
    return res.status(400).json({ error: "Valid FDR number, bank, amount and dates are required" });
  }
  if (new Date(expiryDate) <= new Date(issueDate)) return res.status(400).json({ error: "Expiry date must be after issue date" });
  const documentCheck = validateDocument(documentUrl);
  if (!documentCheck.ok) return res.status(400).json({ error: documentCheck.error });

  try {
    const result = await pool.query(
      `INSERT INTO fdr_records
        (institution_id, fdr_number, bank_name, amount, issue_date, expiry_date, document_name, document_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.sub, fdrNumber.trim(), bankName.trim(), amount, issueDate, expiryDate, documentName || null, documentUrl || null]
    );
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1,'CREATE','FDR',$2,$3)`,
      [req.user.sub, result.rows[0].id, JSON.stringify({ fdrNumber })]
    );
    res.status(201).json({ fdr: result.rows[0] });
  } catch (error) {
    console.error("FDR creation database error:", error);
    if (error.code === "42P01") return res.status(503).json({ error: "Database schema is not initialized. Run src/schema.sql." });
    res.status(500).json({ error: "Unable to submit FDR" });
  }
});

app.patch("/api/fdr/:id/document", authenticate, requireRole("INSTITUTION", "ADMIN"), async (req, res) => {
  const { documentName, documentUrl } = req.body;
  if (!documentUrl) return res.status(400).json({ error: "Certificate file is required" });
  const documentCheck = validateDocument(documentUrl);
  if (!documentCheck.ok) return res.status(400).json({ error: documentCheck.error });

  try {
    const result = req.user.role === "ADMIN"
      ? await pool.query(
          `UPDATE fdr_records SET document_name = $1, document_url = $2 WHERE id = $3 RETURNING *`,
          [documentName || "FDR_certificate", documentUrl, req.params.id]
        )
      : await pool.query(
          `UPDATE fdr_records SET document_name = $1, document_url = $2
           WHERE id = $3 AND institution_id = $4 RETURNING *`,
          [documentName || "FDR_certificate", documentUrl, req.params.id, req.user.sub]
        );

    if (!result.rows[0]) return res.status(404).json({ error: "FDR not found" });
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1,'DOCUMENT_UPLOAD','FDR',$2,$3)`,
      [req.user.sub, req.params.id, JSON.stringify({ documentName: documentName || "FDR_certificate" })]
    );
    res.json({ fdr: result.rows[0] });
  } catch (error) {
    console.error("FDR document upload database error:", error);
    if (error.code === "42P01") return res.status(503).json({ error: "Database schema is not initialized. Run src/schema.sql." });
    res.status(500).json({ error: "Unable to attach certificate" });
  }
});

app.get("/api/fdr", authenticate, async (req, res) => {
  try {
    await ensureVerificationColumns();

    const params = [];
    let query = `SELECT f.*, u.name AS institution_name, u.email AS institution_email,
                        v.name AS verified_by_name, v.email AS verified_by_email
                 FROM fdr_records f
                 JOIN users u ON u.id = f.institution_id
                 LEFT JOIN users v ON v.id = f.verified_by`;
    if (req.user.role === "INSTITUTION") {
      params.push(req.user.sub);
      query += " WHERE f.institution_id = $1";
    }
    query += " ORDER BY f.created_at DESC";
    const result = await pool.query(query, params);
    res.json({ fdrs: result.rows });
  } catch (error) {
    console.error("FDR list database error:", error);
    if (error.code === "42P01") return res.status(503).json({ error: "Database schema is not initialized. Run src/schema.sql." });
    if (error.code === "42703") return res.status(503).json({ error: "Database verification columns are missing. Refresh the deployment and retry." });
    res.status(500).json({ error: "Unable to load FDR records" });
  }
});

app.patch("/api/fdr/:id/status", authenticate, requireRole("OFFICER", "ADMIN"), async (req, res) => {
  const { status, note } = req.body;
  const allowed = ["UNDER_REVIEW", "VERIFIED", "REJECTED"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid verification status" });

  try {
    await ensureVerificationColumns();

    const current = await pool.query("SELECT * FROM fdr_records WHERE id = $1", [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: "FDR not found" });

    const existing = current.rows[0];
    if (["VERIFIED", "REJECTED"].includes(existing.status)) {
      return res.status(409).json({ error: `FDR is already ${existing.status.toLowerCase()}` });
    }
    if (status === "REJECTED" && !String(note || "").trim()) {
      return res.status(400).json({ error: "A rejection reason is required" });
    }

    const cleanNote = String(note || "").trim().slice(0, 1000) || null;
    const result = status === "VERIFIED" || status === "REJECTED"
      ? await pool.query(
          `UPDATE fdr_records
           SET status = $1, verified_by = $2, verified_at = NOW(), verification_note = $3
           WHERE id = $4 RETURNING *`,
          [status, req.user.sub, cleanNote, req.params.id]
        )
      : await pool.query(
          "UPDATE fdr_records SET status = $1 WHERE id = $2 RETURNING *",
          [status, req.params.id]
        );

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1,'STATUS_CHANGE','FDR',$2,$3)`,
      [req.user.sub, req.params.id, JSON.stringify({ status, note: cleanNote })]
    );
    res.json({ fdr: result.rows[0] });
  } catch (error) {
    console.error("FDR status database error:", error);
    if (error.code === "42P01") return res.status(503).json({ error: "Database schema is not initialized. Run src/schema.sql." });
    if (error.code === "42703") return res.status(503).json({ error: "Database verification columns are missing. Run the updated src/schema.sql." });
    res.status(500).json({ error: "Unable to update FDR status" });
  }
});

app.get("/api/audit", authenticate, requireRole("OFFICER", "ADMIN"), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
              u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 50`
    );
    res.json({ logs: result.rows });
  } catch (error) {
    console.error("Audit database error:", error);
    res.status(500).json({ error: "Unable to load audit trail" });
  }
});

app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SecureFDR API listening on ${port}`));
