export interface AgentKitConfig {
  /** Stellar Soroban RPC endpoint */
  rpcUrl: string
  /** Network to target */
  network: 'mainnet' | 'testnet'
  /** Deployed agent_wallet contract ID */
  agentWalletContractId: string
  /** Optional deployed spending_limit_policy contract ID */
  spendingPolicyContractId?: string
  /** Default per-transaction limit in USDC (used when not specified per-session) */
  defaultLimitPerTxUsdc?: number
  /** Default per-session total limit in USDC */
  defaultLimitPerSessionUsdc?: number
  /** Default session duration in ledgers (17 280 ≈ 24 h) */
  defaultSessionDurationLedgers?: number
}

export interface AgentSession {
  sessionId:           bigint
  agentPublicKey:      string
  limitPerTxUsdc:      number
  limitPerSessionUsdc: number
  spentUsdc:           number
  expiresAtLedger:     number
  active:              boolean
}

export interface PaymentTool {
  name: 'stellar_payment'
  description: string
  parameters: {
    recipient:      string
    amountUsdc:     number
    memo?:          string
    sessionId:      bigint
  }
}

export interface ContractCallTool {
  name: 'stellar_contract_call'
  description: string
  parameters: {
    contractId:   string
    functionName: string
    args:         unknown[]
    sessionId:    bigint
  }
}
