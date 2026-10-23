# SecureFDR — SIH Test Plan

## Authentication
- [ ] Valid institution login succeeds.
- [ ] Invalid password is rejected.
- [ ] Passwords are not stored in plaintext.
- [ ] Officer/Admin endpoints reject institution tokens.
- [ ] Expired/invalid JWT is rejected.

## FDR submission
- [ ] FDR number is required.
- [ ] Bank is required.
- [ ] Amount must be positive.
- [ ] Expiry must be after issue date.
- [ ] PDF/JPG/PNG validation works.
- [ ] Oversized document is rejected.
- [ ] Institution sees its own FDR after submission.

## Officer verification
- [ ] New FDR appears in queue.
- [ ] Review shows institution, bank, amount, dates and certificate.
- [ ] Officer can mark under review.
- [ ] Verification records officer and timestamp.
- [ ] Rejection requires a reason.
- [ ] Final verified/rejected record cannot be silently changed.

## Compliance/lifecycle
- [ ] Duplicate FDRs are grouped as one discrepancy case.
- [ ] Missing-document cases are visible.
- [ ] Renewal workflow preserves the previous instrument reference.
- [ ] Replacement workflow preserves the lifecycle history.
- [ ] Release/refund request can be reviewed and recorded.
- [ ] Expiry windows identify 90/30/7-day attention cases.

## Auditability
- [ ] Login creates an audit entry.
- [ ] FDR creation creates an audit entry.
- [ ] Document upload creates an audit entry.
- [ ] Status changes create an audit entry.
- [ ] Officer decision is attributable to a user and timestamp.

## Security / production gate
- [ ] HTTPS enabled.
- [ ] Production DATABASE_URL and JWT secret are configured outside source control.
- [ ] Private object storage is used for production documents.
- [ ] Malware scanning is enabled for uploaded documents.
- [ ] MFA is enabled for privileged users.
- [ ] Rate limiting is enabled.
- [ ] Backup and restore procedure is tested.
- [ ] Security review is completed before government production use.

## SIH demo acceptance
A clean demo should complete: institution submission → officer review → discrepancy handling → verification → lifecycle monitoring → renewal/replacement or release/refund → audit history.
