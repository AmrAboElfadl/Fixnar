import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import WorkOrderDetail from './pages/WorkOrderDetail'
import Dashboard from './pages/Dashboard'
import WorkOrders from './pages/WorkOrders'
import Assets from './pages/Assets'
import PPM from './pages/PPM'
import Analytics from './pages/Analytics'
import Users from './pages/Users'
import Schedule from './pages/Schedule'

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#1D9E75', fontSize:14, fontFamily:"'DM Sans', sans-serif" }}>Loading Fixnar...</div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace/>
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/" replace/>
  return children
}

function AppLayout({ children }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)', position:'relative' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <TopBar onMenuToggle={() => setOpen(o => !o)}/>

      {/* Overlay when sidebar open */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:150, backdropFilter:'blur(2px)' }}/>
      )}

      {/* Sidebar - slides in from left */}
      <div style={{
        position:'fixed', top:0, left: open ? 0 : -280, width:260,
        height:'100vh', zIndex:200, transition:'left 0.25s ease',
        boxShadow: open ? '4px 0 20px rgba(0,0,0,0.15)' : 'none',
      }}>
        <Sidebar open={open} onClose={() => setOpen(false)}/>
      </div>

      <main style={{ flex:1, padding:'32px 32px', paddingTop:'80px', width:'100%', overflowX:'auto', color:'var(--text)' }}>
        {children}
      </main>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', fontFamily:"'DM Sans', sans-serif" }}>
        <div style={{ width:48, height:48, background:'#1D9E75', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M3 12h6M15 12h6M12 3v6M12 15v6" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="2.5" fill="white"/>
          </svg>
        </div>
        <div style={{ color:'#1D9E75', fontSize:18, fontWeight:600 }}>Fixnar</div>
        <div style={{ color:'#6b7280', fontSize:13, marginTop:4 }}>Loading...</div>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace/> : <Login/>}/>
      <Route path="/reset-password" element={<ResetPassword/>}/>
      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard/></AppLayout></ProtectedRoute>}/>
      <Route path="/work-orders" element={<ProtectedRoute><AppLayout><WorkOrders/></AppLayout></ProtectedRoute>}/>
      <Route path="/work-orders/:id" element={<ProtectedRoute><AppLayout><WorkOrderDetail/></AppLayout></ProtectedRoute>}/>
      <Route path="/assets" element={<ProtectedRoute roles={['admin','operations']}><AppLayout><Assets/></AppLayout></ProtectedRoute>}/>
      <Route path="/ppm" element={<ProtectedRoute roles={['admin','technician']}><AppLayout><PPM/></AppLayout></ProtectedRoute>}/>
      <Route path="/schedule" element={<ProtectedRoute roles={['admin','technician']}><AppLayout><Schedule/></AppLayout></ProtectedRoute>}/>
      <Route path="/analytics" element={<ProtectedRoute roles={['admin']}><AppLayout><Analytics/></AppLayout></ProtectedRoute>}/>
      <Route path="/users" element={<ProtectedRoute roles={['admin']}><AppLayout><Users/></AppLayout></ProtectedRoute>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes/>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
