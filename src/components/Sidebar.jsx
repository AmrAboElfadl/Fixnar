import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'

const NAV = [
  { to:'/',             icon:'ti-layout-dashboard', label:'Dashboard',     roles:['admin','technician','operations'] },
  { to:'/assets',       icon:'ti-building-store',   label:'Stores',        roles:['admin','operations'] },
  { to:'/work-orders',  icon:'ti-clipboard-list',   label:'Work Orders',   roles:['admin','technician','operations'] },
  { to:'/ppm',          icon:'ti-calendar-check',   label:'PPM Schedule',  roles:['admin','technician'] },
  { to:'/schedule',     icon:'ti-calendar-time',    label:'My Schedule',   roles:['admin','technician'] },
  { to:'/analytics',    icon:'ti-chart-bar',         label:'Analytics',     roles:['admin'] },
  { to:'/users',        icon:'ti-users',             label:'Users & Access',roles:['admin'] },
]

const ROLE_COLORS = { admin:'#1D9E75', technician:'#378ADD', operations:'#7F77DD' }

export default function Sidebar({ collapsed, onToggle }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role || 'operations'
  const rc = ROLE_COLORS[role] || '#6b7280'
  const initials = (profile?.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const w = collapsed ? 64 : 240

  return (
    <aside style={{
      width: w, minHeight:'100vh',
      background:'var(--sidebar-bg)',
      borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      position:'fixed', top:0, left:0, zIndex:100,
      fontFamily:"'DM Sans', sans-serif",
      transition:'width 0.2s ease',
      overflow:'hidden',
    }}>
      {/* Logo + toggle */}
      <div style={{ padding:'16px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'space-between', minHeight:64 }}>
        {!collapsed && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, background:'#1D9E75', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <path d="M2 9h5M11 9h5M9 2v5M9 11v5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="9" cy="9" r="2" fill="white"/>
              </svg>
            </div>
            <div>
              <div style={{ color:'var(--text)', fontSize:15, fontWeight:600, letterSpacing:'-0.3px', whiteSpace:'nowrap' }}>Fixnar</div>
              <div style={{ color:'var(--text3)', fontSize:10, whiteSpace:'nowrap' }}>CMMS Platform</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ width:32, height:32, background:'#1D9E75', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M2 9h5M11 9h5M9 2v5M9 11v5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="9" cy="9" r="2" fill="white"/>
            </svg>
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} title="Collapse sidebar"
            style={{ background:'transparent', border:'1px solid var(--border2)', color:'var(--text2)', cursor:'pointer', padding:'4px 8px', borderRadius:6, fontSize:13, fontWeight:500 }}>
            ◀
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'center' }}>
          <button onClick={onToggle} title="Expand sidebar"
            style={{ background:'transparent', border:'1px solid var(--border2)', color:'var(--text2)', cursor:'pointer', padding:'4px 8px', borderRadius:6, fontSize:13, fontWeight:500 }}>
            ▶
          </button>
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        {NAV.filter(n => n.roles.includes(role)).map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center',
              gap: collapsed ? 0 : 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px 0' : '9px 10px',
              borderRadius:8, marginBottom:2,
              color: isActive ? '#1D9E75' : '#8b949e',
              background: isActive ? '#1d2f26' : 'transparent',
              textDecoration:'none',
              fontSize:13, fontWeight: isActive ? 500 : 400,
              transition:'all 0.15s',
              whiteSpace:'nowrap',
              overflow:'hidden',
            })}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize:20, flexShrink:0 }} aria-hidden="true"/>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      <div style={{ padding:'12px 8px', borderTop:'1px solid var(--border)' }}>
        {!collapsed ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'6px 4px' }}>
              <div style={{ width:34, height:34, borderRadius:9, background: rc, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:600, flexShrink:0 }}>
                {initials}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'var(--text)', fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {profile?.full_name || 'User'}
                </div>
                <div style={{ color: rc, fontSize:11, textTransform:'capitalize' }}>{role}</div>
              </div>
            </div>
            <button onClick={handleSignOut} style={{
              width:'100%', background:'transparent', border:'1px solid var(--border2)',
              borderRadius:8, padding:'7px', color:'var(--text2)', fontSize:12,
              cursor:'pointer', transition:'all 0.15s',
            }}>
              Sign out
            </button>
          </>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div title={profile?.full_name} style={{ width:34, height:34, borderRadius:9, background: rc, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:600, cursor:'default' }}>
              {initials}
            </div>
            <button onClick={handleSignOut} title="Sign out"
              style={{ background:'transparent', border:'1px solid var(--border2)', borderRadius:8, padding:'6px', color:'var(--text2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              ↩
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
