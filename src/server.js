require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role = "INSTITUTION" } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  if (!["INSTITUTION", "OFFICER", "ADMIN"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, $4)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const result = await pool.query(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = LOWER($1)",
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user);
  delete user.password_hash;

  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, details)
     VALUES ($1, $2, $3, $4)`,
    [user.id, "LOGIN", "USER", JSON.stringify({ role: user.role })]
  );

  res.json({ accessToken: token, tokenType: "Bearer", user });
});

app.get("/api/me", authenticate, async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [req.user.sub]
  );

  if (!result.rows[0]) return res.status(401).json({ error: "User not found" });
  res.json({ user: result.rows[0] });
});

app.post("/api/fdr", authenticate, requireRole("INSTITUTION"), async (req, res) => {
  const { fdrNumber, bankName, amount, issueDate, expiryDate, documentName, documentUrl } = req.body;

  if (!fdrNumber || !bankName || !amount || !issueDate || !expiryDate) {
    return res.status(400).json({ error: "Required FDR fields are missing" });
  }

  const result = await pool.query(
    `INSERT INTO fdr_records
      (institution_id, fdr_number, bank_name, amount, issue_date, expiry_date, document_name, document_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [req.user.sub, fdrNumber, bankName, amount, issueDate, expiryDate, documentName || null, documentUrl || null]
  );

  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.user.sub, "CREATE", "FDR", result.rows[0].id, JSON.stringify({ fdrNumber })]
  );

  res.status(201).json({ fdr: result.rows[0] });
});

app.get("/api/fdr", authenticate, async (req, res) => {
  const params = [];
  let query = `SELECT * FROM fdr_records`;

  if (req.user.role === "INSTITUTION") {
    params.push(req.user.sub);
    query += " WHERE institution_id = $1";
  }

  query += " ORDER BY created_at DESC";
  const result = await pool.query(query, params);
  res.json({ fdrs: result.rows });
});

app.patch("/api/fdr/:id/status", authenticate, requireRole("OFFICER", "ADMIN"), async (req, res) => {
  const { status } = req.body;
  const allowed = ["UNDER_REVIEW", "VERIFIED", "REJECTED", "EXPIRING", "EXPIRED"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid FDR status" });
  }

  const result = await pool.query(
    "UPDATE fdr_records SET status = $1 WHERE id = $2 RETURNING *",
    [status, req.params.id]
  );

  if (!result.rows[0]) return res.status(404).json({ error: "FDR not found" });

  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.user.sub, "STATUS_CHANGE", "FDR", req.params.id, JSON.stringify({ status })]
  );

  res.json({ fdr: result.rows[0] });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SecureFDR API listening on ${port}`));
