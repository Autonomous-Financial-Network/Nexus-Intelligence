# Nexus-Intelligence
Nexus Intelligence is an early-stage, open-source infrastructure project for giving AI agents the ability to autonomously make USDC payments on the Stellar blockchain — without the risk of the agent holding full wallet control.

The Core Problem It Solves
If you give an LLM-driven agent a full Stellar secret key, a single prompt injection can drain the account — there's no on-chain backstop. Nexus Intelligence's answer is a hard separation of roles:

The owner (a human using Freighter wallet) signs once to open a time- and amount-bounded session
The agent gets its own separate machine keypair that can only spend within that session's limits
Limits (per-transaction and per-session) are enforced on-chain by a Soroban smart contract, not just client-side logic that can be bypassed
Tech Stack
It's a monorepo with four components:

Component	Tech	Purpose
contracts/	Rust · Soroban SDK	On-chain agent_wallet smart contract that enforces spending sessions
sdk/	TypeScript · @stellar/stellar-sdk	AgentKit — the developer-facing SDK
frontend/	React 18 · Vite · Tailwind	Interactive playground to test agent prompts and simulate transactions
docs/	Docusaurus 3	Security framework guides and API reference
How It Works
Owner creates a session — signs one transaction via Freighter that registers the agent's machine key on-chain with specific limits (e.g., max $100/tx, max $1,000/session, expires in 24h)
Agent runs autonomously — uses its machine key to call execute_payment on the contract; the contract rejects anything that exceeds the limits
Owner can revoke — one transaction immediately invalidates the session; all future payments fail
SDK Surface (AgentKit)
The SDK ships ready-made tool definitions for two major AI frameworks:

LangChain — getLangChainTools(sessionId) returns DynamicStructuredTool-compatible definitions
OpenAI function calling — getOpenAIFunctions(sessionId) returns the function schema
The three agent tools available are stellar_payment, stellar_get_balance, and stellar_get_session_status.

Current Status
The project is honest about where it stands — everything in the task backlog is currently marked Open. The session/payment flow is scaffolded and the Soroban contract has tests, but the DeFi tool library (swaps, staking, lending), multi-sig wallet support, and the full playground UI are not yet built. No agent is managing real funds in production.

It participates in the Stellar Drips Wave program, which means contributors can pick up point-weighted tasks from WAVE_TASKS.md and earn rewards on merge. Licensed under Apache 2.0.
