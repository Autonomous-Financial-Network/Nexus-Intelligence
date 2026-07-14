import { AgentKitConfig } from '../agent/types'

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * NexusToolkit — generates AI agent tool definitions for Stellar operations.
 *
 * Supports LangChain DynamicStructuredTool format and OpenAI function calling format.
 * All tools enforce session-based spending limits via the AgentWallet contract.
 */
export class NexusToolkit {
  private config: AgentKitConfig

  constructor(config: AgentKitConfig) {
    this.config = config
  }

  /**
   * LangChain-compatible tool definitions.
   * Import AgentKit to avoid circular dependency — passed in from AgentKit.getLangChainTools().
   */
  getLangChainTools(sessionId: bigint, kit: any) {
    return [
      {
        name: 'stellar_payment',
        description:
          'Send a USDC payment on Stellar to a recipient address. ' +
          'Always confirm the recipient address and amount with the user before calling. ' +
          'Subject to session spending limits.',
        schema: {
          type: 'object',
          properties: {
            recipient: {
              type: 'string',
              description: 'Stellar account address (G... format)',
            },
            amount_usdc: {
              type: 'number',
              description: 'Amount in USDC (decimal, e.g. 50.00)',
            },
            memo: {
              type: 'string',
              description: 'Optional payment memo (invoice ID, reference, etc.)',
            },
          },
          required: ['recipient', 'amount_usdc'],
        },
        func: async (input: { recipient: string; amount_usdc: number; memo?: string }) => {
          try {
            const result = await kit.pay({
              sessionId,
              recipient: input.recipient,
              amountUsdc: input.amount_usdc,
              memo: input.memo,
            })
            return JSON.stringify({
              success: true,
              txHash: result.txHash,
              newSpentUsdc: result.newSpentUsdc,
            })
          } catch (e: any) {
            return JSON.stringify({ success: false, error: e.message })
          }
        },
      },
      {
        name: 'stellar_get_balance',
        description: 'Get the USDC balance of a Stellar account address.',
        schema: {
          type: 'object',
          properties: {
            account: {
              type: 'string',
              description: 'Stellar account address (G... format)',
            },
          },
          required: ['account'],
        },
        func: async (input: { account: string }) => {
          try {
            const balance = await this.getBalance(input.account)
            return JSON.stringify({ account: input.account, usdc: balance })
          } catch (e: any) {
            return JSON.stringify({ success: false, error: e.message })
          }
        },
      },
      {
        name: 'stellar_get_session_status',
        description:
          'Check remaining spending budget for the current agent session. ' +
          'Call this before making payments to verify limits.',
        schema: { type: 'object', properties: {}, required: [] },
        func: async () => {
          try {
            const session = await kit.getSessionStatus(sessionId)
            return JSON.stringify({
              sessionId: session.sessionId.toString(),
              limitPerTxUsdc: session.limitPerTxUsdc,
              limitPerSessionUsdc: session.limitPerSessionUsdc,
              spentUsdc: session.spentUsdc,
              remainingUsdc: session.limitPerSessionUsdc - session.spentUsdc,
              active: session.active,
            })
          } catch (e: any) {
            return JSON.stringify({ success: false, error: e.message })
          }
        },
      },
    ]
  }

  /**
   * OpenAI function calling definitions (for direct API use).
   */
  getOpenAIFunctions(sessionId: bigint) {
    return [
      {
        name: 'stellar_payment',
        description: 'Send a USDC payment on Stellar. Subject to session spending limits.',
        parameters: {
          type: 'object',
          properties: {
            recipient: { type: 'string', description: 'Stellar G... address' },
            amount_usdc: { type: 'number', description: 'Amount in USDC' },
            memo: { type: 'string', description: 'Payment memo (optional)' },
          },
          required: ['recipient', 'amount_usdc'],
        },
      },
      {
        name: 'stellar_get_balance',
        description: 'Get USDC balance of a Stellar account.',
        parameters: {
          type: 'object',
          properties: {
            account: { type: 'string', description: 'Stellar G... address' },
          },
          required: ['account'],
        },
      },
    ]
  }

  private async getBalance(account: string): Promise<number> {
    const res = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccount',
        params: { account_id: account },
      }),
    })
    const data = (await res.json()) as any
    // Parse USDC balance from account balances
    const balances: any[] = data?.result?.balances ?? []
    const usdc = balances.find((b: any) => b.asset_code === 'USDC')
    return usdc ? parseFloat(usdc.balance) : 0
  }
}


