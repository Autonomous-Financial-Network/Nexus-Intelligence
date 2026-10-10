import { useMemo } from 'react'

// ---------------------------------------------------------------------------
// Static demo data (mirrors the mock sessions/agents on other pages)
// ---------------------------------------------------------------------------

interface DailyStat { day: string; volume: number; count: number }
interface AgentStat { name: string; model: string; spent: number; txCount: number; limitPerSession: number }
interface ToolStat  { name: string; calls: number; successRate: number }

const DAILY_STATS: DailyStat[] = [
  { day: 'Oct 4',  volume: 0,      count: 0  },
  { day: 'Oct 5',  volume: 320,    count: 4  },
  { day: 'Oct 6',  volume: 870,    count: 11 },
  { day: 'Oct 7',  volume: 1540,   count: 19 },
  { day: 'Oct 8',  volume: 980,    count: 13 },
  { day: 'Oct 9',  volume: 2210,   count: 28 },
  { day: 'Oct 10', volume: 1480,   count: 18 },
]

const AGENT_STATS: AgentStat[] = [
  { name: 'Invoice Payer',       model: 'gpt-4o',          spent: 1240,  txCount: 8,  limitPerSession: 5000  },
  { name: 'Payroll Bot',         model: 'claude-3-5-haiku', spent: 4800,  txCount: 24, limitPerSession: 10000 },
  { name: 'Treasury Rebalancer', model: 'gpt-4o-mini',     spent: 0,     txCount: 0,  limitPerSession: 50000 },
]

const TOOL_STATS: ToolStat[] = [
  { name: 'stellar_payment',           calls: 58,  successRate: 96.6 },
  { name: 'stellar_get_balance',        calls: 103, successRate: 100  },
  { name: 'stellar_get_session_status', calls: 212, successRate: 100  },
  { name: 'stellar_path_payment',       calls: 9,   successRate: 88.9 },
]

// ---------------------------------------------------------------------------
// Mini sparkline bar chart
// ---------------------------------------------------------------------------

function SparkBar({ value, max, color = 'bg-amber-500/70' }: { value: number; max: number; color?: string }) {
  const h = max > 0 ? Math.max(4, Math.round((value / max) * 80)) : 4
  return (
    <div className="flex items-end h-20">
      <div className={`w-full rounded-t-md ${color} transition-all`} style={{ height: `${h}px` }} />
    </div>
  )
}

function VolumeChart({ data }: { data: DailyStat[] }) {
  const maxVol = Math.max(...data.map(d => d.volume), 1)
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-20">
        {data.map(d => (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
            <SparkBar value={d.volume} max={maxVol} />
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {data.map(d => (
          <div key={d.day} className="flex-1 text-center">
            <p className="text-[9px] text-white/20 font-mono truncate">{d.day.split(' ')[1]}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  sub,
  accent = false,
  delta,
}: {
  label:   string
  value:   string
  sub?:    string
  accent?: boolean
  delta?:  { value: string; positive: boolean }
}) {
  return (
    <div className={`rounded-2xl border px-5 py-4 space-y-1 ${
      accent
        ? 'border-amber-700/40 bg-amber-900/10'
        : 'border-white/[0.06] bg-white/[0.02]'
    }`}>
      <p className="text-[10px] text-white/30 uppercase font-mono tracking-wider">{label}</p>
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
        {delta && (
          <span className={`text-[11px] font-mono ${delta.positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {delta.positive ? '▲' : '▼'} {delta.value}
          </span>
        )}
      </div>
      {sub && <p className="text-[10px] text-white/20 font-mono">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donut-style utilisation ring (CSS only)
// ---------------------------------------------------------------------------

function UtilRing({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const bg      = `conic-gradient(${color} ${clamped}%, transparent ${clamped}%)`
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
      style={{ background: bg }}
      aria-label={`${clamped.toFixed(0)}% utilised`}
    >
      <div className="w-6 h-6 rounded-full bg-[#0d0a00] flex items-center justify-center">
        <span className="text-[8px] font-mono text-white/50">{clamped.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const totalVolume  = useMemo(() => DAILY_STATS.reduce((s, d) => s + d.volume, 0), [])
  const totalTx      = useMemo(() => DAILY_STATS.reduce((s, d) => s + d.count, 0),  [])
  const avgTx        = useMemo(() => totalTx > 0 ? (totalVolume / totalTx).toFixed(2) : '0', [totalVolume, totalTx])
  const todayVol     = DAILY_STATS[DAILY_STATS.length - 1]?.volume ?? 0
  const todayCount   = DAILY_STATS[DAILY_STATS.length - 1]?.count  ?? 0
  const yesterday    = DAILY_STATS[DAILY_STATS.length - 2]?.volume ?? 0
  const volDelta     = yesterday > 0 ? (((todayVol - yesterday) / yesterday) * 100).toFixed(1) : '0'
  const totalSessions = AGENT_STATS.length + 2  // +2 from seed data

  const topAgent = useMemo(() =>
    [...AGENT_STATS].sort((a, b) => b.spent - a.spent)[0],
    [],
  )

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="border-b border-white/5 pb-5">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Analytics
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Payment volume, session utilisation, and tool usage across all agents.
        </p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="7-Day Volume"
          value={`$${totalVolume.toLocaleString()}`}
          sub="USDC total"
          accent
          delta={{ value: `${Math.abs(Number(volDelta))}%`, positive: Number(volDelta) >= 0 }}
        />
        <MetricCard
          label="Total Payments"
          value={String(totalTx)}
          sub={`avg $${avgTx} per tx`}
        />
        <MetricCard
          label="Today's Volume"
          value={`$${todayVol.toLocaleString()}`}
          sub={`${todayCount} payments`}
        />
        <MetricCard
          label="Active Sessions"
          value={String(totalSessions)}
          sub="across all agents"
        />
      </div>

      {/* Volume chart + top agent */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">

        {/* Volume chart */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Daily Payment Volume</p>
              <p className="text-[10px] text-white/30 font-mono mt-0.5">USDC · last 7 days</p>
            </div>
            <span className="text-xs text-amber-400/70 font-mono">${totalVolume.toLocaleString()} total</span>
          </div>
          <VolumeChart data={DAILY_STATS} />
          <div className="flex gap-4 pt-1 border-t border-white/5">
            {DAILY_STATS.map(d => (
              <div key={d.day} className="flex-1 text-center">
                <p className="text-[10px] text-white/40 tabular-nums font-mono">${d.volume > 0 ? (d.volume / 1000).toFixed(1) + 'k' : '0'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Top agent card */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
          <p className="text-sm font-semibold text-white">Top Agent</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-900/30 border border-amber-800/40 flex items-center justify-center text-xl shrink-0">
              🤖
            </div>
            <div>
              <p className="text-sm font-medium text-white">{topAgent.name}</p>
              <p className="text-[11px] text-white/30 font-mono">{topAgent.model}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Volume</span>
              <span className="text-white font-semibold tabular-nums">${topAgent.spent.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Payments</span>
              <span className="text-white font-semibold tabular-nums">{topAgent.txCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Utilisation</span>
              <span className="text-white font-semibold tabular-nums">
                {((topAgent.spent / topAgent.limitPerSession) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500/70 transition-all"
              style={{ width: `${Math.min(100, (topAgent.spent / topAgent.limitPerSession) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Agent breakdown */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <p className="text-sm font-semibold text-white">Agent Breakdown</p>
          <p className="text-[10px] text-white/30 font-mono mt-0.5">Session utilisation and payment activity</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {AGENT_STATS.map(a => {
            const pct   = Math.min(100, (a.spent / a.limitPerSession) * 100)
            const color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#d97706'
            return (
              <div key={a.name} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <UtilRing pct={pct} color={color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-white">{a.name}</p>
                    <span className="text-[10px] font-mono text-white/30">{a.model}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden w-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white tabular-nums">${a.spent.toLocaleString()}</p>
                  <p className="text-[10px] text-white/30 font-mono">{a.txCount} tx</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tool usage */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <p className="text-sm font-semibold text-white">Tool Usage</p>
          <p className="text-[10px] text-white/30 font-mono mt-0.5">Calls and success rates across all agent sessions</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {TOOL_STATS.map(t => {
            const totalCalls = TOOL_STATS.reduce((s, x) => s + x.calls, 0)
            const sharePct   = ((t.calls / totalCalls) * 100).toFixed(1)
            const successColor = t.successRate >= 99 ? 'text-emerald-300' : t.successRate >= 90 ? 'text-amber-300' : 'text-red-400'
            return (
              <div key={t.name} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
                <code className="text-amber-400/80 text-xs font-mono w-48 shrink-0">{t.name}</code>
                <div className="flex-1">
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/60 transition-all"
                      style={{ width: `${sharePct}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-white/40 tabular-nums font-mono w-16 text-right">{t.calls} calls</span>
                <span className={`text-xs font-mono w-14 text-right ${successColor}`}>{t.successRate}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Daily breakdown table */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <p className="text-sm font-semibold text-white">Daily Breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-white/5">
                {['Date', 'Volume (USDC)', 'Payments', 'Avg Tx Size'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-[10px] text-white/30 uppercase tracking-wider font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {[...DAILY_STATS].reverse().map(d => (
                <tr key={d.day} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3 text-white/60">{d.day}</td>
                  <td className="px-6 py-3 text-white tabular-nums">${d.volume.toLocaleString()}</td>
                  <td className="px-6 py-3 text-white/60 tabular-nums">{d.count}</td>
                  <td className="px-6 py-3 text-white/60 tabular-nums">
                    {d.count > 0 ? `$${(d.volume / d.count).toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
