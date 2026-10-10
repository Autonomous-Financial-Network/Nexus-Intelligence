import { Routes, Route } from 'react-router-dom'
import Layout        from './components/Layout'
import PlaygroundPage from './pages/Playground'
import AgentsPage    from './pages/AgentsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ToolsPage     from './pages/ToolsPage'
import WalletsPage   from './pages/WalletsPage'
import SessionsPage  from './pages/SessionsPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<PlaygroundPage />} />
        <Route path="/sessions"  element={<SessionsPage />} />
        <Route path="/agents"    element={<AgentsPage />} />
        <Route path="/tools"     element={<ToolsPage />} />
        <Route path="/wallets"   element={<WalletsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Layout>
  )
}
