# SecureFDR

## Security Deposit & FDR Management Portal

SecureFDR is a software-first portal for managing the lifecycle of security deposits and Fixed Deposit Receipts (FDRs) associated with approval and compliance workflows. It is designed for institutions and authorized reviewing officers.

> **Prototype status:** SIH-ready demonstration build. Production deployment requires authorized financial/bank integrations, hardened infrastructure, and formal security/compliance approval.

## Core workflow

```text
Institution submits FDR
        ↓
Document upload & validation
        ↓
Officer review
        ↓
Verification / rejection / correction
        ↓
Lifecycle monitoring
        ↓
90 / 30 / 7-day deadline alerts
        ↓
Renewal / replacement
        ↓
Release / refund request
        ↓
Officer decision
        ↓
Audit trail & reporting
```

## Implemented capabilities

### Institution
- Secure registration and login
- FDR/security-deposit submission
- Bank, amount, issue-date and maturity-date capture
- Certificate upload
- Authenticated document viewing/download
- Renewal workflow
- Replacement workflow
- Release/refund request workflow
- Visibility into verification and lifecycle status

### Authorized officer
- Verification queue
- FDR review modal with institution and instrument details
- Verify / reject / mark-under-review actions
- Mandatory rejection reason
- Verification note and verifier identity
- Discrepancy detection and review
- Duplicate FDR identification
- Officer observation and resolution workflow
- Renewal/replacement review
- Release/refund review
- Audit history

### Compliance & lifecycle management
- Institution-wise and instrument-wise records
- Missing-document checks
- Duplicate FDR detection
- Maturity/expiry monitoring
- 90-day, 30-day and 7-day attention thresholds
- Expired-record identification
- Renewal and replacement history
- Release/refund lifecycle
- Compliance dashboard and report export

### Security controls in the MVP
- bcrypt password hashing
- Short-lived JWT access tokens
- Bearer-token authentication middleware
- Server-side role checks for Institution / Officer / Admin
- Parameterized PostgreSQL queries
- Authenticated document delivery
- Private/no-store document response headers
- Audit logging for authentication, creation, document upload and status changes
- File type and size validation

## Important verification boundary

SecureFDR distinguishes **institution-submitted information** from **officer-verified information**. The prototype does not claim that a bank independently verified an FDR unless an authorized bank/financial verification service is actually integrated.

## Technology

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: bcrypt + JWT
- Deployment: compatible with Node hosting platforms such as Vercel/Render/Railway when configured with PostgreSQL and environment variables

## Project structure

```text
SecureFDR/
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── compliance.js
│   ├── compliance-fix.js
│   ├── renewal-workflow.js
│   ├── lifecycle-workflows.js
│   └── document-actions.js
├── src/
│   ├── schema.sql
│   └── server.js
├── .env.example
├── .gitignore
└── package.json
```

## Local setup

1. Install Node.js and PostgreSQL.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Configure `DATABASE_URL` and a long random `JWT_SECRET`.
5. Run `src/schema.sql` against PostgreSQL.
6. Start with `npm start` or `npm run dev`.
7. Open the deployed/local portal.

## SIH demonstration checklist

Use these records to demonstrate the complete lifecycle:

1. **Normal FDR** — verified and active.
2. **Duplicate FDR** — triggers a discrepancy case.
3. **Missing certificate** — triggers a document alert.
4. **90-day expiry** — renewal-soon state.
5. **30-day expiry** — urgent state.
6. **7-day expiry** — critical state.
7. **Expired FDR** — overdue state.
8. **Renewal** — old and new instrument linked conceptually.
9. **Replacement** — replacement certificate and new instrument details.
10. **Release/refund** — request → officer decision → audit record.

## Production hardening required before government use

- Authorized bank/FDR verification APIs
- Secure object storage instead of database-embedded document data
- Malware scanning and content-disposition hardening for uploads
- MFA for privileged users
- Refresh-token/session rotation and revocation
- Rate limiting and account lockout controls
- Stronger password and account-recovery policy
- Encryption at rest and managed secrets
- Centralized monitoring and incident logging
- Institution-level authorization tests for every protected endpoint
- Backup/restore and disaster-recovery procedures
- Formal security testing and government/AICTE approval

## Scope statement

SecureFDR is a prototype demonstrating the proposed administrative workflow and measurable digitization benefits. It should not be represented as an official AICTE system, an independently bank-verified service, or a production government platform until the required authorization, integration, security and operational controls are completed.
