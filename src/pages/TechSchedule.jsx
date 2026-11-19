import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, fetchAllRows } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../lib/useLive'

// 30-day work schedule for one technician: what, where and when — ready to read on the phone or print.
const DAYS = 30
const MAX_PER_DAY = 8
const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const P_LABEL  = { P1:'Critical', P2:'High', P3:'Medium', P4:'Low' }
const STATUS_LABEL = { open:'To do', travelling:'On the way', arrived:'Arrived', in_progress:'In progress', on_hold:'On hold', completed:'Done – needs signature', closed:'Closed' }
const pad2 = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const hm = t => t ? t.slice(0, 5) : ''
const addMin = (t, mins) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); const x = h * 60 + m + mins; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}` }

export default function TechSchedule() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isTech = profile?.role === 'technician'
  const [techs, setTechs]   = useState([])
  const [techId, setTechId] = useState(isTech ? profile.id : '')
  const [wos, setWos]       = useState([])
  const [ppm, setPpm]       = useState([])
  const [loading, setLoading] = useState(true)
  const [openDays, setOpenDays] = useState({})

  const today = ymd(new Date())
  const end = (() => { const d = new Date(); d.setDate(d.getDate() + DAYS - 1); return ymd(d) })()

  useEffect(() => {
    if (isTech) return
    supabase.from('profiles').select('id,full_name').eq('role', 'technician').order('full_name')
      .then(({ data }) => { setTechs(data || []); if (!techId && data?.length) setTechId(data[0].id) })
  }, [isTech])

  useEffect(() => { if (techId) load() }, [techId])
  useLive('work_orders', () => techId && load(true))

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const WO_COLS = 'id,title,description,priority,status,category,scheduled_date,scheduled_time,duration_hours,sla_due_at,schedule_locked,wo_type,stores(name,address,phone,manager_name,maps_url,latitude,longitude),assets(name)'
    // Own jobs + jobs helping on (second technician, fx10). A workspace whose database does not have
    // helper_ids yet answers with an error — then fall back to own jobs only, exactly as before.
    const woQuery = (withHelpers) => fetchAllRows(() => {
      const q = supabase.from('work_orders').select(WO_COLS)
      return (withHelpers ? q.or(`assigned_to.eq.${techId},helper_ids.cs.{${techId}}`) : q.eq('assigned_to', techId))
        .not('status', 'in', '(closed)').order('scheduled_date').order('scheduled_time')
    })
    const [w0, p] = await Promise.all([
      woQuery(true),
      supabase.from('ppm_tasks').select('id,title,due_date,status,is_active,category,stores(name)')
        .eq('assigned_to', techId).gte('due_date', today).lte('due_date', end).order('due_date'),
    ])
    const w = (w0.error && Object.keys(w0.error).length) ? await woQuery(false) : w0
    setWos(w.data || [])
    setPpm((p.data || []).filter(x => x.is_active !== false && x.status !== 'in_progress'))
    setLoading(false)
  }

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return ymd(d) }), [today])
  const byDay = useMemo(() => {
    const m = {}
    wos.forEach(w => { if (w.scheduled_date) (m[w.scheduled_date] = m[w.scheduled_date] || []).push(w) })
    Object.values(m).forEach(l => l.sort((a, b) => (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99')))
    return m
  }, [wos])
  const carried  = wos.filter(w => w.scheduled_date && w.scheduled_date < today && w.status !== 'completed')
  const unplanned = wos.filter(w => !w.scheduled_date && w.status !== 'completed')
  const awaitingSign = wos.filter(w => w.status === 'completed')
  const total30 = days.reduce((a, d) => a + (byDay[d]?.length || 0), 0)
  const workDays = days.filter(d => parseYmd(d).getDay() !== 0 && (byDay[d]?.length || 0) > 0).length
  const techName = isTech ? profile.full_name : techs.find(t => t.id === techId)?.full_name

  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }
  const mapLink = s => s?.maps_url || (s?.latitude ? `https://maps.google.com/?q=${s.latitude},${s.longitude}` : (s?.address ? `https://maps.google.com/?q=${encodeURIComponent(s.address)}` : null))

  function JobRow({ w, showDate }) {
    const dur = Math.round((Number(w.duration_hours) || 1) * 60)
    const late = w.sla_due_at && new Date(w.sla_due_at) < new Date() && !['completed', 'closed'].includes(w.status)
    const link = mapLink(w.stores)
    return (
      <div className="fx-print-block" onClick={() => navigate(`/work-orders/${w.id}`)}
        style={{ display:'flex', gap:12, padding:'10px 12px', borderTop:'1px solid var(--border)', cursor:'pointer', alignItems:'flex-start' }}>
        <div style={{ width:64, flexShrink:0 }}>
          {showDate && <div style={{ fontSize:11, color:'var(--text3)' }}>{parseYmd(w.scheduled_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</div>}
          <div style={{ fontWeight:700, fontSize:14 }}>{hm(w.scheduled_time) || '—'}</div>
          {w.scheduled_time && <div style={{ fontSize:11, color:'var(--text3)' }}>to {addMin(hm(w.scheduled_time), dur)}</div>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'white', background:P_COLORS[w.priority] || '#888', borderRadius:5, padding:'1px 7px' }}>{w.priority} {P_LABEL[w.priority]}</span>
            {w.wo_type === 'ppm' && <span style={{ fontSize:11, fontWeight:700, color:'var(--amber)', background:'var(--amber-bg)', borderRadius:5, padding:'1px 7px' }}>PPM</span>}
            <span style={{ fontSize:11, color:'var(--text3)' }}>{STATUS_LABEL[w.status] || w.status}</span>
            {late && <span style={{ fontSize:11, fontWeight:700, color:'var(--red)' }}>SLA breached</span>}
          </div>
          <div style={{ fontWeight:600, fontSize:14, marginTop:3 }}>{w.stores?.name || 'Store'}</div>
          <div style={{ fontSize:13, color:'var(--text2)' }}>{w.title}{w.assets?.name ? ` · ${w.assets.name}` : ''}</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12, marginTop:4 }} onClick={e => e.stopPropagation()}>
            {w.stores?.manager_name && <span style={{ color:'var(--text3)' }}>👤 {w.stores.manager_name}</span>}
            {w.stores?.phone && <a href={`tel:${w.stores.phone}`} style={{ color:'var(--blue)', textDecoration:'none' }}>📞 {w.stores.phone}</a>}
            {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ color:'var(--blue)', textDecoration:'none' }}>📍 Directions</a>}
            <span style={{ color:'var(--text3)' }}>⏱ {dur >= 60 ? `${dur / 60}h` : `${dur}m`}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ color:'var(--text)', maxWidth:900 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>{isTech ? 'My Schedule' : 'Technician Schedule'}</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text3)' }}>
            Next 30 days{techName ? ` · ${techName}` : ''} · 9am–6pm, Monday–Saturday · Sunday off · max {MAX_PER_DAY} jobs a day
          </p>
        </div>
        <div className="fx-no-print" style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {!isTech && (
            <select value={techId} onChange={e => setTechId(e.target.value)} style={{ background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13 }}>
              {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          )}
          <button onClick={() => window.print()} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)' }}>🖨 Print / PDF</button>
        </div>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading schedule…</div> : !techId ? (
        <div style={{ ...card, padding:30, textAlign:'center', color:'var(--text3)' }}>No technicians yet.</div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:10, marginBottom:14 }}>
            {[['Jobs in 30 days', total30, 'var(--text)'], ['Working days with jobs', workDays, 'var(--green)'],
              ['Carried over / late', carried.length, carried.length ? 'var(--red)' : 'var(--text)'], ['PPM coming up', ppm.length, 'var(--amber)']].map(([l, v, c]) => (
              <div key={l} style={{ ...card, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{l}</div>
                <div style={{ fontSize:22, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {carried.length > 0 && (
            <div style={{ ...card, borderColor:'var(--red)', marginBottom:12, overflow:'hidden' }}>
              <div style={{ padding:'10px 12px', fontWeight:700, color:'var(--red)', background:'var(--red-bg)' }}>⚠️ From previous days — not finished ({carried.length})</div>
              {carried.map(w => <JobRow key={w.id} w={w} showDate/>)}
            </div>
          )}

          {awaitingSign.length > 0 && (
            <div style={{ ...card, marginBottom:12, overflow:'hidden' }}>
              <div style={{ padding:'10px 12px', fontWeight:700, color:'var(--purple)' }}>✍️ Done — waiting for the manager's signature ({awaitingSign.length})</div>
              {awaitingSign.map(w => <JobRow key={w.id} w={w} showDate={!!w.scheduled_date}/>)}
            </div>
          )}

          <div style={{ display:'grid', gap:10 }}>
            {days.map((d, i) => {
              const dt = parseYmd(d); const off = dt.getDay() === 0
              const list = (byDay[d] || []).filter(w => w.status !== 'completed')
              const dayPpm = ppm.filter(p => p.due_date === d)
              const totalH = list.reduce((a, w) => a + (Number(w.duration_hours) || 1), 0)
              const collapsed = openDays[d] === false || (openDays[d] === undefined && i > 6 && list.length === 0 && dayPpm.length === 0)
              return (
                <div key={d} className="fx-print-block" style={{ ...card, overflow:'hidden', opacity: off ? 0.7 : 1 }}>
                  <button onClick={() => setOpenDays(o => ({ ...o, [d]: collapsed }))}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 12px', background: d === today ? 'var(--green-bg)' : 'transparent', border:'none', cursor:'pointer', color:'var(--text)', textAlign:'left' }}>
                    <span style={{ fontWeight:700 }}>
                      {d === today ? 'Today · ' : i === 1 ? 'Tomorrow · ' : ''}{dt.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
                    </span>
                    <span style={{ fontSize:12, color: off ? 'var(--text3)' : list.length >= MAX_PER_DAY ? 'var(--red)' : 'var(--text3)' }}>
                      {off ? '🛌 Day off' : list.length === 0 && dayPpm.length === 0 ? 'Free' : `${list.length}/${MAX_PER_DAY} jobs · ${totalH}h${dayPpm.length ? ` · ${dayPpm.length} PPM due` : ''}`}
                    </span>
                  </button>
                  {!collapsed && list.map(w => <JobRow key={w.id} w={w}/>)}
                  {!collapsed && dayPpm.map(p => (
                    <div key={p.id} style={{ padding:'8px 12px', borderTop:'1px dashed var(--border)', fontSize:13, color:'var(--text2)' }}>
                      🗓 <b>PPM due:</b> {p.title} · {p.stores?.name || ''} <span style={{ color:'var(--text3)' }}>(job will be created automatically a few days before)</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {unplanned.length > 0 && (
            <div style={{ ...card, marginTop:12, overflow:'hidden' }}>
              <div style={{ padding:'10px 12px', fontWeight:700, color:'var(--text2)' }}>Assigned but not scheduled yet ({unplanned.length})</div>
              {unplanned.map(w => <JobRow key={w.id} w={w}/>)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
