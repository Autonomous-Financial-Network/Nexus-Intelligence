/**
 * TxHistoryService — per-session in-memory payment history with Horizon enrichment.
 *
 * Records every payment attempt made through AgentKit and optionally enriches
 * entries with confirmed on-chain data fetched from Horizon.
 *
 * Usage:
 *   const history = new TxHistoryService(config)
 *   history.record({ sessionId, recipient, amountUsdc, memo, txHash, status })
 *   const entries = history.getAll()
 *   const enriched = await history.enrich(txHash)
 */

import { NETWORK_CONFIG, StellarNetwork } from '../stellar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TxStatus = 'pending' | 'success' | 'failed' | 'denied'

export interface TxRecord {
  /** Monotonic ID within this service instance */
  id:           number
  sessionId:    bigint
  recipient:    string
  amountUsdc:   number
  memo:         string
  txHash:       string
  status:       TxStatus
  recordedAt:   number   // unix ms
  /** Ledger the tx landed in — populated after on-chain confirmation */
  ledger?:      number
  /** Fee paid in stroops — populated after enrichment */
  feeStroops?:  number
}

export interface RecordParams {
  sessionId:  bigint
  recipient:  string
  amountUsdc: number
  memo:       string
  txHash:     string
  status:     TxStatus
}

export interface TxHistorySummary {
  totalPayments:    number
  successPayments:  number
  failedPayments:   number
  totalSpentUsdc:   number
  averageAmountUsdc: number
  largestPaymentUsdc: number
}

// ---------------------------------------------------------------------------
// Horizon transaction shape (subset)
// ---------------------------------------------------------------------------

interface HorizonTx {
  hash:         string
  ledger:       number
  fee_charged:  string
  successful:   boolean
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TxHistoryService {
  private readonly network:    StellarNetwork
  private readonly horizonUrl: string
  private records: TxRecord[] = []
  private nextId = 1

  constructor(config: { network: StellarNetwork; rpcUrl?: string }) {
    this.network    = config.network
    this.horizonUrl = NETWORK_CONFIG[config.network].horizonUrl
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Record a new payment attempt. Call this immediately after building/submitting
   * the payment XDR so the history is always up to date.
   */
  record(params: RecordParams): TxRecord {
    const entry: TxRecord = {
      id:          this.nextId++,
      sessionId:   params.sessionId,
      recipient:   params.recipient,
      amountUsdc:  params.amountUsdc,
      memo:        params.memo,
      txHash:      params.txHash,
      status:      params.status,
      recordedAt:  Date.now(),
    }
    this.records.unshift(entry)  // newest first
    return entry
  }

  /**
   * Update the status of an existing record (e.g. pending → success after confirmation).
   */
  updateStatus(txHash: string, status: TxStatus, ledger?: number): boolean {
    const rec = this.records.find(r => r.txHash === txHash)
    if (!rec) return false
    rec.status = status
    if (ledger !== undefined) rec.ledger = ledger
    return true
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /** All records, newest first. */
  getAll(): readonly TxRecord[] {
    return this.records
  }

  /** Records filtered by session ID. */
  getBySession(sessionId: bigint): TxRecord[] {
    return this.records.filter(r => r.sessionId === sessionId)
  }

  /** Records filtered by status. */
  getByStatus(status: TxStatus): TxRecord[] {
    return this.records.filter(r => r.status === status)
  }

  /** Look up a single record by txHash. */
  getByHash(txHash: string): TxRecord | undefined {
    return this.records.find(r => r.txHash === txHash)
  }

  /**
   * Aggregate statistics across all records (or a specific session).
   */
  getSummary(sessionId?: bigint): TxHistorySummary {
    const scope = sessionId !== undefined
      ? this.getBySession(sessionId)
      : this.records

    const successful = scope.filter(r => r.status === 'success')
    const failed     = scope.filter(r => r.status === 'failed' || r.status === 'denied')
    const total      = successful.reduce((s, r) => s + r.amountUsdc, 0)
    const largest    = successful.reduce((m, r) => Math.max(m, r.amountUsdc), 0)

    return {
      totalPayments:     scope.length,
      successPayments:   successful.length,
      failedPayments:    failed.length,
      totalSpentUsdc:    total,
      averageAmountUsdc: successful.length > 0 ? total / successful.length : 0,
      largestPaymentUsdc: largest,
    }
  }

  // ---------------------------------------------------------------------------
  // Enrichment via Horizon
  // ---------------------------------------------------------------------------

  /**
   * Fetch on-chain details for a txHash from Horizon and update the local record.
   * Returns the enriched record, or undefined if not found locally.
   */
  async enrich(txHash: string): Promise<TxRecord | undefined> {
    const rec = this.records.find(r => r.txHash === txHash)
    if (!rec) return undefined

    try {
      const res = await fetch(
        `${this.horizonUrl}/transactions/${encodeURIComponent(txHash)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!res.ok) return rec

      const data = await res.json() as HorizonTx
      rec.ledger    = data.ledger
      rec.feeStroops = Number(data.fee_charged)
      rec.status    = data.successful ? 'success' : 'failed'
    } catch {
      // Enrichment is best-effort — don't throw
    }

    return rec
  }

  /**
   * Enrich all pending records concurrently (up to 5 at a time).
   */
  async enrichPending(): Promise<void> {
    const pending = this.records.filter(r => r.status === 'pending' && r.txHash)
    const chunks  = []
    for (let i = 0; i < pending.length; i += 5) {
      chunks.push(pending.slice(i, i + 5))
    }
    for (const chunk of chunks) {
      await Promise.allSettled(chunk.map(r => this.enrich(r.txHash)))
    }
  }

  /** Clear all records (useful for testing or session reset). */
  clear(): void {
    this.records = []
    this.nextId  = 1
  }
}
