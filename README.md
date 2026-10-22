# SecureFDR

## SIH26265 — Streamline of Security Deposit / FDR Portal

SecureFDR is a software-first FDR lifecycle management portal for institutions and reviewing officers. This branch is the **SIH26265 MVP**.

## What is implemented

- Responsive web dashboard
- Institution registration and login
- bcrypt password hashing
- Short-lived JWT access tokens
- Bearer-token authentication middleware
- Role-based authorization for Institution / Officer / Admin
- FDR submission and validation
- Officer/Admin status updates
- Audit logging for login, creation and status changes
- PostgreSQL schema and indexes
- Expiry/status fields ready for alert automation

## Request flow

```text
Browser
  │
  ├── POST /api/auth/register ──> bcrypt hash ──> PostgreSQL
  │
  ├── POST /api/auth/login ─────> bcrypt verify ─> JWT access token
  │                                      │
  │                                      └── Authorization: Bearer <token>
  │
  └── Protected FDR request ──> JWT middleware ──> role check ──> PostgreSQL
                                                     │
                                                     └── audit log
```

## Project structure

```text
SecureFDR/
├── public/
│   ├── index.html       # Login + dashboard UI
│   ├── styles.css       # Responsive portal styling
│   └── app.js           # Browser API client and dashboard logic
├── src/
│   ├── schema.sql       # PostgreSQL tables/indexes
│   └── server.js        # Express API, auth and FDR workflow
├── .env.example
├── .gitignore
└── package.json
```

## Run locally

1. Install Node.js and PostgreSQL.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a real `DATABASE_URL` and long random `JWT_SECRET`.
5. Run `src/schema.sql` against the PostgreSQL database.
6. Start with `npm run dev`.
7. Open `http://localhost:3000`.

Example:

```bash
npm install
cp .env.example .env
npm run dev
```

## Security notes

- Never commit `.env` or production credentials.
- Use HTTPS in production.
- Public registration creates Institution accounts only; Officer/Admin accounts should be provisioned through an approved administrative workflow.
- For production, add refresh-token/session rotation, MFA for privileged users, rate limiting, secure object storage, malware scanning for uploaded documents, encryption at rest, stronger password policy, and institution-level authorization checks.

## Next SIH build

1. Real FDR PDF upload and secure object storage.
2. OCR/data extraction from uploaded FDR documents.
3. AI-assisted field validation and anomaly detection.
4. Officer review queue with approve/reject reasons.
5. Automated expiry reminders and escalation alerts.
6. Institution-wise and national dashboards.
7. Demo seed data and SIH presentation/prototype assets.
