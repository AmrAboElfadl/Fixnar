import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import WorkOrders from './pages/WorkOrders'
import WorkOrderDetail from './pages/WorkOrderDetail'
import PPM from './pages/PPM'
import Analytics from './pages/Analytics'
import Users from './pages/Users'
import Schedule from './pages/Schedule'
import Stores from './pages/Stores'
import DevPanel from './pages/DevPanel'
import AuditLog from './pages/AuditLog'
import AssetScan from './pages/AssetScan'
import Vendors from './pages/Vendors'
import UpdateBanner from './components/UpdateBanner'
import Inventory from './pages/Inventory'
import TechSchedule from './pages/TechSchedule'
import Budgets from './pages/Budgets'
import WorkOrderReport from './pages/WorkOrderReport'

function ProtectedRoute({ children, roles }) {
  const { user, profile, profileError, loading, signOut } = useAuth()
  const location = useLocation()
  if (loading || (user && !profile && !profileError)) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'var(--green)', fontSize:14, fontFamily:"'DM Sans', sans-serif" }}>Loading Fixnar...</div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }}/>
  if (!profile) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:28, maxWidth:420, textAlign:'center', color:'var(--text)' }}>
        <div style={{ fontSize:40, marginBottom:10 }}>🔒</div>
        <h3 style={{ margin:'0 0 8px' }}>No access yet</h3>
        <p style={{ color:'var(--text3)', fontSize:14, margin:'0 0 18px' }}>{profileError || 'Your account is not set up in Fixnar.'}</p>
        <button onClick={() => signOut()} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:9, padding:'10px 22px', fontSize:14, cursor:'pointer', fontWeight:600 }}>Sign out</button>
      </div>
    </div>
  )
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

      <main className="fx-main" style={{
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

const STAFF = ['admin','operations']
const INTERNAL = ['admin','operations','technician']

function Home() {
  const { profile } = useAuth()
  if (profile?.role === 'vendor') return <Navigate to="/work-orders" replace/>
  return <Dashboard/>
}

function LoginRoute() {
  const { user } = useAuth()
  const location = useLocation()
  const from = location.state?.from
  if (!user) return <Login/>
  return <Navigate to={from && from !== '/login' ? from : '/'} replace/>
}

function AppRoutes() {
  const page = (el, roles) => <ProtectedRoute roles={roles}><AppLayout>{el}</AppLayout></ProtectedRoute>
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute/>}/>
      <Route path="/reset-password" element={<ResetPassword/>}/>

      <Route path="/"                element={page(<Home/>)}/>
      <Route path="/stores"          element={page(<Stores/>, INTERNAL)}/>
      <Route path="/work-orders"     element={page(<WorkOrders/>)}/>
      <Route path="/work-orders/:id" element={page(<WorkOrderDetail/>)}/>
      <Route path="/work-orders/:id/report" element={<ProtectedRoute><WorkOrderReport/></ProtectedRoute>}/>
      <Route path="/a/:id"           element={page(<AssetScan/>, INTERNAL)}/>
      <Route path="/assets"          element={<Navigate to="/stores" replace/>}/>
      <Route path="/ppm"             element={page(<PPM/>, INTERNAL)}/>
      <Route path="/schedule"        element={page(<Schedule/>, INTERNAL)}/>
      <Route path="/my-schedule"     element={page(<TechSchedule/>, INTERNAL)}/>
      <Route path="/vendors"         element={page(<Vendors/>, STAFF)}/>
      <Route path="/inventory"       element={page(<Inventory/>, INTERNAL)}/>
      <Route path="/budgets"         element={page(<Budgets/>, STAFF)}/>
      <Route path="/analytics"       element={page(<Analytics/>, ['admin'])}/>
      <Route path="/users"           element={page(<Users/>, ['admin'])}/>
      <Route path="/audit"           element={page(<AuditLog/>, ['admin'])}/>

      {/* Developer Panel - admin only, plus dev email + PIN inside */}
      <Route path="/dev"             element={page(<DevPanel/>, ['admin'])}/>

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
          <UpdateBanner/>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
