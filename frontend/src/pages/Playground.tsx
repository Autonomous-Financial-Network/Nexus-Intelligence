import React, { useState, useRef, useCallback, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const IconTerminal = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
const IconPlay     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
const IconBot      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 8V4H8"/><line x1="9" y1="13" x2="9" y2="15"/><line x1="15" y1="13" x2="15" y2="15"/></svg>
const IconUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IconTool     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
const IconCheck    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconHistory  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>
const IconTrash    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IconSettings = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/></svg>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogType = 'agent' | 'tool' | 'result' | 'system' | 'user' | 'error'

interface LogEntry {
  id:        number
  type:      LogType
  message:   string
  timestamp: string
}

interface Session {
  id:             string
  limitPerTx:     number
  limitPerSession: number
  spent:          number
  active:         boolean
  agentKey:       string
  ownerKey:       string
}

interface TxRecord {
  id:         string
  sessionId:  string
  recipient:  string
  amountUsdc: number
  memo:       string
  txHash:     string
  timestamp:  string
  status:     'success' | 'denied' | 'pending'
}

// ---------------------------------------------------------------------------
// Intent parser — replaces keyword simulation with structured extraction
// ---------------------------------------------------------------------------

interface ParsedIntent {
  type:       'payment' | 'batch_payment' | 'balance' | 'session_status' | 'path_payment' | 'unknown'
  payments?:  { recipient: string; amount: number; memo?: string }[]
  account?:   string
  sendAsset?: string
  recvAsset?: string
  amount?:    number
}

function parseIntent(prompt: string): ParsedIntent {
  const lower = prompt.toLowerCase()

  // Balance check
  if (/balance|fund|how much/.test(lower)) {
    const addrMatch = prompt.match(/G[A-Z2-7]{10,55}/)
    return { type: 'balance', account: addrMatch?.[0] ?? 'GDEF...UVW' }
  }

  // Session/budget status
  if (/budget|remain|limit|session|status|headroom/.test(lower)) {
    return { type: 'session_status' }
  }

  // Path / cross-asset payment
  if (/path|swap|convert|xlm.*usdc|usdc.*xlm|cross.asset/.test(lower)) {
    const amtMatch = prompt.match(/\$?(\d+(?:\.\d+)?)\s*(?:usdc|xlm)?/i)
    return {
      type:       'path_payment',
      sendAsset:  /xlm/i.test(prompt) ? 'XLM' : 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      recvAsset:  /xlm/i.test(prompt) ? 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' : 'XLM',
      amount:     amtMatch ? parseFloat(amtMatch[1]) : 50,
    }
  }

  // Batch payment  — "send $X to each of: …"
  if (/each|batch|all of|every/.test(lower)) {
    const amtMatch  = prompt.match(/\$?(\d+(?:\.\d+)?)/)
    const amount    = amtMatch ? parseFloat(amtMatch[1]) : 50
    const addresses = ['GABC...XYZ', 'GDEF...UVW', 'GHIJ...RST']
    return {
      type:     'batch_payment',
      payments: addresses.map((r, i) => ({ recipient: r, amount, memo: `BATCH-${i + 1}` })),
    }
  }

  // Single payment  — "pay $X to G… for …"
  const amtMatch   = prompt.match(/\$?(\d+(?:\.\d+)?)\s*usdc/i) ?? prompt.match(/\$(\d+(?:\.\d+)?)/)
  const addrMatch  = prompt.match(/G[A-Z2-7]{10,55}/)
  const memoMatch  = prompt.match(/(?:for|memo|ref(?:erence)?)\s+([\w\-./]+)/i)

  if (amtMatch) {
    return {
      type: 'payment',
      payments: [{
        recipient: addrMatch?.[0] ?? 'GABC...XYZ',
        amount:    parseFloat(amtMatch[1]),
        memo:      memoMatch?.[1],
      }],
    }
  }

  return { type: 'unknown' }
}

// ---------------------------------------------------------------------------
// Scenario shortcuts
// ---------------------------------------------------------------------------

const SCENARIOS = [
  { label: 'Pay invoice',    prompt: 'Pay $50 USDC to GABC...XYZ for invoice INV-2026-001' },
  { label: 'Check balance',  prompt: 'What is the USDC balance of GDEF...UVW?' },
  { label: 'Batch payroll',  prompt: 'Send $100 to each of: GABC...XYZ, GDEF...UVW, GHIJ...RST' },
  { label: 'Check limits',   prompt: 'How much budget do I have left this session?' },
  { label: 'Path payment',   prompt: 'Swap 200 XLM to USDC and send to GABC...XYZ' },
]

// ---------------------------------------------------------------------------
// Transaction history drawer
// ---------------------------------------------------------------------------

function TxHistoryDrawer({ txHistory, onClear }: { txHistory: TxRecord[]; onClear: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/10 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-slate-300 hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold">
          <IconHistory />
          Transaction History
          {txHistory.length > 0 && (
            <span className="ml-1 bg-violet-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {txHistory.length}
            </span>
          )}
        </span>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-white/5">
          {txHistory.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-600">
              No payments recorded yet — run a payment scenario above.
            </p>
          ) : (
            <>
              <div className="flex justify-end px-5 pt-3">
                <button
                  onClick={onClear}
                  className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-red-400 transition-colors"
                >
                  <IconTrash /> Clear history
                </button>
              </div>
              <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                {txHistory.map(tx => (
                  <div key={tx.id} className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`w-2 h-2 rounded-full ${
                        tx.status === 'success' ? 'bg-emerald-400' :
                        tx.status === 'pending' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                      }`} />
                      <span className="font-mono text-xs text-amber-400/80 truncate max-w-[120px]">{tx.txHash}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white tabular-nums">${tx.amountUsdc} USDC</span>
                        <span className="text-xs text-slate-500">→ {tx.recipient}</span>
                        {tx.memo && <span className="text-[10px] text-slate-600 font-mono">{tx.memo}</span>}
                      </div>
                      <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                        {tx.sessionId} · {tx.timestamp}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      tx.status === 'success' ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/50' :
                      tx.status === 'pending' ? 'text-amber-300 bg-amber-900/30 border-amber-800/50' :
                                                'text-red-300 bg-red-900/30 border-red-800/50'
                    }`}>
                      {tx.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Budget bar
// ---------------------------------------------------------------------------

function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const pct   = Math.min(100, limit > 0 ? (spent / limit) * 100 : 0)
  const color = pct > 90 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-amber-500/70'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono text-white/30">
        <span>${spent.toFixed(2)} spent</span>
        <span>${(limit - spent).toFixed(2)} remaining</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Log entry renderer
// ---------------------------------------------------------------------------

const LOG_STYLES: Record<LogType, string> = {
  system: 'text-slate-400',
  user:   'text-blue-300',
  agent:  'text-amber-300',
  tool:   'text-violet-300',
  result: 'text-emerald-300',
  error:  'text-red-400',
}

const LOG_ICONS: Record<LogType, React.ReactNode> = {
  system: <IconSettings />,
  user:   <IconUser />,
  agent:  <IconBot />,
  tool:   <IconTool />,
  result: <IconCheck />,
  error:  <IconTerminal />,
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div className={`flex items-start gap-3 text-xs ${LOG_STYLES[entry.type]}`}>
      <span className="shrink-0 opacity-50 mt-0.5">{LOG_ICONS[entry.type]}</span>
      <span className="font-mono opacity-30 shrink-0 tabular-nums">{entry.timestamp}</span>
      <span className="leading-relaxed break-all">{entry.message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowStr() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function randHex(n = 12) { return Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('') }

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Playground() {
  const [logs, setLogs]           = useState<LogEntry[]>([{
    id: 0, type: 'system',
    message: 'Nexus Intelligence Sandbox ready. Configure a session and start sending commands.',
    timestamp: nowStr(),
  }])
  const [session, setSession]     = useState<Session | null>(null)
  const [input, setInput]         = useState('')
  const [running, setRunning]     = useState(false)
  const [txHistory, setTxHistory] = useState<TxRecord[]>([])
  const [limitPerTx, setLimitPerTx]           = useState(100)
  const [limitPerSession, setLimitPerSession] = useState(1000)
  const [agentKey, setAgentKey]   = useState('GABC...XYZ')
  const [ownerKey, setOwnerKey]   = useState('GOWN...KEY')
  const logRef  = useRef<HTMLDivElement>(null)
  const idRef   = useRef(1)

  // auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const addLog = useCallback((type: LogType, message: string) => {
    setLogs(prev => [...prev, { id: idRef.current++, type, message, timestamp: nowStr() }])
  }, [])

  const recordTx = useCallback((
    sessionId: string,
    recipient: string,
    amountUsdc: number,
    memo: string,
    txHash: string,
    status: TxRecord['status'],
  ) => {
    setTxHistory(prev => [{
      id: `tx_${Date.now()}_${randHex(4)}`,
      sessionId,
      recipient,
      amountUsdc,
      memo,
      txHash,
      timestamp: nowStr(),
      status,
    }, ...prev])
  }, [])

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  const createSession = useCallback(async () => {
    addLog('system', `Building create_session XDR — agent=${agentKey} limitPerTx=$${limitPerTx} pool=$${limitPerSession}`)
    await sleep(600)
    addLog('tool', 'buildUnsignedXdr({ functionName: "create_session", ... }) → unsigned XDR ready')
    await sleep(400)
    addLog('agent', 'Owner signature required. In production: pass XDR to Freighter.signTransaction()')
    await sleep(500)
    addLog('result', 'Session confirmed on-chain. Session ID stored.')
    const sid = `sess_${randHex(7)}`
    setSession({ id: sid, limitPerTx, limitPerSession, spent: 0, active: true, agentKey, ownerKey })
    addLog('system', `Session [${sid}] online — agent=${agentKey.slice(0, 8)}… budget=$${limitPerSession}`)
  }, [addLog, agentKey, ownerKey, limitPerTx, limitPerSession])

  const revokeSession = useCallback(async () => {
    if (!session) return
    addLog('system', `Building revoke_session XDR for [${session.id}]…`)
    await sleep(500)
    addLog('tool', 'buildUnsignedXdr({ functionName: "revoke_session", ... }) → XDR ready')
    await sleep(400)
    addLog('result', `Session [${session.id}] revoked on-chain. All future payments will fail.`)
    setSession(null)
  }, [addLog, session])

  // ---------------------------------------------------------------------------
  // Agent execution
  // ---------------------------------------------------------------------------

  const runAgent = useCallback(async (prompt: string) => {
    if (!session) { addLog('error', 'No active session. Create a session first.'); return }
    if (running) return
    setRunning(true)
    addLog('user', prompt)

    const intent = parseIntent(prompt)
    await sleep(300)

    // ── session status ──────────────────────────────────────────────────────
    if (intent.type === 'session_status') {
      addLog('tool', 'stellar_get_session_status() called')
      await sleep(400)
      addLog('result', JSON.stringify({
        sessionId:          session.id,
        limitPerTxUsdc:     session.limitPerTx,
        limitPerSessionUsdc: session.limitPerSession,
        spentUsdc:          session.spent,
        remainingUsdc:      session.limitPerSession - session.spent,
        active:             session.active,
      }, null, 2))
      setRunning(false)
      return
    }

    // ── balance check ────────────────────────────────────────────────────────
    if (intent.type === 'balance') {
      addLog('tool', `stellar_get_balance({ account: "${intent.account}" })`)
      await sleep(700)
      const balance = (Math.random() * 10000).toFixed(2)
      addLog('result', JSON.stringify({ success: true, account: intent.account, asset: 'USDC', balance: parseFloat(balance) }, null, 2))
      setRunning(false)
      return
    }

    // ── path payment ────────────────────────────────────────────────────────
    if (intent.type === 'path_payment') {
      addLog('agent', `Planning path payment: ${intent.sendAsset} → ${intent.recvAsset}`)
      await sleep(500)
      addLog('tool', `stellar_path_payment({ sendAsset: "${intent.sendAsset}", receiveAsset: "${intent.recvAsset}", receiveAmount: ${intent.amount} })`)
      await sleep(600)
      addLog('tool', 'buildPathPaymentXdr({ operation: pathPaymentStrictReceive, ... }) → XDR ready')
      await sleep(400)
      addLog('result', JSON.stringify({
        success:     true,
        unsignedXdr: `AAAAAQ...PATH_PAYMENT_XDR_${randHex(8)}`,
        note:        'Sign with agent keypair server-side and submit via kit.wallet.submit()',
      }, null, 2))
      setRunning(false)
      return
    }

    // ── single or batch payment ─────────────────────────────────────────────
    const payments = intent.payments ?? []
    if (!payments.length) {
      addLog('agent', 'Intent not recognised. Try: "Pay $50 USDC to G… for INV-001" or "Check balance of G…"')
      setRunning(false)
      return
    }

    for (const pmt of payments) {
      // Pre-flight budget check
      addLog('tool', 'stellar_get_session_status() — pre-flight budget check')
      await sleep(350)
      const remaining = session.limitPerSession - session.spent
      addLog('result', `remaining=$${remaining.toFixed(2)} limitPerTx=$${session.limitPerTx}`)
      await sleep(200)

      if (pmt.amount > session.limitPerTx) {
        addLog('error', `Payment of $${pmt.amount} exceeds per-tx limit of $${session.limitPerTx}. Skipping.`)
        recordTx(session.id, pmt.recipient, pmt.amount, pmt.memo ?? '', 'denied', 'denied')
        continue
      }
      if (pmt.amount > remaining) {
        addLog('error', `Insufficient session budget ($${remaining.toFixed(2)} remaining). Skipping $${pmt.amount} payment.`)
        recordTx(session.id, pmt.recipient, pmt.amount, pmt.memo ?? '', 'denied', 'denied')
        continue
      }

      addLog('agent', `Executing: $${pmt.amount} USDC → ${pmt.recipient}${pmt.memo ? ` (${pmt.memo})` : ''}`)
      await sleep(400)
      addLog('tool', `stellar_payment({ recipient: "${pmt.recipient}", amount_usdc: ${pmt.amount}, memo: "${pmt.memo ?? ''}" })`)
      await sleep(300)
      addLog('tool', 'buildUnsignedXdr({ functionName: "execute_payment", ... }) → XDR ready')
      await sleep(500)
      addLog('tool', 'Agent machine key signs XDR server-side → submitSignedXdr()')
      await sleep(600)

      const txHash = `txhash_${randHex(12)}`
      setSession(prev => prev ? { ...prev, spent: prev.spent + pmt.amount } : prev)
      recordTx(session.id, pmt.recipient, pmt.amount, pmt.memo ?? '', txHash, 'success')

      addLog('result', JSON.stringify({
        success:      true,
        txHash,
        amountUsdc:   pmt.amount,
        recipient:    pmt.recipient,
        newSpentUsdc: session.spent + pmt.amount,
      }, null, 2))
      await sleep(200)
    }

    setRunning(false)
  }, [session, running, addLog, recordTx])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || running) return
    setInput('')
    runAgent(trimmed)
  }, [input, running, runAgent])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="border-b border-white/5 pb-5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Agent Playground
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Simulate the full SDK flow — session creation, payment validation, XDR building, and on-chain enforcement.
        </p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* ── Left panel ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Session config */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/10 backdrop-blur-sm p-5 space-y-4">
            <p className="text-xs text-white/30 uppercase font-mono tracking-wider flex items-center gap-2">
              <IconSettings /> Session Config
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-white/30 font-mono uppercase mb-1">Owner Public Key</label>
                <input
                  value={ownerKey}
                  onChange={e => setOwnerKey(e.target.value)}
                  disabled={!!session}
                  className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
                  placeholder="G... (Freighter key)"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/30 font-mono uppercase mb-1">Agent Machine Key</label>
                <input
                  value={agentKey}
                  onChange={e => setAgentKey(e.target.value)}
                  disabled={!!session}
                  className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-xs font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
                  placeholder="G... (machine keypair)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/30 font-mono uppercase mb-1">Per-Tx ($)</label>
                  <input
                    type="number" min={1} value={limitPerTx}
                    onChange={e => setLimitPerTx(Number(e.target.value))}
                    disabled={!!session}
                    className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/30 font-mono uppercase mb-1">Pool ($)</label>
                  <input
                    type="number" min={1} value={limitPerSession}
                    onChange={e => setLimitPerSession(Number(e.target.value))}
                    disabled={!!session}
                    className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
                  />
                </div>
              </div>
            </div>

            {!session ? (
              <button
                onClick={createSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white transition-all shadow-lg shadow-amber-900/30"
              >
                Create Session
              </button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-900/20 border border-emerald-800/30 px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    <code className="text-[11px] text-emerald-300 font-mono">{session.id}</code>
                  </div>
                  <BudgetBar spent={session.spent} limit={session.limitPerSession} />
                </div>
                <button
                  onClick={revokeSession}
                  className="w-full py-2 rounded-xl text-xs font-semibold border border-red-900/50 text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  Revoke Session
                </button>
              </div>
            )}
          </div>

          {/* Scenario shortcuts */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/10 backdrop-blur-sm p-4 space-y-2">
            <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider mb-3">Quick Scenarios</p>
            {SCENARIOS.map(s => (
              <button
                key={s.label}
                onClick={() => { setInput(s.prompt); }}
                disabled={!session || running}
                className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed font-mono"
              >
                → {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right panel: terminal ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm flex flex-col overflow-hidden min-h-[520px]">
          {/* Terminal header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <span className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-amber-500/70" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
            </span>
            <span className="text-[11px] text-white/20 font-mono ml-2">nexus-intelligence — agent sandbox</span>
            {running && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-amber-400/80 font-mono">
                <span className="h-2 w-2 rounded-full border border-amber-400/80 border-t-transparent animate-spin" />
                running
              </span>
            )}
          </div>

          {/* Log output */}
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-5 space-y-2.5 font-mono text-xs"
            aria-live="polite"
            aria-label="Agent execution log"
          >
            {logs.map(entry => <LogRow key={entry.id} entry={entry} />)}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-white/5 flex items-center gap-3 px-4 py-3">
            <span className="text-amber-400/60 font-mono text-sm select-none shrink-0">›</span>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={session ? 'Send a command to the agent…' : 'Create a session to begin…'}
              disabled={!session || running}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none disabled:opacity-40 font-mono"
              aria-label="Agent command input"
            />
            <button
              type="submit"
              disabled={!session || running || !input.trim()}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/80 hover:bg-amber-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <IconPlay /> Run
            </button>
          </form>
        </div>
      </div>

      {/* Transaction history */}
      <TxHistoryDrawer txHistory={txHistory} onClear={() => setTxHistory([])} />
    </div>
  )
}
