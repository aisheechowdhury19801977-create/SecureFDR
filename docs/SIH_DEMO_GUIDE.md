# SecureFDR — SIH Demo Guide

## 1. Demo objective
Demonstrate the complete lifecycle of an AICTE security deposit/FDR record without claiming live bank verification.

## 2. Recommended 3-minute flow

### 0:00–0:25 — Problem
Institutions submit security deposits/FDRs, while officers need a reliable view of documents, validity, discrepancies, renewal/replacement actions and release/refund requests.

### 0:25–0:50 — Solution
Introduce SecureFDR as a centralized, role-based portal for institutions and authorized officers.

### 0:50–1:25 — Institution journey
1. Sign in as Institution.
2. Submit an FDR with number, bank, amount, issue date and expiry date.
3. Upload the FDR certificate.
4. Show the new record and its submitted status.

### 1:25–2:10 — Officer journey
1. Sign in as Officer.
2. Open the verification queue.
3. Review the FDR and certificate.
4. Demonstrate a discrepancy case such as a duplicate FDR number.
5. Record an officer observation.
6. Resolve, request correction, or reject according to the demo scenario.
7. Verify a clean record.

### 2:10–2:40 — Lifecycle
Show the compliance/lifecycle area and demonstrate renewal, replacement, maturity monitoring and release/refund request handling.

### 2:40–3:00 — Governance and impact
Show audit history, role-based access, secure document delivery and reporting. Close with measurable goals: fewer manual trackers, faster scrutiny, better deadline visibility and traceable decisions.

## 3. Demo data scenarios

| Scenario | Expected result |
|---|---|
| Clean FDR | Submitted → Officer review → Verified |
| Missing certificate | Missing-document warning |
| Duplicate FDR number | One discrepancy case affecting multiple records |
| Expiry ≤ 90 days | Renewal attention |
| Expiry ≤ 30 days | Urgent renewal attention |
| Expiry ≤ 7 days | Critical alert |
| Expired FDR | Expired status / follow-up |
| Renewal | New instrument linked to previous lifecycle |
| Replacement | Replacement instrument tracked with history |
| Release/refund | Request → officer decision → audit record |

## 4. Judge-facing claims

Use these claims:
- "The prototype supports the FDR lifecycle from submission through verification and follow-up."
- "Institution-submitted information is distinguished from officer-verified information."
- "The system is designed for authorized bank verification integration where an approved service is available."

Do not claim that the prototype is connected to a bank verification API unless such an authorized integration has actually been configured.
