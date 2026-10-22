# SecureFDR

## SIH26265 — Streamline of Security Deposit / FDR Portal

SecureFDR is a software-first FDR lifecycle management portal for institutions and reviewing officers.

### MVP flow

Institution registers → logs in → receives a short-lived access token → submits an FDR → officer reviews it → status is updated → every important action is recorded in an audit log.

### Current components

- **Node.js + Express** API
- **PostgreSQL** database
- **JWT access tokens** for API authentication
- **bcrypt** password hashing
- **Role-based authorization** for institutions, officers and administrators
- FDR lifecycle records and status tracking
- Audit logging

### Authentication flow

1. `POST /api/auth/register` creates a user and hashes the password with bcrypt.
2. `POST /api/auth/login` verifies the password hash.
3. The server signs a short-lived JWT containing the user ID, role and email.
4. The client sends `Authorization: Bearer <token>` to protected endpoints.
5. Authentication middleware verifies the JWT signature and expiry.
6. Role middleware restricts institution/officer/admin operations.

### Important security notes

- Never commit a real `.env` file or production secret.
- Replace `JWT_SECRET` with a long random secret in the deployment environment.
- Use HTTPS in production.
- For production, add refresh-token/session rotation, MFA for privileged users, rate limiting, secure document storage, malware scanning for uploads, encryption at rest, stronger password policy, and institution-level authorization checks.
- The current registration endpoint is an MVP convenience; production officer/admin accounts should be provisioned through an approved administrative workflow rather than allowing public self-registration.

### Setup

```bash
npm install
cp .env.example .env
# configure DATABASE_URL and JWT_SECRET
# run schema.sql against PostgreSQL
npm run dev
```
