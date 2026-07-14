const SECURITY_PRINCIPLES = [
  {
    title: 'Key separation',
    icon: '🔑',
    desc: 'The owner keypair (human-controlled, hardware wallet or Freighter) creates sessions. The agent keypair (machine key, server-side) signs individual payments. Never use the same keypair for both roles.',
  },
  {
    title: 'Principle of least privilege',
    icon: '🛡️',
    desc: 'Every agent session has two hard spending caps enforced on-chain: per-transaction limit and per-session limit. An agent that is compromised, hallucinating, or making errors cannot exceed these caps regardless of instructions.',
  },
  {
    title: 'Instant revocation',
    icon: '⚡',
    desc: 'The owner can revoke any session with a single transaction. All subsequent payment attempts from that agent key will fail on-chain immediately — no grace period.',
  },
  {
    title: 'Full audit trail',
    icon: '📜',
    desc: 'Every payment emits a Soroban event (session_id, recipient, amount, memo) indexed by Lumina. Any suspicious agent activity is visible on-chain and queryable by session ID.',
  },
]

export default function WalletsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Agent Wallet Security</h1>
        <p className="text-sm text-white/40">
          How the on-chain <code className="font-mono text-amber-400/80 text-[11px]">agent_wallet</code> contract keeps autonomous payments safe.
        </p>
      </div>

      {/* Architecture diagram */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-5">
        <p className="text-xs text-white/30 uppercase font-mono tracking-wider mb-4">Session lifecycle</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {[
            { step: '1', label: 'Owner creates session', sub: 'Sets per-tx + per-session caps', icon: '👤', color: 'border-amber-700 bg-amber-950/30' },
            { step: '→', label: '', sub: '', icon: '', color: 'border-transparent bg-transparent' },
            { step: '2', label: 'Agent signs payments', sub: 'Machine key, no human in loop', icon: '🤖', color: 'border-amber-600/50 bg-amber-950/20' },
            { step: '→', label: '', sub: '', icon: '', color: 'border-transparent bg-transparent' },
            { step: '3', label: 'Session expires or revoked', sub: 'Owner revokes at any time', icon: '✅', color: 'border-white/10 bg-white/[0.02]' },
          ].map((s, i) => s.icon ? (
            <div key={i} className={`flex-1 rounded-xl border px-4 py-3 ${s.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{s.icon}</span>
                <span className="text-xs font-mono text-amber-400/70">{s.step}</span>
              </div>
              <p className="text-xs font-medium text-white/80">{s.label}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{s.sub}</p>
            </div>
          ) : (
            <span key={i} className="text-white/20 hidden sm:block shrink-0">→</span>
          ))}
        </div>
      </div>

      {/* Security principles */}
      <div className="grid sm:grid-cols-2 gap-4">
        {SECURITY_PRINCIPLES.map(p => (
          <div key={p.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{p.icon}</span>
              <h3 className="text-sm font-semibold text-white">{p.title}</h3>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Quickstart */}
      <div className="rounded-xl border border-white/[0.06] bg-black/30 px-5 py-5">
        <p className="text-xs text-white/30 uppercase font-mono tracking-wider mb-3">Quickstart</p>
        <pre className="text-xs font-mono text-amber-300/70 leading-relaxed overflow-x-auto">{`import { AgentKit } from '@nexus-intelligence-xyz/sdk'

const kit = new AgentKit({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'testnet',
  agentWalletContractId: 'CXXX...',
})

// 1. Owner creates session (signs once)
const session = await kit.createSession({
  agentPublicKey: agentMachineKey,
  limitPerTxUsdc: 100,
  limitPerSessionUsdc: 1000,
})

// 2. Agent pays invoices autonomously
const tools = kit.getLangChainTools(session.sessionId)
// Pass tools to LangChain AgentExecutor...`}</pre>
      </div>
    </div>
  )
}
