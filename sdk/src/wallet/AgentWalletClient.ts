/**
 * AgentWalletClient — SDK wrapper for the agent_wallet Soroban contract.
 *
 * Two distinct signing roles:
 *   Owner keypair  → createSession() + revokeSession()  (human-held, Freighter)
 *   Agent keypair  → executePayment()                   (machine key, server-side)
 *
 * XDR pattern:
 *   method() → buildUnsignedXdr() → caller signs → submitSignedXdr() → waitForConfirmation()
 */

import {
  Contract,
  SorobanRpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import {
  buildUnsignedXdr,
  submitSignedXdr,
  waitForConfirmation,
  NETWORK_CONFIG,
  StellarNetwork,
  XDRResult,
  SubmitResult,
} from '../stellar'
import { AgentKitConfig, AgentSession } from '../agent/types'

const STROOPS_PER_USDC = 1e7

export interface CreateSessionParams {
  agentKey: string
  limitPerTx: bigint      // stroops
  limitPerSession: bigint // stroops
  durationLedgers: number
  ownerPublicKey: string
}

export interface ExecutePaymentParams {
  sessionId: bigint
  recipient: string
  amount: bigint          // stroops
  memo: string
  agentPublicKey: string
}

export class AgentWalletClient {
  private readonly network: StellarNetwork
  private readonly contractId: string
  private readonly rpcUrl: string

  constructor(config: AgentKitConfig) {
    this.network    = config.network
    this.contractId = config.agentWalletContractId
    this.rpcUrl     = config.rpcUrl ?? NETWORK_CONFIG[config.network].rpcUrl
  }

  // ---------------------------------------------------------------------------
  // Contract write operations
  // ---------------------------------------------------------------------------

  /**
   * Build unsigned XDR for create_session.
   * Owner signs with Freighter (once per agent session).
   */
  async createSession(params: CreateSessionParams): Promise<XDRResult> {
    return buildUnsignedXdr({
      contractId:    this.contractId,
      functionName:  'create_session',
      args: [
        { type: 'address', value: params.agentKey },
        { type: 'i128',    value: params.limitPerTx },
        { type: 'i128',    value: params.limitPerSession },
        { type: 'u32',     value: params.durationLedgers },
      ],
      network:         this.network,
      rpcUrl:          this.rpcUrl,
      sourcePublicKey: params.ownerPublicKey,
    })
  }

  /**
   * Build unsigned XDR for execute_payment.
   * Agent machine key signs server-side — never exposed to the browser.
   */
  async executePayment(params: ExecutePaymentParams): Promise<XDRResult> {
    return buildUnsignedXdr({
      contractId:    this.contractId,
      functionName:  'execute_payment',
      args: [
        { type: 'u64',     value: params.sessionId },
        { type: 'address', value: params.recipient },
        { type: 'i128',    value: params.amount },
        { type: 'string',  value: params.memo },
      ],
      network:         this.network,
      rpcUrl:          this.rpcUrl,
      sourcePublicKey: params.agentPublicKey,
    })
  }

  /**
   * Build unsigned XDR for revoke_session.
   * Owner signs with Freighter — immediate on-chain effect.
   */
  async revokeSession(sessionId: bigint, ownerPublicKey: string): Promise<XDRResult> {
    return buildUnsignedXdr({
      contractId:    this.contractId,
      functionName:  'revoke_session',
      args: [{ type: 'u64', value: sessionId }],
      network:         this.network,
      rpcUrl:          this.rpcUrl,
      sourcePublicKey: ownerPublicKey,
    })
  }

  /**
   * Submit a signed XDR and wait for on-chain confirmation.
   * Returns the confirmed SubmitResult including returnValue (session ID for createSession).
   */
  async submit(signedXdr: string): Promise<SubmitResult> {
    const res = await submitSignedXdr(signedXdr, this.network, this.rpcUrl)
    if (!res.ok) throw new Error(`Transaction submission failed: ${res.error}`)
    return waitForConfirmation(res.txHash, this.network, this.rpcUrl)
  }

  // ---------------------------------------------------------------------------
  // Contract read operations
  // ---------------------------------------------------------------------------

  /**
   * Fetch current session state from on-chain persistent ledger entries.
   *
   * Constructs the contract data key for Session(session_id) and decodes
   * the returned XDR into an AgentSession.
   */
  async getSession(sessionId: bigint): Promise<AgentSession> {
    const server = new SorobanRpc.Server(this.rpcUrl, { allowHttp: false })

    // Build the contract data ledger key:
    //   key = ScVal::Vec([Symbol("Session"), U64(sessionId)])
    const sessionKey = xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol('Session'),
      xdr.ScVal.scvU64(
        xdr.Uint64.fromString(sessionId.toString()),
      ),
    ])

    const contractDataKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract:   new Contract(this.contractId).address().toScAddress(),
        key:        sessionKey,
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const entries = await server.getLedgerEntries(contractDataKey)
    if (!entries.entries.length) {
      throw new Error(`Session ${sessionId} not found on-chain.`)
    }

    const val = entries.entries[0].val
    // val is a LedgerEntryData — extract the contract data val field
    const scVal = val.contractData().val()
    const raw = scValToNative(scVal) as {
      agent_key:            string
      limit_per_tx:         bigint
      limit_per_session:    bigint
      spent_this_session:   bigint
      expires_at_ledger:    number
      active:               boolean
    }

    return {
      sessionId,
      agentPublicKey:      raw.agent_key,
      limitPerTxUsdc:      Number(raw.limit_per_tx)       / STROOPS_PER_USDC,
      limitPerSessionUsdc: Number(raw.limit_per_session)  / STROOPS_PER_USDC,
      spentUsdc:           Number(raw.spent_this_session) / STROOPS_PER_USDC,
      expiresAtLedger:     raw.expires_at_ledger,
      active:              raw.active,
    }
  }

  /**
   * Fetch the wallet's total lifetime spent amount (i128 stroops → USDC).
   */
  async getTotalSpent(): Promise<number> {
    const server = new SorobanRpc.Server(this.rpcUrl, { allowHttp: false })

    const totalSpentKey = xdr.ScVal.scvSymbol('TotalSpent')
    const contractDataKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract:   new Contract(this.contractId).address().toScAddress(),
        key:        totalSpentKey,
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const entries = await server.getLedgerEntries(contractDataKey)
    if (!entries.entries.length) return 0

    const raw = scValToNative(entries.entries[0].val.contractData().val()) as bigint
    return Number(raw) / STROOPS_PER_USDC
  }
}
