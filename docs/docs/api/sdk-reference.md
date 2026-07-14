---
id: sdk-reference
title: SDK Reference
---

# AgentKit SDK Reference

## AgentKit

### `new AgentKit(config)`

| Option | Type | Description |
|--------|------|-------------|
| `rpcUrl` | string | Stellar RPC endpoint |
| `network` | mainnet \| testnet | Network selection |
| `agentWalletContractId` | string | Deployed AgentWallet contract |
| `defaultLimitPerTxUsdc` | number | Default per-tx cap (optional) |
| `defaultLimitPerSessionUsdc` | number | Default session cap (optional) |

### `createSession(params)` → `AgentSession`
Creates an on-chain session. Owner must sign.

### `pay(params)` → `{ txHash, newSpentUsdc }`
Executes a payment within session limits. Agent key signs.

### `getLangChainTools(sessionId)` → `Tool[]`
Returns LangChain-compatible tool array.

### `getOpenAIFunctions(sessionId)` → `FunctionDef[]`
Returns OpenAI function calling definitions.

### `revokeSession(sessionId)` → `void`
Immediately revokes a session. Owner must sign.
