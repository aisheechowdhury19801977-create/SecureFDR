# SecureFDR

## Security Deposit & FDR Management Portal — SIH26265

SecureFDR is a software-first portal for managing the complete lifecycle of security deposits and Fixed Deposit Receipts (FDRs) associated with approval and compliance workflows. It is designed for institutions and authorized reviewing officers.

> **Prototype status:** SIH-ready demonstration build. Production deployment requires authorized financial/bank integrations, hardened infrastructure, and formal security/compliance approval.

## Problem statement alignment

SecureFDR is aligned to the AICTE SIH problem statement for streamlining security deposit/FDR administration. The implementation covers the major lifecycle requirements without claiming unsupported bank-side verification.

## Core workflow

```text
Institution submission
        ↓
Document upload & validation
        ↓
Officer scrutiny
        ↓
Verification / rejection / correction
        ↓
Discrepancy & duplicate detection
        ↓
Maturity monitoring + 90/30/7-day attention thresholds
        ↓
Renewal / replacement with linked history
        ↓
Release / refund request
        ↓
Competent-authority decision workflow
        ↓
Audit trail + compliance reporting
```

## Implemented capabilities

### Institution
- Secure registration and login
- FDR/security-deposit submission
- Bank, amount, issue-date and maturity-date capture
- PDF/JPG/PNG certificate upload and validation
- Authenticated document viewing/download
- Renewal workflow with old/new instrument relationship
- Replacement workflow with old/new instrument relationship
- Release/refund request submission with reason, amount and reference number
- Visibility into verification and lifecycle status

### Authorized officer
- Verification queue
- FDR review modal with institution and instrument details
- Verify / reject / mark-under-review actions
- Mandatory rejection reason
- Verification note and verifier identity/timestamp
- Discrepancy detection and review
- Duplicate FDR identification
- Officer observation and discrepancy resolution workflow
- Renewal/replacement lifecycle history
- Release/refund decision queue with approve/reject/complete actions
- Audit history

### Compliance & lifecycle management
- Institution-wise and instrument-wise records
- Missing-document checks
- Duplicate FDR detection
- Invalid-date detection
- Maturity/expiry monitoring
- 90-day, 30-day and 7-day attention thresholds
- Expired-record identification
- Renewal and replacement history stored in PostgreSQL
- Release/refund requests stored in PostgreSQL
- Discrepancy cases stored and resolved through officer workflow
- Compliance summary API
- Compliance dashboard and CSV report export

### Security controls in the MVP
- bcrypt password hashing
- Short-lived JWT access tokens
- Bearer-token authentication middleware
- Server-side role checks for Institution / Officer / Admin
- Parameterized PostgreSQL queries
- Authenticated document delivery
- Private/no-store document response headers
- Audit logging for authentication, creation, document upload, verification, lifecycle actions and decisions
- File type and size validation

## Verification boundary

SecureFDR distinguishes **institution-submitted information** from **officer-verified information**. The prototype does not claim that a bank independently verified an FDR unless an authorized bank/financial verification service is actually integrated.

The compliance layer can identify missing data, duplicate instrument numbers, invalid dates and approaching deadlines. Bank-side authenticity remains an integration boundary requiring an authorized financial source.

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
│   ├── ai-verification.js
│   ├── compliance.js
│   ├── compliance-fix.js
│   ├── discrepancy-review.js
│   ├── renewal-workflow.js
│   ├── lifecycle-workflows.js
│   ├── workflow-center.js
│   └── document-actions.js
├── src/
│   ├── schema.sql
│   └── server.js
├── docs/
├── .env.example
├── .gitignore
└── package.json
```

## SIH demonstration checklist

Use these records to demonstrate the complete lifecycle:

1. **Normal FDR** — verified and active.
2. **Duplicate FDR** — discrepancy detection identifies the repeated instrument number.
3. **Missing certificate** — document alert appears.
4. **Invalid dates** — compliance check flags an inconsistent validity period.
5. **90-day expiry** — renewal-soon state.
6. **30-day expiry** — urgent state.
7. **7-day expiry** — critical state.
8. **Expired FDR** — overdue state.
9. **Renewal** — new instrument submitted and linked to the old instrument.
10. **Replacement** — replacement certificate submitted and linked to the old instrument.
11. **Release/refund** — request → officer review → decision → audit record.
12. **Discrepancy resolution** — open → under review → resolved/dismissed.

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
