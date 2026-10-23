# SecureFDR — System Architecture

## High-level architecture

```text
Institution / Officer / Admin Browser
                |
                | HTTPS + Bearer JWT
                v
        Express REST API
        |      |       |
        |      |       +--> Role authorization
        |      +----------> Audit logging
        +-----------------> FDR workflow / document access
                |
                v
           PostgreSQL
        | users
        | fdr_records
        | audit_logs
                |
                v
     Secure document storage layer
     (prototype storage; production should use
      private object storage + malware scanning)
```

## Main components

### Frontend
- Responsive HTML/CSS/JavaScript portal.
- Institution submission dashboard.
- Officer verification queue.
- Review and decision modals.
- Compliance/lifecycle UI.
- Document view/download actions.

### API
- Express server.
- Authentication with bcrypt password hashes.
- Short-lived JWT access tokens.
- Role checks for Institution, Officer and Admin.
- FDR submission, document access and status updates.
- Audit logging.

### Data layer
PostgreSQL stores users, FDR records and audit logs. The current schema indexes institution, expiry and verification fields for common portal queries.

### Security boundary
- Institutions can access their own records.
- Officer/Admin roles perform verification actions.
- Certificate delivery requires authentication and authorization.
- Production deployment should add private object storage, encryption at rest, malware scanning, MFA for privileged roles, rate limiting, backups and centralized security monitoring.

## Future integration points
- Authorized bank/FDR verification services.
- OCR/document extraction.
- Notification gateway for email/SMS/in-app alerts.
- Existing AICTE systems where formally authorized.
