import { Link, useLocation } from 'react-router-dom'
import { ReactNode, useState } from 'react'

const NAV = [
  { to: '/',          label: 'Playground' },
  { to: '/sessions',  label: 'Sessions'   },
  { to: '/agents',    label: 'Agents'     },
  { to: '/tools',     label: 'Tools'      },
  { to: '/analytics', label: 'Analytics'  },
  { to: '/wallets',   label: 'Security'   },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [mobile, setMobile] = useState(false)

  return (
    <div className="min-h-screen bg-[#0d0a00] text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-yellow-700/3 rounded-full blur-[80px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-[#0d0a00]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-sm shadow-lg shadow-amber-900/40">
              🤖
            </div>
            <span className="font-semibold text-sm">
              Nexus <span className="text-amber-400/70 font-normal hidden sm:inline">Intelligence</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-0.5 flex-1" aria-label="Main navigation">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                  pathname === to
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right slot */}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs text-amber-400/70 font-mono">
              AI Agent SDK · Wave 5
            </span>
            <a
              href="https://github.com/nexus-intelligence-xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-white/20 hover:text-white/50 transition-colors font-mono"
              aria-label="GitHub repository"
            >
              GitHub ↗
            </a>
            <button
              className="sm:hidden text-white/40 hover:text-white transition-colors"
              onClick={() => setMobile(v => !v)}
              aria-label={mobile ? 'Close menu' : 'Open menu'}
              aria-expanded={mobile}
            >
              {mobile ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobile && (
          <nav
            className="sm:hidden border-t border-white/[0.05] bg-[#0d0a00]/95 px-4 py-3 space-y-1"
            aria-label="Mobile navigation"
          >
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobile(false)}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === to
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Page content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] py-4 text-center">
        <p className="text-xs text-white/20">
          Nexus Intelligence · Autonomous AI Agent Payments · Stellar Wave 5
        </p>
      </footer>
    </div>
  )
}
