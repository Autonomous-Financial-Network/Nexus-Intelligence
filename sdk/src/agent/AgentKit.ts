/**
 * AgentKit — main entry point for Nexus Intelligence.
 *
 * Integrates AI agents with Stellar payments via on-chain spending limits
 * enforced by the agent_wallet Soroban contract.
 *
 * @example — LangChain integration
 * ```typescript
 * import { AgentKit } from '@nexus-intelligence-xyz/sdk'
 * import { ChatOpenAI } from '@langchain/openai'
 * import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents'
 * import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
 *
 * const kit = new AgentKit({
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   network: 'testnet',
 *   agentWalletContractId: process.env.AGENT_WALLET_CONTRACT_ID!,
 *   defaultLimitPerTxUsdc: 100,
 *   defaultLimitPerSessionUsdc: 1000,
 * })
 *
 * // 1. Owner creates session (signs ONCE with Freighter)
 * const { unsignedXdr } = await kit.wallet.createSession({
 *   agentKey: agentMachinePublicKey,
 *   limitPerTx: BigInt(100 * 1e7),
 *   limitPerSession: BigInt(1000 * 1e7),
 *   durationLedgers: 17280,
 *   ownerPublicKey: ownerFreighterKey,
 * })
 * const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
 * const { returnValue } = await kit.wallet.submit(signed)
 * const sessionId = BigInt(returnValue as string)
 *
 * // 2. Agent runs autonomously with tools
 * const tools = kit.getLangChainTools(sessionId)
 * const llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 })
 * const prompt = ChatPromptTemplate.fromMessages([
 *   ['system', 'You are a financial agent. Always check budget before paying.'],
 *   ['human', '{input}'],
 *   new MessagesPlaceholder('agent_scratchpad'),
 * ])
 * const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt })
 * const executor = AgentExecutor.fromAgentAndTools({ agent, tools })
 * await executor.invoke({ input: 'Pay $50 USDC to GABC...XYZ for invoice INV-001' })
 * ```
 */
import { AgentKitConfig, AgentSession } from './types'
import { AgentWalletClient } from '../wallet/AgentWalletClient'
import { NexusToolkit } from '../tools/NexusToolkit'
import { XDRResult, SubmitResult } from '../stellar'

const USDC_DECIMALS  = 7
const STROOPS_PER_USDC = 10 ** USDC_DECIMALS
const LEDGERS_PER_DAY  = 17_280

const toStroops = (usdc: number): bigint =>
  BigInt(Math.round(usdc * STROOPS_PER_USDC))

const fromStroops = (stroops: bigint): number =>
  Number(stroops) / STROOPS_PER_USDC

export interface CreateSessionParams {
  /** Agent machine keypair public key — NEVER the owner's Freighter key */
  agentPublicKey: string
  /** Maximum USDC per single transaction (enforced on-chain) */
  limitPerTxUsdc?: number
  /** Maximum USDC across the entire session (enforced on-chain) */
  limitPerSessionUsdc?: number
  /** Session duration in ledgers (default: 24h = 17280 ledgers) */
  durationLedgers?: number
  /** Owner's Stellar public key — used to build the unsigned XDR */
  ownerPublicKey: string
}

export interface PayParams {
  sessionId:    bigint
  recipient:    string
  amountUsdc:   number
  memo?:        string
  /** Agent machine public key — signs this transaction server-side */
  agentPublicKey: string
}

export interface PayResult {
  /** Transaction hash from Stellar network */
  txHash:       string
  /** Total USDC spent this session after this payment */
  newSpentUsdc: number
  /** Remaining budget in USDC */
  remainingUsdc: number
}

export class AgentKit {
  /** Direct access to the wallet contract client for advanced usage */
  readonly wallet: AgentWalletClient
  /** Direct access to tool definitions for custom agent frameworks */
  readonly tools:  NexusToolkit
  private config:  AgentKitConfig

  constructor(config: AgentKitConfig) {
    this.config = config
    this.wallet = new AgentWalletClient(config)
    this.tools  = new NexusToolkit(config)
  }

  /**
   * Build an unsigned XDR for creating an agent session.
   * The OWNER must sign and submit this — it is NOT signed by the agent machine key.
   *
   * Returns { unsignedXdr } — pass to Freighter's signTransaction(), then call wallet.submit().
   * The session ID is in the submit result's returnValue field.
   *
   * @example
   * const { unsignedXdr } = await kit.buildCreateSession({ agentPublicKey, ownerPublicKey, ... })
   * const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
   * const { returnValue } = await kit.wallet.submit(signed)
   * const sessionId = BigInt(returnValue as string)
   */
  async buildCreateSession(params: CreateSessionParams): Promise<XDRResult> {
    return this.wallet.createSession({
      agentKey:        params.agentPublicKey,
      limitPerTx:      toStroops(params.limitPerTxUsdc      ?? this.config.defaultLimitPerTxUsdc      ?? 100),
      limitPerSession: toStroops(params.limitPerSessionUsdc ?? this.config.defaultLimitPerSessionUsdc ?? 1000),
      durationLedgers: params.durationLedgers ?? this.config.defaultSessionDurationLedgers ?? LEDGERS_PER_DAY,
      ownerPublicKey:  params.ownerPublicKey,
    })
  }

  /**
   * Build an unsigned XDR for a payment within session limits.
   * The AGENT MACHINE KEY signs this — NOT Freighter.
   *
   * This is the hot path called by the AI agent for every payment.
   * The returned unsignedXdr must be signed server-side by the agent keypair:
   *
   * @example
   * // Server-side agent process only
   * const { unsignedXdr } = await kit.buildPay({ sessionId, recipient, amountUsdc: 50, agentPublicKey })
   * const keypair = Keypair.fromSecret(process.env.AGENT_SECRET_KEY!) // server-side only
   * const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase)
   * tx.sign(keypair)
   * const { txHash } = await kit.wallet.submit(tx.toXDR())
   */
  async buildPay(params: PayParams): Promise<XDRResult> {
    console.log(
      `[AgentKit] buildPay — session=${params.sessionId} ` +
      `recipient=${params.recipient} amount=${params.amountUsdc} USDC`
    )
    return this.wallet.executePayment({
      sessionId:      params.sessionId,
      recipient:      params.recipient,
      amount:         toStroops(params.amountUsdc),
      memo:           params.memo ?? '',
      agentPublicKey: params.agentPublicKey,
    })
  }

  /**
   * Convenience method: buildPay() → submit via preloaded agent keypair XDR.
   * Fetches updated session state and returns remaining budget.
   *
   * Note: in production, the signing step (keypair.sign) happens server-side
   * in your agent service — never in the browser. This method is a convenience
   * wrapper that returns the result after the unsigned XDR is passed back to
   * your signing server.
   *
   * WAVE CONTRIBUTION GAP: complete the actual signing flow using
   * @stellar/stellar-sdk Keypair.fromSecret(agentSecretKey).
   */
  async pay(params: PayParams & { signedXdr?: string }): Promise<PayResult> {
    const xdrResult = await this.buildPay(params)

    // If a pre-signed XDR is provided (from the agent signing server), submit it
    const submitResult = params.signedXdr
      ? await this.wallet.submit(params.signedXdr)
      : { txHash: `pending_sign_${Date.now()}`, ledger: 0, ok: true }

    // Fetch updated session to get new spent amount
    const session = await this.wallet.getSession(params.sessionId)
    const newSpentUsdc   = session.spentUsdc
    const remainingUsdc  = session.limitPerSessionUsdc - newSpentUsdc

    console.log(
      `[AgentKit] payment ${submitResult.ok ? 'executed' : 'pending signing'} — ` +
      `${params.amountUsdc} USDC → ${params.recipient} | ` +
      `spent: $${newSpentUsdc} | remaining: $${remainingUsdc}`
    )

    return {
      txHash:       submitResult.txHash,
      newSpentUsdc,
      remainingUsdc,
    }
  }

  /**
   * Build an unsigned XDR for revoking a session.
   * OWNER signs this — immediate on-chain effect.
   *
   * @example
   * const { unsignedXdr } = await kit.buildRevokeSession(sessionId, ownerPublicKey)
   * const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
   * await kit.wallet.submit(signed)
   */
  async buildRevokeSession(sessionId: bigint, ownerPublicKey: string): Promise<XDRResult> {
    console.log(`[AgentKit] buildRevokeSession — session=${sessionId}`)
    return this.wallet.revokeSession(sessionId, ownerPublicKey)
  }

  /**
   * Get current session status including remaining budget.
   */
  async getSessionStatus(sessionId: bigint): Promise<AgentSession & { remainingUsdc: number }> {
    const session = await this.wallet.getSession(sessionId)
    return {
      ...session,
      remainingUsdc: session.limitPerSessionUsdc - session.spentUsdc,
    }
  }

  /**
   * LangChain-compatible tool definitions for this kit.
   * Pass the returned array to createOpenAIFunctionsAgent() or AgentExecutor.
   */
  getLangChainTools(sessionId: bigint) {
    return this.tools.getLangChainTools(sessionId, this)
  }

  /**
   * OpenAI Assistants API v2 tool definitions.
   * Use these with the Assistants API run-polling flow.
   */
  getOpenAIFunctions(sessionId: bigint) {
    return this.tools.getOpenAIFunctions(sessionId)
  }
}
