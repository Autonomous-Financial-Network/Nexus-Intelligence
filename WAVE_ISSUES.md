# Nexus Intelligence — Wave Program Issues

## contracts

### [HIGH] Implement real InvokeContractOp signing in AgentWalletClient
Client currently logs placeholder. Needs @stellar/stellar-sdk: build InvokeContractOp for create_session() and execute_payment() with proper XDR arg encoding and Freighter/keypair signing.
**Complexity:** High | **Points:** 200

### [HIGH] Implement SpendingLimitPolicy on-chain validation call in SDK
SpendingLimitClient.validateSession() is a stub. Needs real simulateTransaction RPC call against the deployed policy contract before session creation.
**Complexity:** High | **Points:** 200

### [MEDIUM] Add contract fuzz harnesses for edge cases
Fuzz: execute_payment at exactly limit_per_tx, at limit_per_session, one-over each boundary, expired session.
**Complexity:** Medium | **Points:** 150

### [TRIVIAL] Deploy contracts to testnet and publish contract IDs
**Complexity:** Trivial | **Points:** 100

## sdk

### [HIGH] Real LangChain DynamicStructuredTool integration test
End-to-end test with actual LangChain AgentExecutor and mocked LLM responses verifying tool dispatch, payment execution, and error handling.
**Complexity:** High | **Points:** 200

### [HIGH] OpenAI Assistants API integration (function calling v2)
The current tools target legacy function calling. Needs update for OpenAI Assistants API v2 tool definitions and run-polling flow.
**Complexity:** High | **Points:** 200

### [MEDIUM] Multi-hop payment routing tool
New tool: stellar_path_payment that finds the best path across SDEX and executes a path payment — useful for cross-currency agent payments.
**Complexity:** Medium | **Points:** 150

### [MEDIUM] Agent transaction history query tool
New tool: stellar_get_payment_history that queries Lumina API for all payments made in a session — lets agents report on their own activity.
**Complexity:** Medium | **Points:** 150

### [TRIVIAL] npm publish GitHub Action for @nexus-intelligence-xyz/sdk
**Complexity:** Trivial | **Points:** 100

## frontend

### [HIGH] Real WebSocket event feed — show live on-chain events for session payments
Connect to Lumina /events/stream, filter by agent wallet contract, display real confirmed payments in the log panel.
**Complexity:** High | **Points:** 200

### [MEDIUM] Session analytics panel — spending chart over time
Recharts bar chart showing spending per tool call within the session, with limit threshold line.
**Complexity:** Medium | **Points:** 150

### [TRIVIAL] Mobile responsive layout
**Complexity:** Trivial | **Points:** 100

## docs

### [HIGH] LangGraph multi-agent workflow tutorial
Show two agents collaborating: one that identifies invoices (via Lumina), one that pays them (via AgentKit). Uses LangGraph for agent coordination.
**Complexity:** High | **Points:** 200

### [MEDIUM] CrewAI integration guide
**Complexity:** Medium | **Points:** 150

### [TRIVIAL] Portuguese translation of quickstart guide
**Complexity:** Trivial | **Points:** 100
