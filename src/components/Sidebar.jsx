import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to:'/',            icon:'⊞', label:'Dashboard',     roles:['admin','technician','operations'] },
  { to:'/assets',      icon:'◈', label:'Stores',         roles:['admin','operations'] },
  { to:'/work-orders', icon:'✦', label:'Work Orders',    roles:['admin','technician','operations'] },
  { to:'/ppm',         icon:'◷', label:'PPM Schedule',   roles:['admin','technician'] },
  { to:'/schedule',    icon:'◉', label:'Dispatch Board', roles:['admin','technician'] },
  { to:'/analytics',   icon:'▦', label:'Analytics',      roles:['admin'] },
  { to:'/users',       icon:'◎', label:'Users & Access', roles:['admin'] },
]

const ROLE_COLORS = { admin:'#1D9E75', technician:'#378ADD', operations:'#7F77DD' }

export default function Sidebar({ open, onClose, pinned, onPin }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role     = profile?.role || 'operations'
  const rc       = ROLE_COLORS[role] || '#6b7280'
  const initials = (profile?.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside style={{
      width:'100%', height:'100%',
      background:'var(--sidebar-bg)',
      borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      fontFamily:"'DM Sans', sans-serif",
      paddingTop:52,
    }}>

      {/* Header row */}
      <div style={{ padding:'14px 16px 8px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)' }}>
        <span style={{ color:'var(--text3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:500 }}>Menu</span>
        <div style={{ display:'flex', gap:6 }}>
          {/* Pin / Unpin button */}
          <button onClick={onPin}
            title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            style={{
              background: pinned ? 'var(--green-bg)' : 'var(--bg3)',
              border:`1px solid ${pinned ? 'var(--green)' : 'var(--border)'}`,
              borderRadius:7, padding:'3px 10px', cursor:'pointer',
              color: pinned ? 'var(--green)' : 'var(--text2)',
              fontSize:11, fontWeight:500,
            }}>
            {pinned ? '📌 Pinned' : '📌 Pin'}
          </button>
          {/* Close — only when not pinned */}
          {!pinned && (
            <button onClick={onClose}
              style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, width:28, height:28, cursor:'pointer', color:'var(--text2)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex:1, padding:'8px 10px', overflowY:'auto' }}>
        {NAV.filter(n => n.roles.includes(role)).map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            onClick={() => { if (!pinned) onClose() }}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:12,
              padding:'11px 12px', borderRadius:10, marginBottom:3,
              color: isActive ? 'var(--green)' : 'var(--text2)',
              background: isActive ? 'var(--green-bg)' : 'transparent',
              textDecoration:'none', fontSize:14,
              fontWeight: isActive ? 500 : 400,
              transition:'all 0.15s',
            })}>
            <span style={{ fontSize:18, width:22, textAlign:'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div style={{ height:1, background:'var(--border)', margin:'0 16px' }}/>

      {/* User profile */}
      <div style={{ padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:rc, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:13, fontWeight:600, flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'var(--text)', fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {profile?.full_name || 'User'}
            </div>
            <div style={{ color:rc, fontSize:11, textTransform:'capitalize' }}>{role}</div>
          </div>
        </div>
        <button onClick={handleSignOut}
          style={{ width:'100%', background:'transparent', border:'1px solid var(--border)', borderRadius:8, padding:'8px', color:'var(--text2)', fontSize:13, cursor:'pointer' }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
