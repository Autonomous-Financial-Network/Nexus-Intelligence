---
id: langchain-quickstart
title: LangChain Quickstart
sidebar_label: LangChain Quickstart
---

# LangChain Quickstart — AI Agent Payments in 15 Minutes

This guide walks through integrating Nexus Intelligence with LangChain to create an AI agent that can autonomously make Stellar payments within hard on-chain spending limits.

## Prerequisites

```bash
npm install @nexus-intelligence-xyz/sdk langchain @langchain/openai
```

You'll also need:
- A deployed `agent_wallet` contract on testnet (see [contract deployment](../api/contracts.md))
- An OpenAI API key
- A Stellar testnet account with XLM for fees

## Step 1: Create an agent session

The owner creates a session once — this is the only human-signed step.

```typescript
import { AgentKit } from '@nexus-intelligence-xyz/sdk'

const kit = new AgentKit({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'testnet',
  agentWalletContractId: process.env.AGENT_WALLET_CONTRACT_ID!,
})

// Owner creates a session (signs with Freighter or owner keypair)
const { unsignedXdr } = await kit.wallet.createSession({
  agentKey: process.env.AGENT_PUBLIC_KEY!,   // machine key
  limitPerTx:      BigInt(100 * 1e7),        // 100 USDC per transaction
  limitPerSession: BigInt(1000 * 1e7),       // 1000 USDC total this session
  durationLedgers: 17280,                    // 24 hours
  ownerPublicKey: ownerPublicKey,
})

// Sign with owner Freighter wallet — ONCE
const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
const { returnValue } = await kit.wallet.submit(signed)
const sessionId = BigInt(returnValue as string)

console.log(`Session created: ${sessionId}`)
```

## Step 2: Build a LangChain agent

```typescript
import { ChatOpenAI } from '@langchain/openai'
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'

// Get Stellar payment tools for this session
const tools = kit.getLangChainTools(sessionId)

const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
})

const prompt = ChatPromptTemplate.fromMessages([
  ['system', `You are a financial agent with the ability to make Stellar payments.
Always check your session budget before making payments.
Never send more than your per-transaction limit.
Confirm recipient address and amount before every payment.`],
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
])

const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt })
const executor = AgentExecutor.fromAgentAndTools({ agent, tools, verbose: true })
```

## Step 3: Run the agent

```typescript
// The agent autonomously handles the payment flow
const result = await executor.invoke({
  input: 'Pay $50 USDC to GABC...XYZ for invoice INV-2026-001. First check my budget.',
})

console.log(result.output)
// → "I checked your session budget: $1000 limit, $0 spent, $1000 remaining.
//    I have sent $50 USDC to GABC...XYZ with memo 'INV-2026-001'.
//    Transaction hash: txhash_abc123"
```

## Step 4: Emergency revoke

If the agent behaves unexpectedly, the owner can revoke the session instantly:

```typescript
const { unsignedXdr } = await kit.wallet.revokeSession(sessionId, ownerPublicKey)
const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
await kit.wallet.submit(signed)
console.log('Session revoked — all future agent payments will fail on-chain')
```

## Security checklist

- [ ] Agent machine keypair stored server-side only (never in browser or `.env` committed to git)
- [ ] Per-tx limit ≤ single largest legitimate payment expected
- [ ] Session limit ≤ total weekly/daily budget for the use case
- [ ] Monitoring alert set up on session spend via [Lumina Vision](https://github.com/lumina-vision) events
- [ ] Revoke procedure documented and tested before production deployment
