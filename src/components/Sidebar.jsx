import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to:'/',           icon:'⊞',  label:'Dashboard',    roles:['admin','technician','operations'] },
  { to:'/assets',     icon:'◈',  label:'Assets',        roles:['admin','operations'] },
  { to:'/work-orders',icon:'✦',  label:'Work Orders',   roles:['admin','technician','operations'] },
  { to:'/ppm',        icon:'◷',  label:'PPM Schedule',  roles:['admin','technician'] },
  { to:'/schedule',   icon:'◉',  label:'My Schedule',   roles:['admin','technician'] },
  { to:'/analytics',  icon:'▦',  label:'Analytics',     roles:['admin'] },
  { to:'/users',      icon:'◎',  label:'Users & Access',roles:['admin'] },
]

export default function Sidebar() {
  const { profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const role = profile?.role || 'operations'
  const initials = (profile?.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  const roleColors = { admin:'#1D9E75', technician:'#378ADD', operations:'#7F77DD' }
  const roleColor = roleColors[role] || '#6b7280'

  return (
    <aside style={{
      width:240, minHeight:'100vh', background:'#161b22',
      borderRight:'1px solid #21262d', display:'flex', flexDirection:'column',
      position:'fixed', top:0, left:0, zIndex:100,
      fontFamily:"'DM Sans', sans-serif"
    }}>
      {/* Logo */}
      <div style={{ padding:'24px 20px 20px', borderBottom:'1px solid #21262d' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, background:'#1D9E75', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 9h5M11 9h5M9 2v5M9 11v5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="9" cy="9" r="2" fill="white"/>
            </svg>
          </div>
          <div>
            <div style={{ color:'#e6edf3', fontSize:16, fontWeight:600, letterSpacing:'-0.3px' }}>Fixnar</div>
            <div style={{ color:'#6b7280', fontSize:11 }}>CMMS Platform</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex:1, padding:'12px 12px' }}>
        {NAV.filter(n => n.roles.includes(role)).map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 12px', borderRadius:8, marginBottom:2,
              color: isActive ? '#1D9E75' : '#8b949e',
              background: isActive ? '#1d2f26' : 'transparent',
              textDecoration:'none', fontSize:14, fontWeight: isActive ? 500 : 400,
              transition:'all 0.15s'
            })}
          >
            <span style={{ fontSize:16, width:20, textAlign:'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      <div style={{ padding:'16px 16px', borderTop:'1px solid #21262d' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:roleColor, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:13, fontWeight:600, flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'#e6edf3', fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {profile?.full_name || 'User'}
            </div>
            <div style={{ color: roleColor, fontSize:11, textTransform:'capitalize' }}>{role}</div>
          </div>
        </div>
        <button onClick={handleSignOut} style={{
          width:'100%', background:'transparent', border:'1px solid #30363d',
          borderRadius:8, padding:'8px', color:'#8b949e', fontSize:13,
          cursor:'pointer', transition:'all 0.15s'
        }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
