/**
 * SAK-M01 — Live Balance Telemetry via Stellar RPC
 *
 * Fetches trustline and Soroban token balances for a Stellar account
 * concurrently with error caching. Designed to be called by the
 * stellar_get_balance tool and the AgentWalletClient.
 */

import type { StellarNetwork } from '../stellar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetBalance {
  asset: string        // e.g. "USDC", "XLM", "native"
  balance: number      // decimal amount
  issuer?: string      // omitted for native XLM
  isNative: boolean
}

export interface BalanceResult {
  account: string
  balances: AssetBalance[]
  fetchedAt: number    // unix ms
  fromCache: boolean
}

export interface BalanceFetchError {
  account: string
  error: string
  fetchedAt: number
}

// ---------------------------------------------------------------------------
// In-memory error cache — prevents hammering RPC on repeated failures
// ---------------------------------------------------------------------------

const ERROR_CACHE_TTL_MS = 10_000  // 10 s
const BALANCE_CACHE_TTL_MS = 5_000 // 5 s

const errorCache = new Map<string, { error: string; ts: number }>()
const balanceCache = new Map<string, { result: BalanceResult; ts: number }>()

function clearExpiredCache() {
  const now = Date.now()
  for (const [key, entry] of errorCache.entries()) {
    if (now - entry.ts > ERROR_CACHE_TTL_MS) errorCache.delete(key)
  }
  for (const [key, entry] of balanceCache.entries()) {
    if (now - entry.ts > BALANCE_CACHE_TTL_MS) balanceCache.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Horizon REST fetch — trustline balances
// ---------------------------------------------------------------------------

async function fetchHorizonBalances(
  account: string,
  horizonUrl: string,
): Promise<AssetBalance[]> {
  const res = await fetch(`${horizonUrl}/accounts/${encodeURIComponent(account)}`, {
    headers: { Accept: 'application/json' },
  })

  if (res.status === 404) return []   // account not found / not funded
  if (!res.ok) throw new Error(`Horizon HTTP ${res.status}`)

  const data = await res.json() as {
    balances?: Array<{
      balance: string
      asset_type: string
      asset_code?: string
      asset_issuer?: string
    }>
  }

  return (data.balances ?? []).map(b => ({
    asset: b.asset_type === 'native' ? 'XLM' : (b.asset_code ?? 'UNKNOWN'),
    balance: parseFloat(b.balance),
    issuer: b.asset_issuer,
    isNative: b.asset_type === 'native',
  }))
}

// ---------------------------------------------------------------------------
// Soroban RPC — token contract balances (SAC tokens not on trustlines)
// ---------------------------------------------------------------------------

async function fetchSorobanTokenBalance(
  account: string,
  contractId: string,
  rpcUrl: string,
): Promise<number> {
  /**
   * Real implementation uses getLedgerEntries with the SAC storage key:
   *   xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), addressScVal])
   * Stub returns 0 until the Wave contribution wires up the XDR decode.
   */
  console.log(`[balance_telemetry] soroban balance stub — contract=${contractId} account=${account} rpc=${rpcUrl}`)
  return 0
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
}

export interface FetchBalancesOptions {
  account: string
  network: StellarNetwork
  /** Optional Soroban contract IDs for SAC token balances */
  sorobanTokenContracts?: string[]
  rpcUrl?: string
  /** Skip cache and always fetch fresh data */
  forceRefresh?: boolean
}

/**
 * Fetch all balances for an account concurrently:
 *   1. Horizon trustline balances (XLM + classic assets)
 *   2. Soroban SAC token balances (one request per contractId)
 *
 * Results are cached for 5 s. Errors are cached for 10 s to prevent
 * rapid retry storms when the account doesn't exist or RPC is down.
 */
export async function fetchBalances(
  options: FetchBalancesOptions,
): Promise<BalanceResult | BalanceFetchError> {
  clearExpiredCache()

  const cacheKey = `${options.account}:${options.network}`
  const now = Date.now()

  // Return cached error if still fresh
  const cachedError = errorCache.get(cacheKey)
  if (cachedError && now - cachedError.ts < ERROR_CACHE_TTL_MS) {
    return { account: options.account, error: cachedError.error, fetchedAt: cachedError.ts }
  }

  // Return cached result if still fresh and not force-refreshed
  if (!options.forceRefresh) {
    const cached = balanceCache.get(cacheKey)
    if (cached && now - cached.ts < BALANCE_CACHE_TTL_MS) {
      return { ...cached.result, fromCache: true }
    }
  }

  try {
    const horizonUrl = HORIZON_URLS[options.network]

    // Run Horizon + any Soroban token fetches concurrently
    const [horizonBalances, ...sorobanBalances] = await Promise.all([
      fetchHorizonBalances(options.account, horizonUrl),
      ...(options.sorobanTokenContracts ?? []).map(contractId =>
        fetchSorobanTokenBalance(options.account, contractId, options.rpcUrl ?? '')
          .then(balance => ({ asset: contractId, balance, isNative: false } as AssetBalance))
          .catch(() => null)
      ),
    ])

    const allBalances: AssetBalance[] = [
      ...horizonBalances,
      ...sorobanBalances.filter((b): b is AssetBalance => b !== null),
    ]

    const result: BalanceResult = {
      account: options.account,
      balances: allBalances,
      fetchedAt: now,
      fromCache: false,
    }

    balanceCache.set(cacheKey, { result, ts: now })
    return result
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    errorCache.set(cacheKey, { error: errorMsg, ts: now })
    return { account: options.account, error: errorMsg, fetchedAt: now }
  }
}

/**
 * Convenience: return the USDC balance for an account (0 if not found).
 */
export async function getUsdcBalance(
  account: string,
  network: StellarNetwork,
): Promise<number> {
  const result = await fetchBalances({ account, network })
  if ('error' in result) return 0
  const usdc = result.balances.find(b => b.asset === 'USDC')
  return usdc?.balance ?? 0
}

/** Clear all internal caches (useful for testing) */
export function clearBalanceCaches(): void {
  errorCache.clear()
  balanceCache.clear()
}
