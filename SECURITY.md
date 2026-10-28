# Security Policy

## Scope
SecureFDR is a prototype for SIH demonstration and is not an official AICTE or bank system.

The project handles sensitive institutional and financial-instrument information, so production deployment must use approved infrastructure and security controls.

## Security principles
- Role-based access: Institution, Officer and Admin permissions must be enforced server-side.
- Authentication: passwords are hashed; authenticated API access uses short-lived access tokens.
- Authorization: protected records and documents must be checked against the authenticated user's role and ownership/administrative scope.
- Data protection: production deployments should use TLS, encryption at rest and managed secrets.
- Document security: uploads must be type/size validated, malware scanned and stored outside the web root in private object storage.
- Auditability: security-sensitive actions must be recorded with actor, timestamp, entity and action details.
- Least privilege: service accounts and database users should receive only required permissions.
- Monitoring: production deployments should collect security events and alert on suspicious activity.

## Production requirements before real financial/government use
1. HTTPS/TLS enforced everywhere.
2. MFA for Officer/Admin accounts.
3. Refresh-token rotation/revocation or equivalent secure session management.
4. Rate limiting, brute-force protection and account lockout.
5. CSRF protection where cookie-based authentication is used.
6. Strict CORS and security headers (CSP, HSTS, X-Content-Type-Options, frame protection).
7. Malware/content scanning for uploaded documents.
8. Private encrypted object storage with signed, short-lived download URLs.
9. Centralized secrets management; no credentials in source code.
10. Database encryption/backups, restore testing and disaster recovery.
11. Dependency, SAST/DAST and penetration testing.
12. Formal authorization for AICTE and bank integrations.

## Bank verification
The prototype may use a sandbox/mock adapter for demonstrations. A production verification result must only be marked independently bank-confirmed when it is returned by an authorized bank/financial-service integration.

## Responsible disclosure
Do not publish credentials, personal data, FDR documents or exploit details in public issues. Report suspected vulnerabilities privately to the project maintainers with reproduction steps and impact information.
