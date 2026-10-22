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
- FDR PDF upload (5 MB, PDF only)
- Automated PDF text extraction and field verification
- FDR number, bank, amount and date extraction
- Verification confidence score and review flags
- Officer/Admin status updates
- Audit logging for login, document verification, creation and status changes
- PostgreSQL schema and indexes
- Expiry/status fields ready for alert automation

## Document verification flow

```text
Institution
   │
   ├── Upload FDR PDF
   │        ↓
   │   PDF text extraction
   │        ↓
   │   Field extraction
   │   (FDR no. / bank / amount / dates)
   │        ↓
   │   Consistency checks
   │        ↓
   ├── Confidence score + issues
   │        ↓
   └── Submit corrected/verified fields
             ↓
       Officer review queue
```

The current verifier is a deterministic MVP parser and consistency checker. It is deliberately **not** presented as a production AI/fraud detector. The next layer can replace or augment extraction with OCR and an AI validation service.

## Authentication request flow

```text
Browser
  │
  ├── POST /api/auth/register ──> bcrypt hash ──> PostgreSQL
  │
  ├── POST /api/auth/login ─────> bcrypt verify ─> JWT access token
  │                                      │
  │                                      └── Authorization: Bearer <token>
  │
  └── Protected request ────────> JWT middleware ──> role check ──> PostgreSQL
                                                         │
                                                         └── audit log
```

## Project structure

```text
SecureFDR/
├── public/
│   ├── index.html       # Login, upload and dashboard UI
│   ├── styles.css       # Responsive portal styling
│   └── app.js           # Browser API client and dashboard logic
├── src/
│   ├── schema.sql       # PostgreSQL tables/indexes
│   └── server.js        # Express API, auth, upload and verification workflow
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
- Uploaded PDFs are excluded from Git via `.gitignore`.
- Use HTTPS in production.
- Public registration creates Institution accounts only; Officer/Admin accounts should be provisioned through an approved administrative workflow.
- The MVP stores uploads on local disk. Production should use private object storage with signed access URLs, malware scanning, encryption at rest and retention controls.
- For production, add refresh-token/session rotation, MFA for privileged users, rate limiting, stronger password policy, institution-level authorization checks, and tamper-resistant audit storage.

## Next SIH build

1. OCR fallback for scanned/image-only FDR PDFs.
2. AI-assisted field validation and anomaly detection.
3. Officer review queue with approve/reject reasons.
4. Automated expiry reminders and escalation alerts.
5. Institution-wise and national dashboards.
6. Demo seed data and SIH presentation/prototype assets.
