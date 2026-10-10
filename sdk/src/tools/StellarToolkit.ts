/**
 * NexusToolkit — AI agent tool definitions for Stellar operations.
 *
 * Generates LangChain DynamicStructuredTool-compatible definitions and
 * OpenAI function-calling schemas. All payment tools are session-scoped
 * and enforce spending limits via the on-chain AgentWallet contract.
 *
 * Tools:
 *   stellar_payment           — direct USDC payment to a recipient
 *   stellar_path_payment      — cross-asset path payment via SDEX
 *   stellar_get_balance       — fetch USDC / any asset balance
 *   stellar_get_session_status — check remaining budget for the session
 */

import { AgentKitConfig } from '../agent/types'
import { isValidStellarAddress } from '../utils'
import { fetchBalances } from './balance_telemetry'
import { NETWORK_CONFIG, StellarNetwork } from '../stellar'
import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  Asset,
  Operation,
  Memo,
} from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

interface PathPaymentParams {
  sessionId:      bigint
  agentPublicKey: string
  recipient:      string
  /** Asset the agent sends (e.g. "XLM" or "USDC:GABCD...") */
  sendAsset:      string
  /** Asset the recipient receives */
  receiveAsset:   string
  /** Exact amount the recipient receives */
  receiveAmount:  number
  /** Maximum amount the agent will send (slippage guard) */
  sendMaxAmount:  number
  memo?:          string
}

// ---------------------------------------------------------------------------
// Asset parsing helper
// ---------------------------------------------------------------------------

function parseAsset(code: string): Asset {
  if (code.toUpperCase() === 'XLM') return Asset.native()
  const parts = code.split(':')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid asset format "${code}". Use "XLM" for native or "CODE:ISSUER" for others.`,
    )
  }
  return new Asset(parts[0].toUpperCase(), parts[1])
}

// ---------------------------------------------------------------------------
// NexusToolkit
// ---------------------------------------------------------------------------

export class NexusToolkit {
  private readonly config: AgentKitConfig

  constructor(config: AgentKitConfig) {
    this.config = config
  }

  // ---------------------------------------------------------------------------
  // LangChain-compatible tool definitions
  // ---------------------------------------------------------------------------

  /**
   * Returns tool definitions ready for LangChain AgentExecutor.
   * Pass the AgentKit instance in to avoid a circular import.
   */
  getLangChainTools(sessionId: bigint, kit: unknown) {
    const k = kit as {
      pay: (p: {
        sessionId: bigint
        recipient: string
        amountUsdc: number
        memo?: string
        agentPublicKey: string
      }) => Promise<{ txHash: string; newSpentUsdc: number; remainingUsdc: number }>
      getSessionStatus: (
        id: bigint,
      ) => Promise<{
        sessionId: bigint
        agentPublicKey: string
        limitPerTxUsdc: number
        limitPerSessionUsdc: number
        spentUsdc: number
        remainingUsdc: number
        active: boolean
        expiresAtLedger: number
      }>
      buildPathPayment: (p: PathPaymentParams) => Promise<{ unsignedXdr: string; ok: boolean; error?: string }>
    }

    return [
      // ── stellar_payment ──────────────────────────────────────────────────
      {
        name: 'stellar_payment',
        description:
          'Send a USDC payment on Stellar to a recipient address. ' +
          'Always confirm the recipient address and amount before calling. ' +
          'Subject to per-transaction and per-session spending limits enforced on-chain.',
        schema: {
          type: 'object',
          properties: {
            recipient: {
              type: 'string',
              description: 'Stellar account address (56-char G... format)',
            },
            amount_usdc: {
              type: 'number',
              description: 'Payment amount in USDC (decimal, e.g. 50.00)',
            },
            agent_public_key: {
              type: 'string',
              description: 'Agent machine public key that signs the payment',
            },
            memo: {
              type: 'string',
              description: 'Optional payment memo (invoice ID, reference, etc.)',
            },
          },
          required: ['recipient', 'amount_usdc', 'agent_public_key'],
        },
        func: async (input: {
          recipient: string
          amount_usdc: number
          agent_public_key: string
          memo?: string
        }) => {
          if (!isValidStellarAddress(input.recipient)) {
            return JSON.stringify({
              success: false,
              error: `Invalid Stellar address: "${input.recipient}"`,
            })
          }
          try {
            const result = await k.pay({
              sessionId,
              recipient:      input.recipient,
              amountUsdc:     input.amount_usdc,
              memo:           input.memo,
              agentPublicKey: input.agent_public_key,
            })
            return JSON.stringify({
              success:      true,
              txHash:       result.txHash,
              newSpentUsdc: result.newSpentUsdc,
              remainingUsdc: result.remainingUsdc,
            })
          } catch (err: unknown) {
            return JSON.stringify({
              success: false,
              error:   err instanceof Error ? err.message : String(err),
            })
          }
        },
      },

      // ── stellar_path_payment ─────────────────────────────────────────────
      {
        name: 'stellar_path_payment',
        description:
          'Multi-hop cross-asset payment via Stellar SDEX. ' +
          'Finds the best conversion path and executes the swap in a single transaction. ' +
          'Use when the agent needs to pay in an asset it does not hold (e.g. send XLM, recipient gets USDC).',
        schema: {
          type: 'object',
          properties: {
            recipient: {
              type: 'string',
              description: 'Stellar account address (G... format)',
            },
            send_asset: {
              type: 'string',
              description: 'Asset the agent sends. "XLM" for native, or "CODE:ISSUER" for others (e.g. "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN")',
            },
            receive_asset: {
              type: 'string',
              description: 'Asset the recipient receives. Same format as send_asset.',
            },
            receive_amount: {
              type: 'number',
              description: 'Exact amount the recipient should receive.',
            },
            send_max_amount: {
              type: 'number',
              description: 'Maximum amount the agent will send (slippage protection). Must be ≥ expected send amount.',
            },
            agent_public_key: {
              type: 'string',
              description: 'Agent machine public key that signs the transaction',
            },
            memo: {
              type: 'string',
              description: 'Optional payment memo.',
            },
          },
          required: ['recipient', 'send_asset', 'receive_asset', 'receive_amount', 'send_max_amount', 'agent_public_key'],
        },
        func: async (input: {
          recipient:        string
          send_asset:       string
          receive_asset:    string
          receive_amount:   number
          send_max_amount:  number
          agent_public_key: string
          memo?:            string
        }) => {
          if (!isValidStellarAddress(input.recipient)) {
            return JSON.stringify({
              success: false,
              error: `Invalid Stellar address: "${input.recipient}"`,
            })
          }
          try {
            const result = await k.buildPathPayment({
              sessionId,
              agentPublicKey: input.agent_public_key,
              recipient:      input.recipient,
              sendAsset:      input.send_asset,
              receiveAsset:   input.receive_asset,
              receiveAmount:  input.receive_amount,
              sendMaxAmount:  input.send_max_amount,
              memo:           input.memo,
            })
            if (!result.ok) {
              return JSON.stringify({ success: false, error: result.error })
            }
            return JSON.stringify({
              success:     true,
              unsignedXdr: result.unsignedXdr,
              note:        'Sign with agent keypair server-side and submit via kit.wallet.submit()',
            })
          } catch (err: unknown) {
            return JSON.stringify({
              success: false,
              error:   err instanceof Error ? err.message : String(err),
            })
          }
        },
      },

      // ── stellar_get_balance ──────────────────────────────────────────────
      {
        name: 'stellar_get_balance',
        description:
          'Get the USDC (or any asset) balance of a Stellar account address. ' +
          'Call this before making payments to verify the recipient account exists and has the right trustlines.',
        schema: {
          type: 'object',
          properties: {
            account: {
              type: 'string',
              description: 'Stellar account address (G... format)',
            },
            asset: {
              type: 'string',
              description: 'Asset code to return (default: USDC). Use "XLM" for native.',
            },
          },
          required: ['account'],
        },
        func: async (input: { account: string; asset?: string }) => {
          if (!isValidStellarAddress(input.account)) {
            return JSON.stringify({
              success: false,
              error: `Invalid Stellar address: "${input.account}"`,
            })
          }
          try {
            const result = await fetchBalances({
              account: input.account,
              network: this.config.network,
              rpcUrl:  this.config.rpcUrl,
            })
            if ('error' in result) {
              return JSON.stringify({ success: false, error: result.error })
            }
            const assetCode = (input.asset ?? 'USDC').toUpperCase()
            const match     = result.balances.find(b => b.asset.toUpperCase() === assetCode)
            return JSON.stringify({
              success:  true,
              account:  input.account,
              asset:    assetCode,
              balance:  match?.balance ?? 0,
              balances: result.balances,
            })
          } catch (err: unknown) {
            return JSON.stringify({
              success: false,
              error:   err instanceof Error ? err.message : String(err),
            })
          }
        },
      },

      // ── stellar_get_session_status ───────────────────────────────────────
      {
        name: 'stellar_get_session_status',
        description:
          'Check the remaining spending budget for the current agent session. ' +
          'Call this before large payments to verify the session has enough headroom.',
        schema: {
          type: 'object',
          properties: {},
          required: [],
        },
        func: async () => {
          try {
            const session = await k.getSessionStatus(sessionId)
            return JSON.stringify({
              success:            true,
              sessionId:          session.sessionId.toString(),
              limitPerTxUsdc:     session.limitPerTxUsdc,
              limitPerSessionUsdc: session.limitPerSessionUsdc,
              spentUsdc:          session.spentUsdc,
              remainingUsdc:      session.remainingUsdc,
              active:             session.active,
              expiresAtLedger:    session.expiresAtLedger,
            })
          } catch (err: unknown) {
            return JSON.stringify({
              success: false,
              error:   err instanceof Error ? err.message : String(err),
            })
          }
        },
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // OpenAI function-calling definitions
  // ---------------------------------------------------------------------------

  getOpenAIFunctions(sessionId: bigint) {
    void sessionId // sessionId is captured in closure context when tools are invoked
    return [
      {
        name: 'stellar_payment',
        description: 'Send a USDC payment on Stellar. Subject to session spending limits.',
        parameters: {
          type: 'object',
          properties: {
            recipient:        { type: 'string',  description: 'Stellar G... address' },
            amount_usdc:      { type: 'number',  description: 'Amount in USDC' },
            agent_public_key: { type: 'string',  description: 'Agent machine public key' },
            memo:             { type: 'string',  description: 'Payment memo (optional)' },
          },
          required: ['recipient', 'amount_usdc', 'agent_public_key'],
        },
      },
      {
        name: 'stellar_path_payment',
        description: 'Cross-asset payment via Stellar SDEX path finding.',
        parameters: {
          type: 'object',
          properties: {
            recipient:        { type: 'string', description: 'Stellar G... address' },
            send_asset:       { type: 'string', description: '"XLM" or "CODE:ISSUER"' },
            receive_asset:    { type: 'string', description: '"XLM" or "CODE:ISSUER"' },
            receive_amount:   { type: 'number', description: 'Exact amount recipient gets' },
            send_max_amount:  { type: 'number', description: 'Max send amount (slippage cap)' },
            agent_public_key: { type: 'string', description: 'Agent machine public key' },
            memo:             { type: 'string', description: 'Payment memo (optional)' },
          },
          required: ['recipient', 'send_asset', 'receive_asset', 'receive_amount', 'send_max_amount', 'agent_public_key'],
        },
      },
      {
        name: 'stellar_get_balance',
        description: 'Get asset balance of a Stellar account.',
        parameters: {
          type: 'object',
          properties: {
            account: { type: 'string', description: 'Stellar G... address' },
            asset:   { type: 'string', description: 'Asset code (default: USDC)' },
          },
          required: ['account'],
        },
      },
      {
        name: 'stellar_get_session_status',
        description: 'Check remaining session budget.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Path payment XDR builder (called by AgentKit.buildPathPayment)
  // ---------------------------------------------------------------------------

  async buildPathPaymentXdr(params: PathPaymentParams): Promise<{ unsignedXdr: string; ok: boolean; error?: string }> {
    const cfg    = NETWORK_CONFIG[this.config.network]
    const rpcUrl = this.config.rpcUrl ?? cfg.rpcUrl

    const { SorobanRpc } = await import('@stellar/stellar-sdk')
    const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false })

    try {
      const account    = await server.getAccount(params.agentPublicKey)
      const sendAsset  = parseAsset(params.sendAsset)
      const recvAsset  = parseAsset(params.receiveAsset)

      const builder = new TransactionBuilder(account, {
        fee:              BASE_FEE,
        networkPassphrase: cfg.passphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictReceive({
            sendAsset,
            sendMax:     params.sendMaxAmount.toFixed(7),
            destination: params.recipient,
            destAsset:   recvAsset,
            destAmount:  params.receiveAmount.toFixed(7),
            path:        [],   // empty = let Stellar find the path automatically
          }),
        )
        .setTimeout(300)

      if (params.memo) builder.addMemo(Memo.text(params.memo))

      const tx = builder.build()
      return { unsignedXdr: tx.toXDR(), ok: true }
    } catch (err: unknown) {
      return {
        unsignedXdr: '',
        ok:    false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
