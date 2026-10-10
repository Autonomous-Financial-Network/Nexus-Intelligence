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
 * const { unsignedXdr } = await kit.buildCreateSession({
 *   agentPublicKey: agentMachinePublicKey,
 *   ownerPublicKey: ownerFreighterKey,
 * })
 * const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
 * const { returnValue } = await kit.wallet.submit(signed)
 * const sessionId = BigInt(returnValue as string)
 *
 * // 2. Agent runs autonomously with tools
 * const tools = kit.getLangChainTools(sessionId)
 * const llm   = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 })
 * const prompt = ChatPromptTemplate.fromMessages([
 *   ['system', 'You are a financial agent. Always check budget before paying.'],
 *   ['human', '{input}'],
 *   new MessagesPlaceholder('agent_scratchpad'),
 * ])
 * const agent    = await createOpenAIFunctionsAgent({ llm, tools, prompt })
 * const executor = AgentExecutor.fromAgentAndTools({ agent, tools })
 * await executor.invoke({ input: 'Pay $50 USDC to GABC...XYZ for invoice INV-001' })
 * ```
 */

import { AgentKitConfig, AgentSession } from './types'
import { AgentWalletClient } from '../wallet/AgentWalletClient'
import { NexusToolkit } from '../tools/StellarToolkit'
import { TxHistoryService, TxRecord, TxHistorySummary } from '../history/TxHistoryService'
import { validatePaymentParams } from '../utils'
import { XDRResult, SubmitResult } from '../stellar'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDC_DECIMALS     = 7
const STROOPS_PER_USDC  = 10 ** USDC_DECIMALS
const LEDGERS_PER_DAY   = 17_280

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toStroops  = (usdc: number): bigint =>
  BigInt(Math.round(usdc * STROOPS_PER_USDC))

// ---------------------------------------------------------------------------
// Public param/result types
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  /** Agent machine keypair public key — NEVER the owner's Freighter key */
  agentPublicKey:       string
  /** Max USDC per single transaction (enforced on-chain) */
  limitPerTxUsdc?:      number
  /** Max USDC across the entire session (enforced on-chain) */
  limitPerSessionUsdc?: number
  /** Session duration in ledgers (default: 24 h = 17 280 ledgers) */
  durationLedgers?:     number
  /** Owner's Stellar public key — source of the unsigned XDR */
  ownerPublicKey:       string
}

export interface PayParams {
  sessionId:      bigint
  recipient:      string
  amountUsdc:     number
  memo?:          string
  /** Agent machine public key — signs server-side */
  agentPublicKey: string
}

export interface PathPaymentParams {
  sessionId:      bigint
  agentPublicKey: string
  recipient:      string
  /** e.g. "XLM" or "USDC:GA5ZSEJ..." */
  sendAsset:      string
  receiveAsset:   string
  /** Exact amount the recipient receives */
  receiveAmount:  number
  /** Maximum the agent will send (slippage guard) */
  sendMaxAmount:  number
  memo?:          string
}

export interface PayResult {
  txHash:        string
  newSpentUsdc:  number
  remainingUsdc: number
}

// ---------------------------------------------------------------------------
// AgentKit
// ---------------------------------------------------------------------------

export class AgentKit {
  /** Direct access to the wallet contract client */
  readonly wallet:   AgentWalletClient
  /** Direct access to tool definitions */
  readonly tools:    NexusToolkit
  /** Payment history for this kit instance */
  readonly history:  TxHistoryService

  private readonly config: AgentKitConfig

  constructor(config: AgentKitConfig) {
    this.config  = config
    this.wallet  = new AgentWalletClient(config)
    this.tools   = new NexusToolkit(config)
    this.history = new TxHistoryService({ network: config.network, rpcUrl: config.rpcUrl })
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  /**
   * Build unsigned XDR for creating an agent session.
   * Owner signs with Freighter — session ID is in submit result's returnValue.
   *
   * @example
   * const { unsignedXdr } = await kit.buildCreateSession({ agentPublicKey, ownerPublicKey })
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
   * Build unsigned XDR for revoking a session.
   * Owner signs with Freighter — immediate on-chain effect.
   */
  async buildRevokeSession(sessionId: bigint, ownerPublicKey: string): Promise<XDRResult> {
    return this.wallet.revokeSession(sessionId, ownerPublicKey)
  }

  /**
   * Fetch current session state including remaining budget.
   */
  async getSessionStatus(sessionId: bigint): Promise<AgentSession & { remainingUsdc: number }> {
    const session = await this.wallet.getSession(sessionId)
    return {
      ...session,
      remainingUsdc: Math.max(0, session.limitPerSessionUsdc - session.spentUsdc),
    }
  }

  // ---------------------------------------------------------------------------
  // Payment operations
  // ---------------------------------------------------------------------------

  /**
   * Build unsigned XDR for a direct USDC payment within session limits.
   * Agent machine key signs server-side — NEVER in the browser.
   *
   * Validates all payment constraints client-side before building the XDR
   * so errors are caught early without spending a transaction fee.
   *
   * @example
   * const { unsignedXdr } = await kit.buildPay({ sessionId, recipient, amountUsdc: 50, agentPublicKey })
   * const keypair = Keypair.fromSecret(process.env.AGENT_SECRET_KEY!)
   * const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase)
   * tx.sign(keypair)
   * const { txHash } = await kit.wallet.submit(tx.toXDR())
   */
  async buildPay(params: PayParams): Promise<XDRResult> {
    const session = await this.wallet.getSession(params.sessionId)

    const { valid, errors } = validatePaymentParams({
      recipient:      params.recipient,
      amountUsdc:     params.amountUsdc,
      session,
      agentPublicKey: params.agentPublicKey,
    })

    if (!valid) {
      return {
        unsignedXdr:  '',
        simulatedFee: '0',
        ok:           false,
        error:        errors.join(' | '),
      }
    }

    return this.wallet.executePayment({
      sessionId:      params.sessionId,
      recipient:      params.recipient,
      amount:         toStroops(params.amountUsdc),
      memo:           params.memo ?? '',
      agentPublicKey: params.agentPublicKey,
    })
  }

  /**
   * Full payment flow: validate → build XDR → submit (if signedXdr provided) → record history.
   *
   * If signedXdr is omitted the call returns a pending entry — sign server-side and
   * call wallet.submit() manually, then call history.updateStatus() with the result.
   */
  async pay(params: PayParams & { signedXdr?: string }): Promise<PayResult> {
    const xdrResult = await this.buildPay(params)

    if (!xdrResult.ok) {
      this.history.record({
        sessionId:  params.sessionId,
        recipient:  params.recipient,
        amountUsdc: params.amountUsdc,
        memo:       params.memo ?? '',
        txHash:     '',
        status:     'denied',
      })
      throw new Error(xdrResult.error ?? 'Payment XDR build failed')
    }

    let submitResult: SubmitResult | null = null

    if (params.signedXdr) {
      submitResult = await this.wallet.submit(params.signedXdr)
      this.history.record({
        sessionId:  params.sessionId,
        recipient:  params.recipient,
        amountUsdc: params.amountUsdc,
        memo:       params.memo ?? '',
        txHash:     submitResult.txHash,
        status:     submitResult.ok ? 'success' : 'failed',
      })
    } else {
      this.history.record({
        sessionId:  params.sessionId,
        recipient:  params.recipient,
        amountUsdc: params.amountUsdc,
        memo:       params.memo ?? '',
        txHash:     xdrResult.unsignedXdr.slice(0, 16),  // placeholder until signed
        status:     'pending',
      })
    }

    const session      = await this.wallet.getSession(params.sessionId)
    const newSpentUsdc  = session.spentUsdc
    const remainingUsdc = Math.max(0, session.limitPerSessionUsdc - newSpentUsdc)

    return {
      txHash:        submitResult?.txHash ?? `pending_${Date.now()}`,
      newSpentUsdc,
      remainingUsdc,
    }
  }

  // ---------------------------------------------------------------------------
  // Path payment
  // ---------------------------------------------------------------------------

  /**
   * Build unsigned XDR for a cross-asset path payment via Stellar SDEX.
   * Uses pathPaymentStrictReceive — recipient gets exactly receiveAmount.
   * Agent machine key signs server-side.
   */
  async buildPathPayment(params: PathPaymentParams): Promise<{ unsignedXdr: string; ok: boolean; error?: string }> {
    return this.tools.buildPathPaymentXdr(params)
  }

  // ---------------------------------------------------------------------------
  // History helpers
  // ---------------------------------------------------------------------------

  /** All payment records for this kit instance. */
  getPaymentHistory(): readonly TxRecord[] {
    return this.history.getAll()
  }

  /** Summary statistics across all or a specific session's payments. */
  getHistorySummary(sessionId?: bigint): TxHistorySummary {
    return this.history.getSummary(sessionId)
  }

  // ---------------------------------------------------------------------------
  // Tool adapters
  // ---------------------------------------------------------------------------

  /** LangChain DynamicStructuredTool-compatible definitions. */
  getLangChainTools(sessionId: bigint) {
    return this.tools.getLangChainTools(sessionId, this)
  }

  /** OpenAI Assistants API v2 function definitions. */
  getOpenAIFunctions(sessionId: bigint) {
    return this.tools.getOpenAIFunctions(sessionId)
  }
}
