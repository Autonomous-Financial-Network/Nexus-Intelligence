const TOOLS = [
  {
    name: 'stellar_payment',
    icon: '💸',
    status: 'live',
    description: 'Send USDC (or any Stellar asset) to a recipient address. Subject to per-tx and per-session spending limits enforced by the on-chain AgentWallet contract.',
    parameters: [
      { name: 'recipient', type: 'string', required: true, desc: 'Stellar G... account address' },
      { name: 'amount_usdc', type: 'number', required: true, desc: 'Amount in USDC (decimal, e.g. 50.00)' },
      { name: 'memo', type: 'string', required: false, desc: 'Payment memo — invoice ID, reference, etc.' },
    ],
    example: `await tools.stellar_payment({
  recipient: "GABC...XYZ",
  amount_usdc: 50.00,
  memo: "INV-2026-001"
})`,
  },
  {
    name: 'stellar_get_balance',
    icon: '💰',
    status: 'live',
    description: 'Query the USDC (or any asset) balance of any Stellar account address. No signing required.',
    parameters: [
      { name: 'account', type: 'string', required: true, desc: 'Stellar G... account address' },
      { name: 'asset', type: 'string', required: false, desc: 'Asset code — defaults to USDC' },
    ],
    example: `await tools.stellar_get_balance({
  account: "GABC...XYZ"
})
// → { account: "GABC...XYZ", usdc: 4250.00 }`,
  },
  {
    name: 'stellar_get_session_status',
    icon: '📊',
    status: 'live',
    description: 'Check remaining session budget before making payments. Call this before any large payment to verify the agent has headroom.',
    parameters: [],
    example: `await tools.stellar_get_session_status()
// → { limitPerTxUsdc: 500, spentUsdc: 240, remainingUsdc: 4760 }`,
  },
  {
    name: 'stellar_path_payment',
    icon: '🔄',
    status: 'planned',
    description: 'Multi-hop payment routing via SDEX — finds the best conversion path and executes cross-asset payments in a single transaction.',
    parameters: [
      { name: 'recipient', type: 'string', required: true, desc: 'Stellar G... account address' },
      { name: 'send_asset', type: 'string', required: true, desc: 'Asset to send (e.g. XLM)' },
      { name: 'receive_asset', type: 'string', required: true, desc: 'Asset recipient receives (e.g. USDC)' },
      { name: 'amount', type: 'number', required: true, desc: 'Amount to send' },
    ],
    example: `// Wave contribution gap — not yet implemented`,
  },
]

export default function ToolsPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Agent Tools</h1>
        <p className="text-sm text-white/40">
          Stellar operations exposed as LangChain <code className="font-mono text-amber-400/80 text-[11px]">DynamicStructuredTool</code>s
          and OpenAI function-calling definitions. All tools are session-scoped and enforced on-chain.
        </p>
      </div>

      <div className="space-y-4">
        {TOOLS.map(tool => (
          <div key={tool.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{tool.icon}</span>
                <code className="font-mono text-base font-semibold text-amber-400">{tool.name}</code>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  tool.status === 'live' ? 'text-emerald-300 bg-emerald-900/30 border-emerald-800/50' : 'text-white/30 bg-white/5 border-white/10'
                }`}>
                  {tool.status === 'live' ? 'Live' : 'Planned — Wave issue'}
                </span>
              </div>
              <p className="text-sm text-white/50 leading-relaxed">{tool.description}</p>
            </div>

            {tool.parameters.length > 0 && (
              <div className="border-t border-white/[0.05] px-6 py-4 bg-white/[0.01]">
                <p className="text-[10px] text-white/30 uppercase font-mono tracking-wider mb-3">Parameters</p>
                <div className="space-y-2">
                  {tool.parameters.map(p => (
                    <div key={p.name} className="flex items-start gap-3 text-xs">
                      <code className="font-mono text-amber-300/80 shrink-0 w-40">{p.name}</code>
                      <span className={`font-mono shrink-0 ${p.required ? 'text-white/40' : 'text-white/20'}`}>{p.type}{p.required ? '' : '?'}</span>
                      <span className="text-white/30">{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-white/[0.05] px-6 py-4 bg-black/20">
              <p className="text-[10px] text-white/30 uppercase font-mono tracking-wider mb-2">Example</p>
              <pre className="text-xs font-mono text-amber-300/70 whitespace-pre-wrap leading-relaxed overflow-x-auto">{tool.example}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
