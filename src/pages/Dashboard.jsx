import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { t } from '../lib/translations'
import SLABadge from '../components/SLABadge'
import { useNavigate } from 'react-router-dom'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const { lang } = useTheme()
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
        open:       wos.filter(w => ['open','travelling','arrived'].includes(w.status)).length,
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
  const greeting = hour < 12 ? t(lang,'goodMorning') : hour < 17 ? t(lang,'goodAfternoon') : t(lang,'goodEvening')
  const name = profile?.full_name?.split(' ')[0] || 'Amr'

  const statCards = [
    { label: t(lang,'totalWorkOrders'), value: stats.total,      color:'var(--text)',   bg:'var(--card-bg)',  border:'var(--border)' },
    { label: t(lang,'open'),            value: stats.open,       color:'var(--amber)',  bg:'var(--amber-bg)', border:'var(--amber)' },
    { label: t(lang,'inProgress'),      value: stats.inProgress, color:'var(--blue)',   bg:'var(--blue-bg)',  border:'var(--blue)' },
    { label: t(lang,'assets'),          value: stats.assets,     color:'var(--green)',  bg:'var(--green-bg)', border:'var(--green)' },
    { label: t(lang,'ppmDue'),          value: stats.ppmDue,     color:'var(--red)',    bg:'var(--red-bg)',   border:'var(--red)' },
    { label: t(lang,'closedToday'),     value: stats.closed,     color:'var(--text2)',  bg:'var(--card-bg)',  border:'var(--border)' },
  ]

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ color:'var(--text)', fontSize:22, fontWeight:600, margin:0 }}>{greeting}, {name} 👋</h1>
        <p style={{ color:'var(--text3)', fontSize:14, margin:'4px 0 0' }}>Here's what's happening with your facilities today</p>
      </div>

      {/* Stats grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:28 }}>
        {statCards.map(c => (
          <div key={c.label} style={{ background: c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'16px 18px', boxShadow:'var(--shadow)' }}>
            <div style={{ color:'var(--text3)', fontSize:12, marginBottom:8 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize:28, fontWeight:600 }}>
              {loading ? '—' : c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display:'flex', gap:10, marginBottom:28 }}>
        <button onClick={() => navigate('/work-orders?new=1')}
          style={{ background:'var(--green)', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          {t(lang,'newWorkOrder')}
        </button>
        {isAdmin && (
          <button onClick={() => navigate('/ppm?new=1')}
            style={{ background:'var(--blue-bg)', color:'var(--blue)', border:`1px solid var(--blue)`, borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {t(lang,'schedulePPM')}
          </button>
        )}
      </div>

      {/* Recent work orders */}
      <div>
        <h2 style={{ color:'var(--text)', fontSize:15, fontWeight:500, marginBottom:14 }}>{t(lang,'recentWorkOrders')}</h2>
        <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', boxShadow:'var(--shadow)' }}>
          {loading ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text3)' }}>Loading...</div>
          ) : recent.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--text3)' }}>{t(lang,'noWorkOrders')}</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid var(--border)` }}>
                  {[t(lang,'priority'), t(lang,'title'), t(lang,'store'), t(lang,'status'), t(lang,'sla')].map(h => (
                    <th key={h} style={{ padding:'10px 16px', color:'var(--text3)', fontSize:12, fontWeight:500, textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map(wo => (
                  <tr key={wo.id} onClick={() => navigate(`/work-orders/${wo.id}`)}
                    style={{ borderBottom:`1px solid var(--border)`, cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  >
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: P_COLORS[wo.priority]+'22', color: P_COLORS[wo.priority], fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:600 }}>
                        {wo.priority}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', color:'var(--text)', fontSize:13 }}>{wo.title}</td>
                    <td style={{ padding:'12px 16px', color:'var(--text2)', fontSize:12 }}>{wo.stores?.name || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ fontSize:12, padding:'3px 8px', borderRadius:6,
                        background: wo.status==='open' ? 'var(--amber-bg)' : wo.status==='in_progress' ? 'var(--blue-bg)' : 'var(--green-bg)',
                        color: wo.status==='open' ? 'var(--amber)' : wo.status==='in_progress' ? 'var(--blue)' : 'var(--green)'
                      }}>
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
