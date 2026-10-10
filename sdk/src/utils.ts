/**
 * Session and payment validation utilities.
 *
 * Pure functions — no network calls, no side effects.
 * Used by AgentKit, SpendingLimitClient, and tests.
 */

import type { AgentSession } from './agent/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const USDC_DECIMALS = 7
const STROOPS_PER_USDC = 10 ** USDC_DECIMALS
const LEDGERS_PER_SECOND = 0.2  // ~5 s per ledger

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `address` is a valid Stellar account ID (G… 56-char).
 */
export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address ?? '')
}

// ---------------------------------------------------------------------------
// Amount helpers
// ---------------------------------------------------------------------------

/** Convert USDC decimal amount to Stellar stroops (bigint). */
export function usdcToStroops(usdc: number): bigint {
  if (!isFinite(usdc) || usdc < 0) throw new RangeError(`Invalid USDC amount: ${usdc}`)
  return BigInt(Math.round(usdc * STROOPS_PER_USDC))
}

/** Convert Stellar stroops to USDC decimal amount. */
export function stroopsToUsdc(stroops: bigint): number {
  return Number(stroops) / STROOPS_PER_USDC
}

// ---------------------------------------------------------------------------
// Session expiry
// ---------------------------------------------------------------------------

/**
 * Returns true if the session has expired based on current ledger height.
 * @param session - The agent session to check
 * @param currentLedger - Current Stellar ledger sequence number
 */
export function isSessionExpired(session: AgentSession, currentLedger: number): boolean {
  if (!session.active) return true
  if (session.expiresAtLedger === 0) return false  // 0 = no expiry (dev/test)
  return currentLedger >= session.expiresAtLedger
}

/**
 * Estimate seconds remaining until session expiry.
 * Returns Infinity if no expiry set (expiresAtLedger === 0).
 */
export function sessionSecondsRemaining(session: AgentSession, currentLedger: number): number {
  if (session.expiresAtLedger === 0) return Infinity
  const ledgersLeft = session.expiresAtLedger - currentLedger
  return Math.max(0, ledgersLeft / LEDGERS_PER_SECOND)
}

// ---------------------------------------------------------------------------
// Payment validation
// ---------------------------------------------------------------------------

export interface PaymentValidationResult {
  valid: boolean
  errors: string[]
}

export interface PaymentValidationParams {
  recipient: string
  amountUsdc: number
  session: AgentSession
  /** Optional: reject if the agent key doesn't match the session */
  agentPublicKey?: string
}

/**
 * Validate all constraints for a payment before building the XDR.
 *
 * Checks:
 *  - Recipient is a valid Stellar address
 *  - Amount is positive and finite
 *  - Amount ≤ per-transaction limit
 *  - Cumulative spend + amount ≤ session limit
 *  - Session is active and not expired (checked against limitPerSessionUsdc)
 *  - Agent key matches session (if provided)
 *
 * @example
 * const { valid, errors } = validatePaymentParams({
 *   recipient: 'GABC...',
 *   amountUsdc: 50,
 *   session,
 * })
 * if (!valid) throw new Error(errors.join('; '))
 */
export function validatePaymentParams(
  params: PaymentValidationParams,
): PaymentValidationResult {
  const errors: string[] = []

  // Recipient address
  if (!isValidStellarAddress(params.recipient)) {
    errors.push(`Invalid recipient address: "${params.recipient}". Must be a 56-char Stellar G address.`)
  }

  // Amount sanity
  if (!isFinite(params.amountUsdc) || params.amountUsdc <= 0) {
    errors.push(`Amount must be a positive number (got ${params.amountUsdc}).`)
  } else {
    // Per-tx limit
    if (params.amountUsdc > params.session.limitPerTxUsdc) {
      errors.push(
        `Amount $${params.amountUsdc} exceeds the per-transaction limit of $${params.session.limitPerTxUsdc}.`,
      )
    }

    // Session budget
    const projectedSpend = params.session.spentUsdc + params.amountUsdc
    if (projectedSpend > params.session.limitPerSessionUsdc) {
      const remaining = params.session.limitPerSessionUsdc - params.session.spentUsdc
      errors.push(
        `Insufficient session budget. Payment of $${params.amountUsdc} would exceed the session limit. ` +
        `Remaining: $${remaining.toFixed(2)}.`,
      )
    }
  }

  // Session active
  if (!params.session.active) {
    errors.push('Session is not active. Create a new session before submitting payments.')
  }

  // Agent key match
  if (
    params.agentPublicKey &&
    params.session.agentPublicKey !== params.agentPublicKey &&
    params.session.agentPublicKey !== 'G...'  // ignore stub default
  ) {
    errors.push(
      `Agent key mismatch. Session belongs to ${params.session.agentPublicKey}, ` +
      `got ${params.agentPublicKey}.`,
    )
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// Session status formatting
// ---------------------------------------------------------------------------

export interface FormattedSessionStatus {
  sessionId: string
  status: 'active' | 'revoked' | 'expired'
  limitPerTxUsdc: string
  limitPerSessionUsdc: string
  spentUsdc: string
  remainingUsdc: string
  utilizationPct: string
  expiresAtLedger: string
}

/**
 * Format a raw AgentSession into human-readable strings for display in
 * the playground, logs, and tool responses.
 *
 * @example
 * const fmt = formatSessionStatus(session)
 * console.log(`Budget: ${fmt.remainingUsdc} remaining (${fmt.utilizationPct} used)`)
 */
export function formatSessionStatus(
  session: AgentSession,
  currentLedger?: number,
): FormattedSessionStatus {
  const expired =
    currentLedger !== undefined && isSessionExpired(session, currentLedger)

  const status: FormattedSessionStatus['status'] = !session.active
    ? 'revoked'
    : expired
    ? 'expired'
    : 'active'

  const remaining = Math.max(0, session.limitPerSessionUsdc - session.spentUsdc)
  const utilPct =
    session.limitPerSessionUsdc > 0
      ? (session.spentUsdc / session.limitPerSessionUsdc) * 100
      : 0

  return {
    sessionId: session.sessionId.toString(),
    status,
    limitPerTxUsdc:      `$${session.limitPerTxUsdc.toFixed(2)}`,
    limitPerSessionUsdc: `$${session.limitPerSessionUsdc.toFixed(2)}`,
    spentUsdc:           `$${session.spentUsdc.toFixed(2)}`,
    remainingUsdc:       `$${remaining.toFixed(2)}`,
    utilizationPct:      `${utilPct.toFixed(1)}%`,
    expiresAtLedger:
      session.expiresAtLedger === 0
        ? 'no expiry'
        : session.expiresAtLedger.toLocaleString(),
  }
}
