import React, { useState, useRef, useEffect } from 'react'

// ── Icons ───────────────────────────────────────────────────────────────────
const IconTerminal = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
const IconPlay = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
const IconBot = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M12 8V4H8"></path><line x1="9" y1="13" x2="9" y2="15"></line><line x1="15" y1="13" x2="15" y2="15"></line></svg>
const IconUser = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
const IconTool = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
const IconCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>

interface LogEntry { id: number; type: 'agent' | 'tool' | 'result' | 'system' | 'user'; message: string; timestamp: string }
interface Session { id: string; limitPerTx: number; limitPerSession: number; spent: number; active: boolean }

const DEMO_SCENARIOS = [
  { label: 'Pay invoice', prompt: 'Pay $50 USDC to GABC...XYZ for invoice INV-2026-001' },
  { label: 'Check balance', prompt: 'What is the USDC balance of GDEF...UVW?' },
  { label: 'Batch payroll', prompt: 'Send $100 to each of: GABC...XYZ, GDEF...UVW, GHIJ...RST' },
  { label: 'Check limits', prompt: 'How much budget do I have left this session?' },
]

export default function Playground() {
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 0, type: 'system', message: 'Nexus Intelligence Sandbox initialized. Start a session to execute agents.', timestamp: now() }
  ])
  const [session, setSession] = useState<Session | null>(null)
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [limitPerTx, setLimitPerTx] = useState(100)
  const [limitPerSession, setLimitPerSession] = useState(1000)
  const logRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(1)

  function now() { return new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) }
  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

  function addLog(type: LogEntry['type'], message: string) {
    setLogs(l => {
      const next = [...l, { id: idRef.current++, type, message, timestamp: now() }]
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      }, 50)
      return next
    })
  }

  async function createSession() {
    addLog('system', `Spinning up sandbox session (Tx Limit: $${limitPerTx}, Total Pool: $${limitPerSession})...`)
    await sleep(650)
    const sid = `sess_${Math.random().toString(36).slice(2, 9)}`
    setSession({ id: sid, limitPerTx, limitPerSession, spent: 0, active: true })
    addLog('system', `Secure Agent Session [${sid}] online. Send commands below.`)
  }

  async function runAgent(prompt: string) {
    if (!session) return
    setRunning(true)
    addLog('user', prompt)
    await sleep(600)

    addLog('agent', 'Evaluating natural language intent and matching tools...')
    await sleep(800)

    if (prompt.toLowerCase().includes('balance')) {
      addLog('tool', 'stellar_get_balance({ account: "GDEF...UVW" })')
      await sleep(700)
      addLog('result', '{"account":"GDEF...UVW","usdc":4250.00}')
      addLog('agent', 'The USDC balance of GDEF...UVW is currently $4,250.00.')
    } else if (prompt.toLowerCase().includes('session') || prompt.toLowerCase().includes('budget') || prompt.toLowerCase().includes('limit')) {
      addLog('tool', 'stellar_get_session_status()')
      await sleep(500)
      addLog('result', JSON.stringify({ sessionId: session.id, limitPerTx: session.limitPerTx, totalLimit: session.limitPerSession, spent: session.spent }))
      addLog('agent', `Your remaining budget is $${session.limitPerSession - session.spent} USDC out of a $${session.limitPerSession} USDC total limit.`)
    } else if (prompt.toLowerCase().includes('batch') || prompt.toLowerCase().includes('each')) {
      const recipients = ['GABC...XYZ', 'GDEF...UVW', 'GHIJ...RST']
      for (const r of recipients) {
        addLog('tool', `stellar_payment({ recipient: "${r}", amount_usdc: 100, memo: "payroll" })`)
        await sleep(700)
        const newSpent = session.spent + 100
        if (newSpent > session.limitPerSession) {
          addLog('result', `Error: Session limit exceeded`)
          addLog('agent', 'Transaction aborted. Doing this would violate the session budget.')
          setRunning(false)
          return
        }
        setSession(s => s ? { ...s, spent: s.spent + 100 } : s)
        addLog('result', `{"success":true,"txHash":"tx_${Math.random().toString(36).slice(2,10)}"}`)
      }
      addLog('agent', `Successfully completed batch transfers of $100 USDC each to GABC...XYZ, GDEF...UVW, and GHIJ...RST.`)
    } else {
      const match = prompt.match(/\$(\d+)/)
      const amount = match ? parseInt(match[1]) : 50
      const recip = prompt.match(/G[A-Z0-9]{10,}/)?.[0] ?? 'GABC...XYZ'
      const inv = prompt.match(/INV-[\w-]+/)?.[0] ?? 'INV-001'

      if (amount > session.limitPerTx) {
        addLog('agent', `Denied: Amount ($${amount}) exceeds the per-transaction limit of $${session.limitPerTx} USDC.`)
        setRunning(false)
        return
      }
      if (session.spent + amount > session.limitPerSession) {
        addLog('agent', `Denied: Insufficient session budget. Only $${session.limitPerSession - session.spent} USDC remains.`)
        setRunning(false)
        return
      }

      addLog('tool', `stellar_payment({ recipient: "${recip}", amount_usdc: ${amount}, memo: "${inv}" })`)
      await sleep(900)
      const txHash = 'tx_' + Math.random().toString(36).slice(2, 10)
      setSession(s => s ? { ...s, spent: s.spent + amount } : s)
      addLog('result', `{"success":true,"txHash":"${txHash}"}`)
      addLog('agent', `Successfully sent payment of $${amount} USDC to ${recip}. transaction hash: ${txHash}`)
    }
    setRunning(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || running || !session) return
    const prompt = input.trim()
    setInput('')
    await runAgent(prompt)
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Visual Header / Summary Stats */}
      <div className="flex flex-wrap items-center justify-between gap-6 border-b border-white/5 pb-6">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            AI Agent Sandbox
          </h2>
          <p className="text-sm text-slate-400">Launch autonomous agent runs with natural language constraints.</p>
        </div>
        
        {session && (
          <div className="flex items-center gap-6 text-sm bg-slate-900/40 px-5 py-2.5 rounded-xl border border-white/10 ring-1 ring-white/5 backdrop-blur-md">
            <span className="flex items-center gap-2 text-slate-300 font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
              </span>
              Session: <code className="text-violet-300 font-mono">{session.id}</code>
            </span>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-3">
              <span className="text-slate-400">Pool spent:</span>
              <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-500" 
                     style={{ width: `${Math.min(100, (session.spent / session.limitPerSession) * 100)}%` }} />
              </div>
              <span className="text-slate-300 font-mono text-xs font-semibold">${session.spent} / ${session.limitPerSession}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Config & Presets */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Configuration Card */}
          <div className="agent-panel p-5 ring-1 ring-white/5 bg-slate-900/20 backdrop-blur-md shadow-xl border border-white/10 rounded-2xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
              <IconSettings /> Session Policies
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Single Transaction Max (USDC)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input type="number" value={limitPerTx} onChange={e => setLimitPerTx(+e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-8 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-all font-mono" />
                </div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Session Pool Total (USDC)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input type="number" value={limitPerSession} onChange={e => setLimitPerSession(+e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-8 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-all font-mono" />
                </div>
              </div>
              
              <button onClick={createSession}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg shadow-violet-500/20 flex justify-center gap-2 items-center">
                {session ? 'RE-GENERATE SESSION' : 'START PLAYGROUND RUN'}
              </button>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="agent-panel p-5 ring-1 ring-white/5 bg-slate-900/20 backdrop-blur-md shadow-xl border border-white/10 rounded-2xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
              <IconTerminal /> Scenario Shortcuts
            </h3>
            <div className="space-y-2">
              {DEMO_SCENARIOS.map(s => (
                <button key={s.label} onClick={() => setInput(s.prompt)} disabled={!session || running}
                  className="w-full text-left group bg-slate-950/40 hover:bg-violet-950/30 border border-white/5 hover:border-violet-500/30 p-3.5 rounded-xl transition-all disabled:opacity-40 disabled:hover:border-white/5 disabled:hover:bg-slate-950/40">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 group-hover:text-violet-300 transition-colors mb-1">
                    {s.label}
                    <IconPlay />
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono group-hover:text-slate-400 transition-colors truncate">{s.prompt}</p>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Dynamic Terminal / Chat Screen */}
        <div className="lg:col-span-8 flex flex-col h-[520px] bg-slate-900/10 border border-white/10 ring-1 ring-white/5 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden">
          
          {/* Chat / Run history */}
          <div ref={logRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <div className="text-center space-y-2">
                  <p className="text-4xl animate-bounce">🤖</p>
                  <p className="text-sm">Initiate a session to query the agent</p>
                </div>
              </div>
            ) : (
              logs.map(log => {
                const isUser = log.type === 'user'
                const isAgent = log.type === 'agent'
                const isTool = log.type === 'tool'
                const isRes = log.type === 'result'
                const isSys = log.type === 'system'

                if (isSys) {
                  return (
                    <div key={log.id} className="flex justify-center animate-in fade-in duration-300">
                      <div className="bg-slate-950/60 border border-white/5 text-[11px] font-mono text-slate-400 px-4 py-1.5 rounded-full flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
                        {log.message}
                      </div>
                    </div>
                  )
                }

                if (isTool || isRes) {
                  return (
                    <div key={log.id} className="ml-12 mr-6 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className={`p-4 rounded-xl border font-mono text-xs ${isTool ? 'bg-slate-950/70 border-violet-900/20 text-slate-300' : 'bg-slate-950/90 border-emerald-950/20 text-emerald-400'}`}>
                        <div className="flex items-center gap-2 mb-2 font-sans font-semibold text-[10px] text-slate-500 uppercase tracking-widest">
                          {isTool ? <IconTool /> : '↳'} {isTool ? 'Sub-Agent Capability Call' : 'Stellar Ledger Response'}
                        </div>
                        {log.message}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={log.id} className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className="shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${isUser ? 'bg-gradient-to-br from-violet-600 to-purple-600 border-white/10 text-white' : 'bg-slate-950 border-white/5 text-slate-300'}`}>
                        {isUser ? <IconUser /> : <IconBot />}
                      </div>
                    </div>
                    
                    <div className={`max-w-[75%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-md' : 'bg-slate-950/60 border border-white/5 text-slate-200'}`}>
                        {log.message}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">{log.timestamp}</span>
                    </div>
                  </div>
                )
              })
            )}

            {running && (
              <div className="flex gap-4 animate-in fade-in duration-300">
                <div className="shrink-0">
                  <div className="w-8 h-8 rounded-full bg-slate-950 border border-white/5 text-slate-300 flex items-center justify-center animate-pulse">
                    <IconBot />
                  </div>
                </div>
                <div className="bg-slate-950/40 border border-white/5 px-4 py-3 rounded-2xl flex items-center gap-1.5 h-10">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce delay-200"></span>
                </div>
              </div>
            )}
          </div>

          {/* Form Command Box */}
          <div className="p-4 bg-slate-950/80 border-t border-white/10">
            <form onSubmit={handleSubmit} className="relative flex items-center w-full">
              <input value={input} onChange={e => setInput(e.target.value)}
                placeholder={session ? "Instruct the Stellar agent, e.g., 'Check my balances'..." : "Initialize a run session to unlock inputs..."}
                disabled={!session || running}
                className="w-full bg-slate-900/60 border border-white/10 focus:border-violet-500 rounded-xl pl-4 pr-12 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all disabled:opacity-50" />
              <button type="submit" disabled={!session || running || !input.trim()}
                className="absolute right-2 p-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
