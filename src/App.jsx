import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import WorkOrders from './pages/WorkOrders'
import WorkOrderDetail from './pages/WorkOrderDetail'
import Assets from './pages/Assets'
import PPM from './pages/PPM'
import Analytics from './pages/Analytics'
import Users from './pages/Users'
import Schedule from './pages/Schedule'
import Stores from './pages/Stores'
import DevPanel from './pages/DevPanel'

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'var(--green)', fontSize:14, fontFamily:"'DM Sans', sans-serif" }}>Loading Fixnar...</div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace/>
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/" replace/>
  return children
}

function AppLayout({ children }) {
  const [open,   setOpen]   = React.useState(false)
  const [pinned, setPinned] = React.useState(() => localStorage.getItem('fixnar_sidebar_pinned') === 'true')
  const sidebarW = 240

  function togglePin() {
    const next = !pinned
    setPinned(next)
    localStorage.setItem('fixnar_sidebar_pinned', String(next))
    if (next) setOpen(true)
  }

  const sidebarVisible = pinned || open

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)', position:'relative' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <TopBar onMenuToggle={() => setOpen(o => !o)} pinned={pinned} onPin={togglePin}/>

      {/* Overlay when sidebar open but not pinned */}
      {open && !pinned && (
        <div onClick={() => setOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:150, backdropFilter:'blur(2px)' }}/>
      )}

      {/* Sidebar */}
      <div style={{
        position:'fixed', top:0,
        left: sidebarVisible ? 0 : -sidebarW,
        width: sidebarW, height:'100vh',
        zIndex:200, transition:'left 0.25s ease',
        boxShadow: !pinned && open ? '4px 0 20px rgba(0,0,0,0.15)' : 'none',
      }}>
        <Sidebar open={sidebarVisible} onClose={() => setOpen(false)} pinned={pinned} onPin={togglePin}/>
      </div>

      <main style={{
        flex:1,
        marginLeft: pinned ? sidebarW : 0,
        padding:'32px 32px',
        paddingTop:'80px',
        minWidth:0,
        overflowX:'auto',
        color:'var(--text)',
        transition:'margin-left 0.25s ease',
      }}>
        {children}
      </main>
    </div>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={!user ? <Login/> : <Navigate to="/" replace/>}/>
      <Route path="/reset-password" element={<ResetPassword/>}/>

      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard/></AppLayout></ProtectedRoute>}/>
      <Route path="/stores" element={<ProtectedRoute><AppLayout><Stores/></AppLayout></ProtectedRoute>}/>
      <Route path="/work-orders" element={<ProtectedRoute><AppLayout><WorkOrders/></AppLayout></ProtectedRoute>}/>
      <Route path="/work-orders/:id" element={<ProtectedRoute><AppLayout><WorkOrderDetail/></AppLayout></ProtectedRoute>}/>
      <Route path="/assets" element={<ProtectedRoute><AppLayout><Assets/></AppLayout></ProtectedRoute>}/>
      <Route path="/ppm" element={<ProtectedRoute><AppLayout><PPM/></AppLayout></ProtectedRoute>}/>
      <Route path="/schedule" element={<ProtectedRoute><AppLayout><Schedule/></AppLayout></ProtectedRoute>}/>
      <Route path="/analytics" element={<ProtectedRoute roles={['admin']}><AppLayout><Analytics/></AppLayout></ProtectedRoute>}/>
      <Route path="/users" element={<ProtectedRoute roles={['admin']}><AppLayout><Users/></AppLayout></ProtectedRoute>}/>

      {/* Developer Panel - restricted to dev email + PIN */}
      <Route path="/dev" element={<ProtectedRoute><AppLayout><DevPanel/></AppLayout></ProtectedRoute>}/>

      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes/>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
