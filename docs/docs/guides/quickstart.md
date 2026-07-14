---
id: quickstart
title: Quickstart
---

# Nexus Intelligence Quickstart

Get an AI agent making Stellar payments in 15 minutes.

## Install

```bash
npm install @nexus-intelligence-xyz/sdk
```

## Create an agent session

```typescript
import { AgentKit } from '@nexus-intelligence-xyz/sdk'

const kit = new AgentKit({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'testnet',
  agentWalletContractId: 'CXXX...',
  defaultLimitPerTxUsdc: 100,
  defaultLimitPerSessionUsdc: 1000,
})

// Human owner creates session — signs once
const session = await kit.createSession({
  agentPublicKey: 'GAGT...',  // agent machine key
  limitPerTxUsdc: 100,
  limitPerSessionUsdc: 1000,
  durationLedgers: 17280,    // ~24 hours
})
```

## LangChain integration

```typescript
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents'
import { ChatPromptTemplate } from 'langchain/prompts'

const tools = kit.getLangChainTools(session.sessionId)
const llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 })

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a financial agent that can send Stellar payments. Always verify amounts and recipients before sending.'],
  ['human', '{input}'],
  ['placeholder', '{agent_scratchpad}'],
])

const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt })
const executor = AgentExecutor.fromAgentAndTools({ agent, tools })

// Agent autonomously handles the payment
await executor.invoke({
  input: 'Pay $50 USDC to GABC...XYZ for invoice INV-2026-001'
})
```

## Security note

Sessions expire automatically and are limited by per-tx and per-session budgets.
Revoke sessions immediately if an agent behaves unexpectedly:

```typescript
await kit.revokeSession(session.sessionId)
```
