export interface AgentKitConfig {
  /** Stellar RPC endpoint */
  rpcUrl: string
  network: 'mainnet' | 'testnet'
  /** Contract IDs */
  agentWalletContractId: string
  spendingPolicyContractId?: string
  /** Session constraints */
  defaultLimitPerTxUsdc?: number
  defaultLimitPerSessionUsdc?: number
  defaultSessionDurationLedgers?: number
}

export interface AgentSession {
  sessionId: bigint
  agentPublicKey: string
  limitPerTxUsdc: number
  limitPerSessionUsdc: number
  spentUsdc: number
  expiresAtLedger: number
  active: boolean
}

export interface PaymentTool {
  name: 'stellar_payment'
  description: string
  parameters: {
    recipient: string
    amountUsdc: number
    memo?: string
    sessionId: bigint
  }
}

export interface ContractCallTool {
  name: 'stellar_contract_call'
  description: string
  parameters: {
    contractId: string
    functionName: string
    args: unknown[]
    sessionId: bigint
  }
}
