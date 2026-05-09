import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const P_COLORS = { P1:'#f85149', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function Schedule() {
  const { profile, isAdmin } = useAuth()
  const [wos, setWos]       = useState([])
  const [techs, setTechs]   = useState([])
  const [selTech, setSelTech] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTechs()
  }, [])

  useEffect(() => {
    if (profile) {
      const id = isAdmin ? (selTech || null) : profile.id
      fetchWOs(id)
    }
  }, [profile, selTech])

  async function fetchTechs() {
    const { data } = await supabase.from('profiles').select('id,full_name').eq('role','technician')
    setTechs(data || [])
  }

  async function fetchWOs(techId) {
    setLoading(true)
    let q = supabase.from('work_orders').select('*,stores(name,latitude,longitude),assets(name)').neq('status','closed')
    if (techId) q = q.eq('assigned_to', techId)
    const { data } = await q.order('priority')
    setWos(data || [])
    setLoading(false)
  }

  // Group by day
  const today = new Date()
  const week = Array.from({length:7}, (_,i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })

  const p1p2 = wos.filter(w => ['P1','P2'].includes(w.priority))
  const p3p4  = wos.filter(w => ['P3','P4'].includes(w.priority))

  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'8px 12px', color:'#e6edf3', fontSize:13, outline:'none', cursor:'pointer' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>
            {isAdmin ? 'Technician Schedule' : 'My Schedule'}
          </h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>{wos.length} active work orders</p>
        </div>
        {isAdmin && (
          <select value={selTech} onChange={e => setSelTech(e.target.value)} style={inp}>
            <option value="">All Technicians</option>
            {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Priority queue */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:16 }}>
          <h3 style={{ color:'#f85149', fontSize:13, fontWeight:500, margin:'0 0 12px' }}>⚡ Critical & High (P1/P2)</h3>
          {p1p2.length === 0 ? (
            <div style={{ color:'#6b7280', fontSize:13 }}>No critical work orders</div>
          ) : p1p2.map(w => (
            <div key={w.id} style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'#e6edf3', fontSize:13, fontWeight:500 }}>{w.title}</span>
                <span style={{ background: P_COLORS[w.priority]+'22', color: P_COLORS[w.priority], fontSize:11, padding:'2px 6px', borderRadius:5, fontWeight:600 }}>{w.priority}</span>
              </div>
              <div style={{ color:'#6b7280', fontSize:12 }}>{w.stores?.name} · {w.assets?.name || 'No asset'}</div>
            </div>
          ))}
        </div>

        <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:16 }}>
          <h3 style={{ color:'#378ADD', fontSize:13, fontWeight:500, margin:'0 0 12px' }}>📋 Medium & Low (P3/P4)</h3>
          {p3p4.length === 0 ? (
            <div style={{ color:'#6b7280', fontSize:13 }}>No other work orders</div>
          ) : p3p4.map(w => (
            <div key={w.id} style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'#e6edf3', fontSize:13, fontWeight:500 }}>{w.title}</span>
                <span style={{ background: P_COLORS[w.priority]+'22', color: P_COLORS[w.priority], fontSize:11, padding:'2px 6px', borderRadius:5, fontWeight:600 }}>{w.priority}</span>
              </div>
              <div style={{ color:'#6b7280', fontSize:12 }}>{w.stores?.name} · {w.assets?.name || 'No asset'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Week view */}
      <h2 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, marginBottom:14 }}>Week View</h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
        {week.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString()
          return (
            <div key={i} style={{ background: isToday ? '#1a2b3c' : '#161b22', border: isToday ? '1px solid #378ADD' : '1px solid #21262d', borderRadius:10, padding:'10px 8px', minHeight:80 }}>
              <div style={{ textAlign:'center', marginBottom:6 }}>
                <div style={{ color:'#6b7280', fontSize:11 }}>{DAYS[d.getDay()]}</div>
                <div style={{ color: isToday ? '#378ADD' : '#e6edf3', fontSize:16, fontWeight: isToday ? 600 : 400 }}>{d.getDate()}</div>
              </div>
              {isToday && wos.slice(0,3).map(w => (
                <div key={w.id} style={{ background: P_COLORS[w.priority]+'22', borderRadius:4, padding:'2px 5px', marginBottom:3 }}>
                  <div style={{ color: P_COLORS[w.priority], fontSize:10, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.title}</div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {loading && <div style={{ padding:20, textAlign:'center', color:'#6b7280', fontSize:13 }}>Loading...</div>}
    </div>
  )
}
