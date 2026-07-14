---
id: security
title: Agent Security Design
---

# Agent Security Design

## Principle of least privilege

Every agent session has two spending caps enforced on-chain by the AgentWallet contract:

- **Per-transaction limit**: the maximum any single payment can be
- **Per-session limit**: the total the agent can spend before needing re-authorisation

An agent that is compromised, hallucinating, or making errors cannot exceed these caps
regardless of what instructions it receives.

## Session lifecycle

```
Owner creates session (signs once)
  → Agent operates autonomously within limits
  → Session expires at timeout_ledger
  OR
  → Owner revokes immediately if needed
```

## Key separation

- **Owner keypair**: human-controlled, Freighter or hardware wallet. Signs session creation and revocation only.
- **Agent keypair**: machine key stored server-side. Signs individual payment transactions within the session.

Never use the same keypair for both roles.

## Audit trail

Every payment emits a Soroban event `(payment, session_id, recipient) → (amount, memo)`.
Use Lumina to query the full payment history for any session.
