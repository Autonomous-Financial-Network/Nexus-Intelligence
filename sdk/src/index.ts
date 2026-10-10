// Core SDK
export { AgentKit }                            from './agent/AgentKit'
export type { CreateSessionParams, PayParams, PathPaymentParams, PayResult } from './agent/AgentKit'

// Wallet contract client
export { AgentWalletClient }                   from './wallet/AgentWalletClient'
export type { CreateSessionParams as WalletCreateSessionParams, ExecutePaymentParams } from './wallet/AgentWalletClient'

// Spending limit contract client
export { SpendingLimitClient }                 from './limits/SpendingLimitClient'
export type { PolicyConfig, ValidateSessionParams, RecordSpendParams } from './limits/SpendingLimitClient'

// Tool definitions
export { NexusToolkit }                        from './tools/StellarToolkit'
export type { ToolResult }                     from './tools/StellarToolkit'

// Transaction history
export { TxHistoryService }                    from './history/TxHistoryService'
export type { TxRecord, TxStatus, TxHistorySummary, RecordParams } from './history/TxHistoryService'

// Balance fetching
export { fetchBalances, getUsdcBalance, clearBalanceCaches } from './tools/balance_telemetry'
export type { BalanceResult, AssetBalance, BalanceFetchError, FetchBalancesOptions } from './tools/balance_telemetry'

// Eliza framework adapter
export { elizaAdapter, elizaAdapterSingle }    from './tools/eliza_adapter'
export type { ElizaActionSchema, ElizaParameterSchema, LangChainToolLike } from './tools/eliza_adapter'

// Stellar utilities
export { buildUnsignedXdr, submitSignedXdr, waitForConfirmation, getCurrentLedger, toScVal, NETWORK_CONFIG } from './stellar'
export type { StellarNetwork, XDRResult, SubmitResult, ScValArg, InvokeParams, NetworkConfig } from './stellar'

// Pure helpers
export {
  isValidStellarAddress,
  usdcToStroops,
  stroopsToUsdc,
  isSessionExpired,
  sessionSecondsRemaining,
  validatePaymentParams,
  formatSessionStatus,
} from './utils'
export type { PaymentValidationResult, PaymentValidationParams, FormattedSessionStatus } from './utils'

// Core config/session types
export type { AgentKitConfig, AgentSession, PaymentTool } from './agent/types'
