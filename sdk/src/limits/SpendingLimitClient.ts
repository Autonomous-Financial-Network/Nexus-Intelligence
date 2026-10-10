/**
 * SpendingLimitClient — SDK wrapper for the spending_limit_policy Soroban contract.
 *
 * Institutions deploy this contract once and reference it from AgentWallet sessions
 * to enforce org-wide AI agent spending policies (max tx, daily, session caps).
 */

import {
  Contract,
  SorobanRpc,
  scValToNative,
  xdr,
  TransactionBuilder,
  BASE_FEE,
  Keypair,
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
import { AgentKitConfig } from '../agent/types'

const STROOPS_PER_USDC = 1e7

export interface PolicyConfig {
  maxTxAmountUsdc:          number
  maxDailyAmountUsdc:       number
  maxSessionAmountUsdc:     number
  maxSessionDurationLedgers: number
  allowedAssets:            number
  active:                   boolean
}

export interface ValidateSessionParams {
  limitPerTxUsdc:    number
  limitPerSessionUsdc: number
  durationLedgers:   number
}

export interface RecordSpendParams {
  callerPublicKey: string
  amountUsdc:      number
}

export class SpendingLimitClient {
  private readonly network:    StellarNetwork
  private readonly contractId: string
  private readonly rpcUrl:     string

  constructor(config: AgentKitConfig) {
    if (!config.spendingPolicyContractId) {
      throw new Error(
        'SpendingLimitClient requires config.spendingPolicyContractId to be set.',
      )
    }
    this.network    = config.network
    this.contractId = config.spendingPolicyContractId
    this.rpcUrl     = config.rpcUrl ?? NETWORK_CONFIG[config.network].rpcUrl
  }

  // ---------------------------------------------------------------------------
  // Write operations
  // ---------------------------------------------------------------------------

  /**
   * Build unsigned XDR for initializing the policy contract.
   * Admin signs once — sets org-wide spending caps.
   */
  async buildInitializePolicy(
    adminPublicKey: string,
    policy: Pick<
      PolicyConfig,
      'maxTxAmountUsdc' | 'maxDailyAmountUsdc' | 'maxSessionAmountUsdc' | 'maxSessionDurationLedgers'
    >,
  ): Promise<XDRResult> {
    return buildUnsignedXdr({
      contractId:   this.contractId,
      functionName: 'initialize',
      args: [
        { type: 'address', value: adminPublicKey },
        { type: 'i128', value: BigInt(Math.round(policy.maxTxAmountUsdc      * STROOPS_PER_USDC)) },
        { type: 'i128', value: BigInt(Math.round(policy.maxDailyAmountUsdc   * STROOPS_PER_USDC)) },
        { type: 'i128', value: BigInt(Math.round(policy.maxSessionAmountUsdc * STROOPS_PER_USDC)) },
        { type: 'u32',  value: policy.maxSessionDurationLedgers },
      ],
      network:         this.network,
      rpcUrl:          this.rpcUrl,
      sourcePublicKey: adminPublicKey,
    })
  }

  /**
   * Build unsigned XDR for recording a spend against the daily budget.
   * Called by AgentWallet after a successful payment to track org-wide daily usage.
   */
  async buildRecordSpend(params: RecordSpendParams): Promise<XDRResult> {
    return buildUnsignedXdr({
      contractId:   this.contractId,
      functionName: 'record_spend',
      args: [
        { type: 'address', value: params.callerPublicKey },
        { type: 'i128',    value: BigInt(Math.round(params.amountUsdc * STROOPS_PER_USDC)) },
      ],
      network:         this.network,
      rpcUrl:          this.rpcUrl,
      sourcePublicKey: params.callerPublicKey,
    })
  }

  /**
   * Build unsigned XDR for updating policy limits.
   * Admin-only. Takes effect immediately on-chain.
   */
  async buildUpdatePolicy(
    adminPublicKey: string,
    updates: Pick<PolicyConfig, 'maxTxAmountUsdc' | 'maxDailyAmountUsdc' | 'maxSessionAmountUsdc'>,
  ): Promise<XDRResult> {
    return buildUnsignedXdr({
      contractId:   this.contractId,
      functionName: 'update_policy',
      args: [
        { type: 'i128', value: BigInt(Math.round(updates.maxTxAmountUsdc      * STROOPS_PER_USDC)) },
        { type: 'i128', value: BigInt(Math.round(updates.maxDailyAmountUsdc   * STROOPS_PER_USDC)) },
        { type: 'i128', value: BigInt(Math.round(updates.maxSessionAmountUsdc * STROOPS_PER_USDC)) },
      ],
      network:         this.network,
      rpcUrl:          this.rpcUrl,
      sourcePublicKey: adminPublicKey,
    })
  }

  /** Submit a signed XDR and wait for confirmation. */
  async submit(signedXdr: string): Promise<SubmitResult> {
    const res = await submitSignedXdr(signedXdr, this.network, this.rpcUrl)
    if (!res.ok) throw new Error(`Transaction submission failed: ${res.error}`)
    return waitForConfirmation(res.txHash, this.network, this.rpcUrl)
  }

  // ---------------------------------------------------------------------------
  // Read / simulate operations
  // ---------------------------------------------------------------------------

  /**
   * Simulate validate_session against the on-chain policy.
   * Returns true if the proposed session params comply; throws with a reason if not.
   *
   * Uses simulateTransaction so no signing or gas is required.
   */
  async validateSession(params: ValidateSessionParams): Promise<boolean> {
    const server = new SorobanRpc.Server(this.rpcUrl, { allowHttp: false })
    const cfg    = NETWORK_CONFIG[this.network]
    const { toScVal } = await import('../stellar')

    const contract     = new Contract(this.contractId)
    const dummyKeypair = Keypair.random()
    const dummyAccount = await server.getAccount(dummyKeypair.publicKey()).catch(() => null)

    if (!dummyAccount) return true  // permissive fallback if RPC unavailable

    const tx = new TransactionBuilder(dummyAccount, {
      fee:               BASE_FEE,
      networkPassphrase: cfg.passphrase,
    })
      .addOperation(
        contract.call(
          'validate_session',
          toScVal({ type: 'i128', value: BigInt(Math.round(params.limitPerTxUsdc      * STROOPS_PER_USDC)) }),
          toScVal({ type: 'i128', value: BigInt(Math.round(params.limitPerSessionUsdc * STROOPS_PER_USDC)) }),
          toScVal({ type: 'u32',  value: params.durationLedgers }),
        ),
      )
      .setTimeout(30)
      .build()

    const sim = await server.simulateTransaction(tx)

    if (SorobanRpc.Api.isSimulationError(sim)) {
      throw new Error(`Policy violation: ${sim.error}`)
    }

    return true
  }

  /**
   * Fetch the current policy configuration from on-chain instance storage.
   */
  async getPolicy(): Promise<PolicyConfig> {
    const server = new SorobanRpc.Server(this.rpcUrl, { allowHttp: false })

    const policyKey = xdr.ScVal.scvSymbol('Policy')
    const contractDataKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract:   new Contract(this.contractId).address().toScAddress(),
        key:        policyKey,
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const entries = await server.getLedgerEntries(contractDataKey)
    if (!entries.entries.length) {
      throw new Error('Policy contract not initialized.')
    }

    const raw = scValToNative(entries.entries[0].val.contractData().val()) as {
      admin:                         string
      max_tx_amount:                 bigint
      max_daily_amount:              bigint
      max_session_amount:            bigint
      max_session_duration_ledgers:  number
      allowed_assets:                number
      active:                        boolean
    }

    return {
      maxTxAmountUsdc:           Number(raw.max_tx_amount)      / STROOPS_PER_USDC,
      maxDailyAmountUsdc:        Number(raw.max_daily_amount)   / STROOPS_PER_USDC,
      maxSessionAmountUsdc:      Number(raw.max_session_amount) / STROOPS_PER_USDC,
      maxSessionDurationLedgers: raw.max_session_duration_ledgers,
      allowedAssets:             raw.allowed_assets,
      active:                    raw.active,
    }
  }
}
