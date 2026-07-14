/**
 * AgentWalletClient — SDK for the nexus-intelligence-xyz agent_wallet Soroban contract.
 *
 * Two distinct signing roles:
 *   - Owner keypair  → createSession() + revokeSession()  (human-held, Freighter)
 *   - Agent keypair  → executePayment()                   (machine key, server-side)
 *
 * XDR pattern:
 *   method() → buildUnsignedXdr() → caller/agent signs → submitSignedXdr()
 */
import { buildUnsignedXdr, submitSignedXdr, waitForConfirmation, StellarNetwork, XDRResult, SubmitResult } from '../stellar'
import { AgentKitConfig, AgentSession } from '../agent/types'

const STROOPS_PER_USDC = 10_000_000n
const LEDGERS_PER_DAY  = 17_280

export interface CreateSessionParams {
  agentKey:         string
  limitPerTx:       bigint  // in stroops
  limitPerSession:  bigint  // in stroops
  durationLedgers:  number
  ownerPublicKey:   string  // owner signs this tx
}

export interface ExecutePaymentParams {
  sessionId:        bigint
  recipient:        string
  amount:           bigint  // in stroops
  memo:             string
  agentPublicKey:   string  // agent machine key signs this tx
}

export class AgentWalletClient {
  private network: StellarNetwork
  private contractId: string
  private rpcUrl?: string

  constructor(config: AgentKitConfig) {
    this.network    = config.network
    this.contractId = config.agentWalletContractId
    this.rpcUrl     = config.rpcUrl
  }

  /**
   * Owner creates a new agent session with on-chain spending caps.
   * Returns unsigned XDR — owner must sign with Freighter (human action, done once).
   *
   * After this is called the owner should store the returned sessionId
   * and provide it to the agent for subsequent payments.
   *
   * @example
   * const { unsignedXdr } = await client.createSession({
   *   agentKey: agentMachinePublicKey,
   *   limitPerTx: 500_0000000n,        // 500 USDC
   *   limitPerSession: 5000_0000000n,  // 5000 USDC total
   *   durationLedgers: 17280,          // 24h
   *   ownerPublicKey: ownerFreighterKey,
   * })
   * const signed = await freighter.signTransaction(unsignedXdr, { network: 'TESTNET' })
   * const { txHash, returnValue } = await client.submit(signed)
   * const sessionId = BigInt(returnValue as string)
   */
  async createSession(params: CreateSessionParams): Promise<XDRResult> {
    console.log(
      `[AgentWalletClient] createSession — agent=${params.agentKey} ` +
      `limitPerTx=${Number(params.limitPerTx) / 1e7} USDC ` +
      `limitPerSession=${Number(params.limitPerSession) / 1e7} USDC`
    )

    return buildUnsignedXdr({
      contractId: this.contractId,
      functionName: 'create_session',
      args: [
        { type: 'address', value: params.agentKey },
        { type: 'i128',    value: params.limitPerTx },
        { type: 'i128',    value: params.limitPerSession },
        { type: 'u32',     value: params.durationLedgers },
      ],
      network: this.network,
      rpcUrl:  this.rpcUrl,
      sourcePublicKey: params.ownerPublicKey,
    })
  }

  /**
   * Agent executes a payment within session limits.
   * Returns unsigned XDR — signed by the agent machine keypair (NO Freighter, server-side only).
   *
   * This is the hot path called autonomously by the AI agent for every payment.
   * The agent machine key must be configured as a server-side secret — it MUST NOT
   * be exposed to the browser or any client-side code.
   *
   * @example
   * // Server-side only (agent machine)
   * const { unsignedXdr } = await client.executePayment({
   *   sessionId: session.sessionId,
   *   recipient: 'GABC...',
   *   amount: 50_0000000n,  // 50 USDC
   *   memo: 'INV-2026-001',
   *   agentPublicKey: agentMachineKey,
   * })
   * const keypair = Keypair.fromSecret(process.env.AGENT_SECRET_KEY)
   * const signed = transaction.sign(keypair) // @stellar/stellar-sdk
   * const { txHash } = await client.submit(signed.toXDR())
   */
  async executePayment(params: ExecutePaymentParams): Promise<XDRResult> {
    const amountUsdc = Number(params.amount) / 1e7
    console.log(
      `[AgentWalletClient] executePayment — session=${params.sessionId} ` +
      `recipient=${params.recipient} amount=${amountUsdc} USDC`
    )

    return buildUnsignedXdr({
      contractId: this.contractId,
      functionName: 'execute_payment',
      args: [
        { type: 'u64',     value: params.sessionId },
        { type: 'address', value: params.recipient },
        { type: 'i128',    value: params.amount },
        { type: 'string',  value: params.memo },
      ],
      network: this.network,
      rpcUrl:  this.rpcUrl,
      sourcePublicKey: params.agentPublicKey,
    })
  }

  /**
   * Owner revokes a session immediately. All future payments from that session will fail.
   * Returns unsigned XDR — owner must sign with Freighter.
   */
  async revokeSession(sessionId: bigint, ownerPublicKey: string): Promise<XDRResult> {
    console.log(`[AgentWalletClient] revokeSession — session=${sessionId}`)
    return buildUnsignedXdr({
      contractId: this.contractId,
      functionName: 'revoke_session',
      args: [{ type: 'u64', value: sessionId }],
      network: this.network,
      rpcUrl:  this.rpcUrl,
      sourcePublicKey: ownerPublicKey,
    })
  }

  /** Submit a signed XDR and wait for ledger confirmation. */
  async submit(signedXdr: string): Promise<SubmitResult> {
    const res = await submitSignedXdr(signedXdr, this.network, this.rpcUrl)
    if (!res.ok) throw new Error(`Transaction failed: ${res.error}`)
    return waitForConfirmation(res.txHash, this.network, this.rpcUrl)
  }

  /**
   * Fetch current session state from on-chain ledger entries.
   *
   * Real impl:
   *   const sessionKey = xdr.ScVal.scvVec([
   *     xdr.ScVal.scvSymbol('Session'),
   *     xdr.ScVal.scvU64(xdr.Uint64.fromString(sessionId.toString()))
   *   ])
   *   const entries = await server.getLedgerEntries(contractDataKey(contractId, sessionKey))
   *   return decodeSessionXdr(entries[0].val)
   */
  async getSession(sessionId: bigint): Promise<AgentSession> {
    console.log(`[AgentWalletClient] getSession — session=${sessionId}`)
    // WAVE CONTRIBUTION GAP — Real impl: getLedgerEntries + XDR decode
    return {
      sessionId,
      agentPublicKey:     'G...',
      limitPerTxUsdc:     100,
      limitPerSessionUsdc: 1000,
      spentUsdc:          0,
      expiresAtLedger:    0,
      active:             true,
    }
  }
}
