import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import PlaygroundPage from './pages/PlaygroundPage'
import AgentsPage from './pages/AgentsPage'
import ToolsPage from './pages/ToolsPage'
import WalletsPage from './pages/WalletsPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"        element={<PlaygroundPage />} />
        <Route path="/agents"  element={<AgentsPage />} />
        <Route path="/tools"   element={<ToolsPage />} />
        <Route path="/wallets" element={<WalletsPage />} />
      </Routes>
    </Layout>
  )
}
