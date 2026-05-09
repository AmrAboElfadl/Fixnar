import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'
import { useNavigate } from 'react-router-dom'

const PRIORITY_COLORS = { P1:'#f85149', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }

export default function Dashboard() {
  const { profile, isAdmin, isTechnician } = useAuth()
  const [stats, setStats]   = useState({ total:0, open:0, inProgress:0, closed:0, ppmDue:0, assets:0 })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [woRes, assetRes, ppmRes] = await Promise.all([
        supabase.from('work_orders').select('id,status,priority,created_at,title,store_id,stores(name)').order('created_at', { ascending:false }).limit(50),
        supabase.from('assets').select('id', { count:'exact' }),
        supabase.from('ppm_tasks').select('id,due_date,status').lte('due_date', new Date(Date.now() + 7*24*60*60*1000).toISOString()).neq('status','done'),
      ])
      const wos = woRes.data || []
      setStats({
        total:      wos.length,
        open:       wos.filter(w => w.status === 'open').length,
        inProgress: wos.filter(w => w.status === 'in_progress').length,
        closed:     wos.filter(w => w.status === 'closed').length,
        ppmDue:     (ppmRes.data || []).length,
        assets:     assetRes.count || 0,
      })
      setRecent(wos.slice(0,8))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = profile?.full_name?.split(' ')[0] || 'Amr'

  const statCards = [
    { label:'Total Work Orders', value: stats.total,      color:'#e6edf3', bg:'#161b22' },
    { label:'Open',              value: stats.open,       color:'#EF9F27', bg:'#2d2208' },
    { label:'In Progress',       value: stats.inProgress, color:'#378ADD', bg:'#1a2b3c' },
    { label:'Assets',            value: stats.assets,     color:'#1D9E75', bg:'#1d2f26' },
    { label:'PPM Due (7 days)',  value: stats.ppmDue,     color:'#f85149', bg:'#2d1b1b' },
    { label:'Closed Today',      value: stats.closed,     color:'#8b949e', bg:'#161b22' },
  ]

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>{greeting}, {name} 👋</h1>
        <p style={{ color:'#6b7280', fontSize:14, margin:'4px 0 0' }}>Here's what's happening with your facilities today</p>
      </div>

      {/* Stats grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:28 }}>
        {statCards.map(c => (
          <div key={c.label} style={{ background: c.bg, border:'1px solid #21262d', borderRadius:12, padding:'16px 18px' }}>
            <div style={{ color:'#6b7280', fontSize:12, marginBottom:8 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize:28, fontWeight:600 }}>
              {loading ? '—' : c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display:'flex', gap:10, marginBottom:28 }}>
        <button onClick={() => navigate('/work-orders?new=1')} style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + New Work Order
        </button>
        {isAdmin && (
          <button onClick={() => navigate('/ppm?new=1')} style={{ background:'#1a2b3c', color:'#378ADD', border:'1px solid #1f3a56', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + Schedule PPM
          </button>
        )}
      </div>

      {/* Recent work orders */}
      <div>
        <h2 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, marginBottom:14 }}>Recent Work Orders</h2>
        <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
          {loading ? (
            <div style={{ padding:32, textAlign:'center', color:'#6b7280' }}>Loading...</div>
          ) : recent.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'#6b7280' }}>No work orders yet. Create your first one!</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid #21262d' }}>
                  {['Priority','Title','Store','Status','SLA'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', color:'#6b7280', fontSize:12, fontWeight:500, textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map(wo => (
                  <tr key={wo.id} onClick={() => navigate(`/work-orders/${wo.id}`)}
                    style={{ borderBottom:'1px solid #21262d', cursor:'pointer', transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  >
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: PRIORITY_COLORS[wo.priority]+'22', color: PRIORITY_COLORS[wo.priority], fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:600 }}>
                        {wo.priority}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', color:'#e6edf3', fontSize:13 }}>{wo.title}</td>
                    <td style={{ padding:'12px 16px', color:'#8b949e', fontSize:12 }}>{wo.stores?.name || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ fontSize:12, padding:'3px 8px', borderRadius:6, background: wo.status==='open'?'#2d2208': wo.status==='in_progress'?'#1a2b3c':'#1d2f26', color: wo.status==='open'?'#EF9F27': wo.status==='in_progress'?'#378ADD':'#1D9E75' }}>
                        {wo.status?.replace('_',' ')}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', minWidth:140 }}>
                      <SLABadge priority={wo.priority} createdAt={wo.created_at} status={wo.status}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
