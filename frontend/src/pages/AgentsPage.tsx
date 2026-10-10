import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Agent {
  id: string; name: string; model: string
  sessionId: string; limitPerTx: number; limitPerSession: number
  spent: number; active: boolean; paymentsCount: number
}

interface NewSessionForm {
  name: string
  model: string
  limitPerTx: number
  limitPerSession: number
}

type FormErrors = Partial<Record<keyof NewSessionForm, string>>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-haiku', 'claude-3-7-sonnet', 'llama-3.3-70b'] as const

const MOCK_AGENTS: Agent[] = [
  { id: 'a1', name: 'Invoice Payer', model: 'gpt-4o', sessionId: 'SES-4291', limitPerTx: 500, limitPerSession: 5000, spent: 1240, active: true, paymentsCount: 8 },
  { id: 'a2', name: 'Payroll Bot', model: 'claude-3-5-haiku', sessionId: 'SES-3847', limitPerTx: 200, limitPerSession: 10000, spent: 4800, active: true, paymentsCount: 24 },
  { id: 'a3', name: 'Treasury Rebalancer', model: 'gpt-4o-mini', sessionId: 'SES-2156', limitPerTx: 1000, limitPerSession: 50000, spent: 0, active: false, paymentsCount: 0 },
]

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(form: NewSessionForm): FormErrors {
  const e: FormErrors = {}
  if (!form.name.trim()) e.name = 'Agent name is required.'
  if (form.name.trim().length > 40) e.name = 'Max 40 characters.'
  if (!form.model) e.model = 'Select a model.'
  if (form.limitPerTx <= 0) e.limitPerTx = 'Must be greater than 0.'
  if (form.limitPerSession <= 0) e.limitPerSession = 'Must be greater than 0.'
  if (form.limitPerTx > form.limitPerSession) e.limitPerTx = 'Per-tx limit cannot exceed session limit.'
  return e
}

// ---------------------------------------------------------------------------
// New Session Modal
// ---------------------------------------------------------------------------

function NewSessionModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (agent: Agent) => void
}) {
  const [form, setForm] = useState<NewSessionForm>({ name: '', model: 'gpt-4o', limitPerTx: 100, limitPerSession: 1000 })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [mounted, setMounted] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true); return () => { setMounted(false) } }, [])
  useEffect(() => {
    if (open) { const t = setTimeout(() => firstRef.current?.focus(), 60); return () => clearTimeout(t) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const set = useCallback(<K extends keyof NewSessionForm>(k: K, v: NewSessionForm[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: undefined }))
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 800))
    const newAgent: Agent = {
      id: `a${Date.now()}`,
      name: form.name.trim(),
      model: form.model,
      sessionId: `SES-${Math.floor(Math.random() * 9000) + 1000}`,
      limitPerTx: form.limitPerTx,
      limitPerSession: form.limitPerSession,
      spent: 0,
      active: true,
      paymentsCount: 0,
    }
    onCreated(newAgent)
    setSuccess(true)
    setSubmitting(false)
    timerRef.current = setTimeout(() => {
      setSuccess(false)
      setForm({ name: '', model: 'gpt-4o', limitPerTx: 100, limitPerSession: 1000 })
      onClose()
    }, 1200)
  }, [form, onCreated, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-session-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md bg-[#0d0a00] border border-white/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 id="new-session-title" className="text-sm font-semibold text-white">New Agent Session</h2>
            <p className="text-xs text-white/30 mt-0.5">Configure limits and assign an LLM model.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4">
            {/* Agent name */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Agent Name <span className="text-red-400">*</span>
              </label>
              <input
                ref={firstRef}
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Invoice Payer"
                disabled={submitting || success}
                className={`w-full bg-black/40 border rounded-xl py-2.5 px-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/60 transition-colors ${errors.name ? 'border-red-500/60' : 'border-white/10'}`}
              />
              {errors.name && <p role="alert" className="mt-1 text-[11px] text-red-400">⚠ {errors.name}</p>}
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                LLM Model <span className="text-red-400">*</span>
              </label>
              <select
                value={form.model}
                onChange={e => set('model', e.target.value)}
                disabled={submitting || success}
                className={`w-full bg-black/40 border rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-amber-500/60 transition-colors appearance-none cursor-pointer ${errors.model ? 'border-red-500/60' : 'border-white/10'}`}
              >
                {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {errors.model && <p role="alert" className="mt-1 text-[11px] text-red-400">⚠ {errors.model}</p>}
            </div>

            {/* Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Per-Tx Limit ($) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number" min={1} value={form.limitPerTx}
                  onChange={e => set('limitPerTx', Number(e.target.value))}
                  disabled={submitting || success}
                  className={`w-full bg-black/40 border rounded-xl py-2.5 px-3 text-sm font-mono text-white focus:outline-none focus:border-amber-500/60 transition-colors ${errors.limitPerTx ? 'border-red-500/60' : 'border-white/10'}`}
                />
                {errors.limitPerTx && <p role="alert" className="mt-1 text-[11px] text-red-400">⚠ {errors.limitPerTx}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Session Limit ($) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number" min={1} value={form.limitPerSession}
                  onChange={e => set('limitPerSession', Number(e.target.value))}
                  disabled={submitting || success}
                  className={`w-full bg-black/40 border rounded-xl py-2.5 px-3 text-sm font-mono text-white focus:outline-none focus:border-amber-500/60 transition-colors ${errors.limitPerSession ? 'border-red-500/60' : 'border-white/10'}`}
                />
                {errors.limitPerSession && <p role="alert" className="mt-1 text-[11px] text-red-400">⚠ {errors.limitPerSession}</p>}
              </div>
            </div>

            {success && (
              <div role="status" className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 px-4 py-2.5 rounded-xl">
                ✓ Session created successfully.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
            <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting || success} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white transition-all disabled:opacity-50">
              {submitting ? (<><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Creating…</>) : success ? '✓ Created' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [agents, setAgents] = useState(MOCK_AGENTS)
  const [showModal, setShowModal] = useState(false)

  const revoke = (id: string) => setAgents(prev => prev.map(a => a.id === id ? { ...a, active: false } : a))

  const handleCreated = useCallback((agent: Agent) => {
    setAgents(prev => [agent, ...prev])
  }, [])

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Agents</h1>
          <p className="text-sm text-white/40">Active agent sessions and their on-chain spending limits</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-medium transition-all shadow-lg shadow-amber-900/30"
        >
          + New session
        </button>
      </div>

      <NewSessionModal open={showModal} onClose={() => setShowModal(false)} onCreated={handleCreated} />

      <div className="space-y-4">
        {agents.map(a => {
          const utilPct = (a.spent / a.limitPerSession) * 100
          return (
            <div key={a.id} className={`rounded-2xl border bg-white/[0.02] p-6 space-y-4 ${a.active ? 'border-white/[0.08]' : 'border-white/[0.03] opacity-60'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${a.active ? 'bg-amber-900/30 border border-amber-800/40' : 'bg-white/5 border border-white/10'}`}>
                  🤖
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-0.5">
                    <span className="font-semibold text-white">{a.name}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${a.active ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/50' : 'text-white/30 bg-white/5 border-white/10'}`}>
                      {a.active ? 'Active' : 'Revoked'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/40 font-mono">
                    <span>{a.sessionId}</span>
                    <span className="text-white/20">·</span>
                    <span>{a.model}</span>
                    <span className="text-white/20">·</span>
                    <span>{a.paymentsCount} payments</span>
                  </div>
                </div>
                {a.active && (
                  <button onClick={() => revoke(a.id)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-900/20 transition-all">
                    Revoke
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Per-tx limit', `$${a.limitPerTx}`],
                  ['Session limit', `$${a.limitPerSession.toLocaleString()}`],
                  ['Spent', `$${a.spent.toLocaleString()}`],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
                    <p className="text-[10px] text-white/30 uppercase font-mono">{label}</p>
                    <p className="text-sm font-semibold text-white tabular-nums">{val}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-white/30">
                  <span>Session budget</span>
                  <span>{utilPct.toFixed(1)}% used</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${utilPct > 80 ? 'bg-red-500' : utilPct > 50 ? 'bg-amber-400' : 'bg-amber-500/70'}`}
                    style={{ width: `${Math.min(100, utilPct)}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
