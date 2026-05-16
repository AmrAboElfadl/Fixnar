import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const DEV_EMAIL = 'amrmorsy93@gmail.com'

const NAV_ITEMS = [
  { path:'/',            label:'Dashboard',      icon:'⊞', roles:['admin','operations','technician','viewer'] },
  { path:'/stores',      label:'Stores',         icon:'◈', roles:['admin','operations'] },
  { path:'/work-orders', label:'Work Orders',    icon:'✦', roles:['admin','operations','technician'] },
  { path:'/ppm',         label:'PPM Schedule',   icon:'◎', roles:['admin','operations'] },
  { path:'/schedule',    label:'Dispatch Board', icon:'◉', roles:['admin','operations'] },
  { path:'/analytics',   label:'Analytics',      icon:'▤', roles:['admin'] },
  { path:'/users',       label:'Users & Access', icon:'◎', roles:['admin'] },
]

const ROLE_COLORS = {
  admin:      '#E24B4A',
  technician: '#7F77DD',
  operations: '#EF9F27',
  viewer:     '#9e9e9e',
}

export default function Sidebar({ open, onClose, pinned, onPin }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role     = profile?.role || 'viewer'
  const isDev    = profile?.email === DEV_EMAIL

  const initials = (profile?.full_name || profile?.email || 'U')
    .split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  const rc = ROLE_COLORS[role] || '#9e9e9e'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(role)
  )

  return (
    <aside style={{
      width: 200,
      height: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      position: 'relative',
    }}>

      {/* Logo + Pin */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 16px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ color:'white', fontSize:14, fontWeight:700 }}>+</span>
          </div>
          <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Fixnar</span>
        </div>
        <button
          onClick={onPin}
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          style={{
            background: pinned ? '#E24B4A22' : 'var(--surface)',
            border: `1px solid ${pinned ? '#E24B4A' : 'var(--border)'}`,
            borderRadius: 20, padding: '2px 10px',
            fontSize: 11, cursor: 'pointer',
            color: pinned ? '#E24B4A' : 'var(--text3)',
            fontWeight: 600, display:'flex', alignItems:'center', gap:4,
          }}
        >
          ★ {pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>

      {/* MENU label */}
      <div style={{ padding:'14px 16px 6px', fontSize:10, fontWeight:700, color:'var(--text3)', letterSpacing:'0.08em' }}>
        MENU
      </div>

      {/* Nav items */}
      <nav style={{ flex:1, padding:'0 8px', display:'flex', flexDirection:'column', gap:2 }}>
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={!pinned ? onClose : undefined}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 9,
              color: isActive ? 'var(--green)' : 'var(--text2)',
              background: isActive ? 'var(--green-bg)' : 'transparent',
              textDecoration: 'none', fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s',
            })}
          >
            <span style={{ fontSize:16, width:20, textAlign:'center', opacity:0.8 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Developer Panel — only for dev email */}
      {isDev && (
        <div style={{ padding:'8px', borderTop:'1px solid var(--border)', marginTop:4 }}>
          <NavLink
            to="/dev"
            onClick={!pinned ? onClose : undefined}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 12px', borderRadius:10,
              background: isActive
                ? 'linear-gradient(135deg,#7F77DD33,#1D9E7533)'
                : 'linear-gradient(135deg,#7F77DD11,#1D9E7511)',
              border:`1px solid ${isActive?'#7F77DD':'#7F77DD44'}`,
              textDecoration:'none', transition:'all 0.15s',
            })}
          >
            <span style={{ fontSize:18 }}>⚡</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#7F77DD,#1D9E75)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                Developer
              </div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>Full control panel</div>
            </div>
          </NavLink>
        </div>
      )}

      {/* Divider */}
      <div style={{ height:1, background:'var(--border)', margin:'0 16px' }}/>

      {/* User profile */}
      <div style={{ padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div style={{
            width:38, height:38, borderRadius:10,
            background:rc, display:'flex', alignItems:'center',
            justifyContent:'center', color:'white',
            fontSize:13, fontWeight:600, flexShrink:0,
          }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'var(--text)', fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {profile?.full_name || 'User'}
            </div>
            <div style={{ color:rc, fontSize:11, textTransform:'capitalize' }}>{role}</div>
          </div>
        </div>
        <button onClick={handleSignOut} style={{
          width:'100%', background:'transparent',
          border:'1px solid var(--border)',
          borderRadius:8, padding:'8px',
          color:'var(--text2)', fontSize:13, cursor:'pointer',
        }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
