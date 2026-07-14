import { useState } from 'react'

interface Agent {
  id: string; name: string; model: string
  sessionId: string; limitPerTx: number; limitPerSession: number
  spent: number; active: boolean; paymentsCount: number
}

const MOCK_AGENTS: Agent[] = [
  { id: 'a1', name: 'Invoice Payer', model: 'gpt-4o', sessionId: 'SES-4291', limitPerTx: 500, limitPerSession: 5000, spent: 1240, active: true, paymentsCount: 8 },
  { id: 'a2', name: 'Payroll Bot', model: 'claude-3-5-haiku', sessionId: 'SES-3847', limitPerTx: 200, limitPerSession: 10000, spent: 4800, active: true, paymentsCount: 24 },
  { id: 'a3', name: 'Treasury Rebalancer', model: 'gpt-4o-mini', sessionId: 'SES-2156', limitPerTx: 1000, limitPerSession: 50000, spent: 0, active: false, paymentsCount: 0 },
]

export default function AgentsPage() {
  const [agents, setAgents] = useState(MOCK_AGENTS)

  const revoke = (id: string) => setAgents(prev => prev.map(a => a.id === id ? { ...a, active: false } : a))

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Agents</h1>
          <p className="text-sm text-white/40">Active agent sessions and their on-chain spending limits</p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-medium transition-all shadow-lg shadow-amber-900/30">
          + New session
        </button>
      </div>

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
