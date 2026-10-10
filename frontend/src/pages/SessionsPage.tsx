import { useState, useCallback, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id:              string
  agentPublicKey:  string
  ownerPublicKey:  string
  limitPerTx:      number
  limitPerSession: number
  spent:           number
  expiresAtLedger: number
  durationLedgers: number
  active:          boolean
  createdAt:       string
  txCount:         number
}

interface CreateSessionForm {
  ownerPublicKey:  string
  agentPublicKey:  string
  limitPerTx:      number
  limitPerSession: number
  durationLedgers: number
}

type FormErrors = Partial<Record<keyof CreateSessionForm, string>>
type SortKey    = 'createdAt' | 'spent' | 'remaining' | 'limitPerSession'
type FilterKey  = 'all' | 'active' | 'revoked'

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const INITIAL_SESSIONS: Session[] = [
  {
    id:              'sess_xk3m9p2',
    agentPublicKey:  'GABC...XYZ',
    ownerPublicKey:  'GOWN...ABC',
    limitPerTx:      500,
    limitPerSession: 5000,
    spent:           1240,
    expiresAtLedger: 52_010_000,
    durationLedgers: 17_280,
    active:          true,
    createdAt:       new Date(Date.now() - 3_600_000).toISOString(),
    txCount:         8,
  },
  {
    id:              'sess_q7r4lw8',
    agentPublicKey:  'GDEF...UVW',
    ownerPublicKey:  'GOWN...DEF',
    limitPerTx:      200,
    limitPerSession: 10_000,
    spent:           10_000,
    expiresAtLedger: 51_990_000,
    durationLedgers: 120_960,
    active:          false,
    createdAt:       new Date(Date.now() - 86_400_000).toISOString(),
    txCount:         50,
  },
]

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(form: CreateSessionForm): FormErrors {
  const e: FormErrors = {}
  if (!form.ownerPublicKey.trim())  e.ownerPublicKey  = 'Owner public key is required.'
  if (!form.agentPublicKey.trim())  e.agentPublicKey  = 'Agent machine public key is required.'
  if (form.limitPerTx <= 0)         e.limitPerTx      = 'Must be greater than 0.'
  if (form.limitPerSession <= 0)    e.limitPerSession  = 'Must be greater than 0.'
  if (form.limitPerTx > form.limitPerSession)
    e.limitPerTx = 'Per-tx limit cannot exceed the session limit.'
  if (form.durationLedgers < 100)   e.durationLedgers = 'Minimum 100 ledgers (~8 min).'
  return e
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full border ${
      active
        ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/50'
        : 'text-white/30 bg-white/5 border-white/10'
    }`}>
      {active && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
      )}
      {active ? 'Active' : 'Revoked / Expired'}
    </span>
  )
}

function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const pct   = Math.min(100, limit > 0 ? (spent / limit) * 100 : 0)
  const color = pct >= 100 ? 'bg-red-500' : pct > 75 ? 'bg-amber-400' : 'bg-amber-500/70'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono text-white/30">
        <span>${spent.toLocaleString()} spent</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[10px] font-mono text-white/20">
        of ${limit.toLocaleString()} total
      </div>
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p role="alert" className="mt-1 text-[11px] text-red-400">⚠ {msg}</p>
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900/20 border border-white/[0.06] rounded-xl px-4 py-3">
      <p className="text-[10px] text-white/30 uppercase font-mono mb-1">{label}</p>
      <p className="text-lg font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="text-[10px] text-white/20 font-mono mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// XDR preview modal
// ---------------------------------------------------------------------------

function XdrModal({ xdr, onClose }: { xdr: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(xdr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="xdr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-xl bg-[#0d0a00] border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 id="xdr-modal-title" className="text-sm font-semibold text-white">Unsigned Transaction XDR</h2>
            <p className="text-xs text-white/30 mt-0.5">Pass this to Freighter.signTransaction() to authorize on-chain.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-white/30 hover:text-white transition-colors">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <pre className="bg-black/40 rounded-xl p-4 text-[11px] font-mono text-amber-300/70 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
            {xdr}
          </pre>
          <div className="flex gap-3">
            <button
              onClick={copy}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white transition-all"
            >
              {copied ? '✓ Copied' : 'Copy XDR'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              Close
            </button>
          </div>
          <p className="text-[10px] text-white/20 font-mono">
            Next step: sign with Freighter → call kit.wallet.submit(signedXdr) → store returnValue as sessionId
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SessionsPage() {
  const [sessions, setSessions]   = useState<Session[]>(INITIAL_SESSIONS)
  const [showForm, setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [xdrPreview, setXdrPreview] = useState<string | null>(null)
  const [sortBy, setSortBy]       = useState<SortKey>('createdAt')
  const [filter, setFilter]       = useState<FilterKey>('all')
  const [form, setForm]           = useState<CreateSessionForm>({
    ownerPublicKey:  '',
    agentPublicKey:  '',
    limitPerTx:      100,
    limitPerSession: 1000,
    durationLedgers: 17_280,
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const set = useCallback(<K extends keyof CreateSessionForm>(key: K, value: CreateSessionForm[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }, [])

  // ---------------------------------------------------------------------------
  // Derived / sorted / filtered list
  // ---------------------------------------------------------------------------

  const displayed = useMemo(() => {
    const base = sessions.filter(s =>
      filter === 'all'    ? true :
      filter === 'active' ? s.active :
                            !s.active,
    )
    return [...base].sort((a, b) => {
      if (sortBy === 'createdAt')       return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortBy === 'spent')           return b.spent - a.spent
      if (sortBy === 'remaining')       return (a.limitPerSession - a.spent) - (b.limitPerSession - b.spent)
      if (sortBy === 'limitPerSession') return b.limitPerSession - a.limitPerSession
      return 0
    })
  }, [sessions, filter, sortBy])

  // ---------------------------------------------------------------------------
  // Create session (simulates SDK flow with XDR preview)
  // ---------------------------------------------------------------------------

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)

    // Simulate buildUnsignedXdr call
    await new Promise(r => setTimeout(r, 800))

    const mockXdr =
      `AAAAAQ${'A'.repeat(16)}` +
      `create_session:agent=${form.agentPublicKey}` +
      `:limitPerTx=${form.limitPerTx * 1e7}` +
      `:limitPerSession=${form.limitPerSession * 1e7}` +
      `:duration=${form.durationLedgers}` +
      `${'X'.repeat(32)}`

    setXdrPreview(mockXdr)
    setSubmitting(false)

    // After user copies/closes XDR, add the new session
    const newSession: Session = {
      id:              `sess_${Math.random().toString(36).slice(2, 9)}`,
      agentPublicKey:  form.agentPublicKey,
      ownerPublicKey:  form.ownerPublicKey,
      limitPerTx:      form.limitPerTx,
      limitPerSession: form.limitPerSession,
      spent:           0,
      expiresAtLedger: 52_000_000 + form.durationLedgers,
      durationLedgers: form.durationLedgers,
      active:          true,
      createdAt:       new Date().toISOString(),
      txCount:         0,
    }

    setSessions(prev => [newSession, ...prev])
    setSuccessMsg(`Session ${newSession.id} created — copy the XDR above, sign with Freighter, then submit.`)
    setShowForm(false)
    setForm({ ownerPublicKey: '', agentPublicKey: '', limitPerTx: 100, limitPerSession: 1000, durationLedgers: 17_280 })
    setTimeout(() => setSuccessMsg(null), 6000)
  }, [form])

  const handleRevoke = useCallback((id: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, active: false } : s))
  }, [])

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const active        = sessions.filter(s => s.active)
  const totalSpent    = active.reduce((a, s) => a + s.spent, 0)
  const totalPool     = active.reduce((a, s) => a + s.limitPerSession, 0)
  const totalTx       = sessions.reduce((a, s) => a + s.txCount, 0)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {xdrPreview && <XdrModal xdr={xdrPreview} onClose={() => setXdrPreview(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Sessions
          </h1>
          <p className="text-sm text-slate-400">
            On-chain agent sessions with bounded spending limits. Each session emits an unsigned XDR for Freighter.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-semibold transition-all shadow-lg shadow-amber-900/30"
        >
          {showForm ? '✕ Cancel' : '+ New Session'}
        </button>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div role="status" className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 text-sm px-4 py-3 rounded-xl">
          <span>✓</span> {successMsg}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-slate-900/30 border border-white/10 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest mb-5">Create Agent Session</h3>
          <form onSubmit={handleCreate} noValidate className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Owner Public Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" value={form.ownerPublicKey}
                  onChange={e => set('ownerPublicKey', e.target.value)}
                  placeholder="G... (56-char Stellar address — signs with Freighter)"
                  className={`w-full bg-slate-950/70 border rounded-xl py-2.5 px-3 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 transition-colors ${errors.ownerPublicKey ? 'border-red-500/60' : 'border-white/10'}`}
                />
                <FieldError msg={errors.ownerPublicKey} />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Agent Machine Public Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" value={form.agentPublicKey}
                  onChange={e => set('agentPublicKey', e.target.value)}
                  placeholder="G... (agent machine keypair — server-side only, never owner key)"
                  className={`w-full bg-slate-950/70 border rounded-xl py-2.5 px-3 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 transition-colors ${errors.agentPublicKey ? 'border-red-500/60' : 'border-white/10'}`}
                />
                <FieldError msg={errors.agentPublicKey} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Per-Transaction Limit (USDC) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input
                    type="number" min={1} value={form.limitPerTx}
                    onChange={e => set('limitPerTx', Number(e.target.value))}
                    className={`w-full bg-slate-950/70 border rounded-xl py-2.5 pl-7 pr-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60 transition-colors ${errors.limitPerTx ? 'border-red-500/60' : 'border-white/10'}`}
                  />
                </div>
                <FieldError msg={errors.limitPerTx} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Session Total Limit (USDC) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input
                    type="number" min={1} value={form.limitPerSession}
                    onChange={e => set('limitPerSession', Number(e.target.value))}
                    className={`w-full bg-slate-950/70 border rounded-xl py-2.5 pl-7 pr-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60 transition-colors ${errors.limitPerSession ? 'border-red-500/60' : 'border-white/10'}`}
                  />
                </div>
                <FieldError msg={errors.limitPerSession} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Duration (ledgers)
                </label>
                <input
                  type="number" min={100} value={form.durationLedgers}
                  onChange={e => set('durationLedgers', Number(e.target.value))}
                  className={`w-full bg-slate-950/70 border rounded-xl py-2.5 px-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60 transition-colors ${errors.durationLedgers ? 'border-red-500/60' : 'border-white/10'}`}
                />
                <FieldError msg={errors.durationLedgers} />
                <p className="mt-1 text-[10px] text-slate-600">17 280 = 24 h · 120 960 = 7 days</p>
              </div>

              <div className="flex items-end">
                <div className="rounded-lg bg-amber-900/10 border border-amber-800/20 px-3 py-2 w-full text-[11px] text-amber-300/60 font-mono leading-relaxed">
                  Submitting will call<br />
                  <strong>buildUnsignedXdr("create_session")</strong><br />
                  and show the XDR for Freighter signing.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
              <button
                type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Building XDR…</>
                ) : (
                  'Build & Preview XDR'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Sessions"  value={String(active.length)} />
        <StatCard label="Total Sessions"   value={String(sessions.length)} />
        <StatCard label="Pool Spent"        value={`$${totalSpent.toLocaleString()}`} />
        <StatCard label="Total Payments"   value={String(totalTx)} sub="across all sessions" />
      </div>

      {/* Filter + sort controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-white/5 border border-white/[0.06] p-1">
          {(['all', 'active', 'revoked'] as FilterKey[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                filter === f ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-white/20 font-mono">Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white/50 focus:outline-none focus:border-amber-500/40 cursor-pointer"
          >
            <option value="createdAt">Newest</option>
            <option value="spent">Most spent</option>
            <option value="remaining">Most remaining</option>
            <option value="limitPerSession">Largest pool</option>
          </select>
        </div>
      </div>

      {/* Session list */}
      <div className="space-y-3">
        {displayed.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm border border-white/5 rounded-2xl">
            No sessions match the current filter.
          </div>
        )}
        {displayed.map(s => (
          <div
            key={s.id}
            className={`rounded-2xl border bg-white/[0.02] p-5 space-y-4 transition-opacity ${
              s.active ? 'border-white/[0.08]' : 'border-white/[0.03] opacity-50'
            }`}
          >
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <code className="font-mono text-amber-400/90 text-sm font-semibold">{s.id}</code>
                  <StatusPill active={s.active} />
                  <span className="text-[10px] text-white/20 font-mono">{s.txCount} tx</span>
                </div>
                <p className="text-xs text-white/30 font-mono truncate">Agent: {s.agentPublicKey}</p>
                <p className="text-[10px] text-white/20 font-mono mt-0.5">
                  Owner: {s.ownerPublicKey} · Created {new Date(s.createdAt).toLocaleString()}
                </p>
                <p className="text-[10px] text-white/15 font-mono">
                  Expires ledger {s.expiresAtLedger.toLocaleString()} · Duration {s.durationLedgers.toLocaleString()} ledgers
                </p>
              </div>
              <div className="flex gap-2">
                {s.active && (
                  <>
                    <button
                      onClick={() => {
                        const xdr = `AAAAAQ${'A'.repeat(8)}revoke_session:id=${s.id}${'X'.repeat(24)}`
                        setXdrPreview(xdr)
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:bg-white/5 transition-colors"
                    >
                      Preview Revoke XDR
                    </button>
                    <button
                      onClick={() => handleRevoke(s.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-900/20 transition-colors"
                    >
                      Revoke
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                ['Per-tx limit',   `$${s.limitPerTx.toLocaleString()}`],
                ['Session limit',  `$${s.limitPerSession.toLocaleString()}`],
                ['Remaining',      `$${(s.limitPerSession - s.spent).toLocaleString()}`],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
                  <p className="text-[10px] text-white/30 uppercase font-mono">{label}</p>
                  <p className="text-sm font-semibold text-white tabular-nums">{val}</p>
                </div>
              ))}
            </div>

            <BudgetBar spent={s.spent} limit={s.limitPerSession} />
          </div>
        ))}
      </div>
    </div>
  )
}
