# Secure Deployment Checklist

Use this checklist before deploying SecureFDR beyond a local/SIH prototype.

## Network
- [ ] HTTPS/TLS only
- [ ] HSTS enabled
- [ ] Secure DNS and trusted certificates
- [ ] Database not publicly exposed
- [ ] Firewall/security-group rules restrict database access

## Authentication and authorization
- [ ] MFA enabled for Officer/Admin
- [ ] Strong password policy
- [ ] Login rate limiting and lockout
- [ ] Short-lived access tokens
- [ ] Refresh-token rotation/revocation or secure server sessions
- [ ] Server-side role and institution-scope authorization on every protected route
- [ ] Admin account provisioning is controlled

## Documents
- [ ] Upload allowlist enforced by MIME type and file signature
- [ ] File size limits enforced
- [ ] Malware/antivirus scanning
- [ ] Private object storage outside the web root
- [ ] Encryption at rest
- [ ] Short-lived signed download URLs
- [ ] Safe Content-Disposition and Content-Type headers
- [ ] No executable content accepted

## Application security
- [ ] Strict CORS allowlist
- [ ] Content Security Policy
- [ ] X-Frame-Options/frame-ancestors protection
- [ ] X-Content-Type-Options: nosniff
- [ ] Secure cookies if cookies are introduced
- [ ] CSRF protection for cookie-authenticated state changes
- [ ] Input validation on every API boundary
- [ ] Parameterized SQL queries
- [ ] Dependency vulnerability scanning
- [ ] SAST/DAST testing

## Data and operations
- [ ] Encryption at rest
- [ ] Managed secrets, never source-controlled credentials
- [ ] Automated backups
- [ ] Restore drill completed
- [ ] Disaster-recovery plan
- [ ] Centralized security logging
- [ ] Alerting for suspicious authentication and privileged actions
- [ ] Log retention policy

## External integrations
- [ ] AICTE integration formally authorized
- [ ] Bank verification integration formally authorized
- [ ] Bank verification responses are cryptographically/authentically attributable to the provider
- [ ] Institution-submitted data is visibly separated from independently verified data

## SIH prototype disclosure
The demo must clearly state that sandbox bank verification is a prototype integration and must not be represented as a live bank or official AICTE connection.
