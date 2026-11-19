import { useEffect, useState } from 'react'
import LiveMap from '../components/LiveMap'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useLive } from '../lib/useLive'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const STATUS_CFG = {
  open:        { bg:'#FFF3E0', text:'#E65100', border:'#EF9F27',  label:'Open' },
  travelling:  { bg:'#E3F2FD', text:'#1565C0', border:'#378ADD',  label:'On the Way' },
  arrived:     { bg:'#E8EAF6', text:'#283593', border:'#7F77DD',  label:'Arrived' },
  in_progress: { bg:'#E8F5E9', text:'#1B5E20', border:'var(--green)',  label:'In Progress' },
  on_hold:     { bg:'#FBE9E7', text:'#BF360C', border:'#E24B4A',  label:'On Hold' },
  completed:   { bg:'#F3E5F5', text:'#4A148C', border:'#9C27B0',  label:'Completed' },
  closed:      { bg:'#ECEFF1', text:'#455A64', border:'#90A4AE',  label:'Closed' },
}
const NEXT_STATUS = {
  open:        { label:'🚗 Start Trip',  next:'travelling' },
  travelling:  { label:'📍 Arrived',     next:'arrived' },
  arrived:     { label:'🔧 Start Work',  next:'in_progress' },
  in_progress: { label:'✅ Complete',    next:'completed' },
  on_hold:     { label:'↩ Reopen',       next:'in_progress' },
  completed:   { label:'✍️ Sign & Close', next:'sign' },
}

const DAY_START = 9
const DAY_END   = 18
const DAY_MINS  = (DAY_END - DAY_START) * 60
const HOURS     = Array.from({length: DAY_END - DAY_START + 1}, (_,i) => DAY_START + i)

// Lay out a technician's jobs on the 9am–6pm strip.
// If a job has a real scheduled_time, honor it (placed at that time, sized by duration_hours).
// Jobs without a scheduled_time are packed back-to-back by priority into the gaps.
function autoSchedule(list) {
  const order = { P1:0, P2:1, P3:2, P4:3 }
  const pad = n => String(n).padStart(2,'0')

  // Parse 'HH:MM[:SS]' → minutes from DAY_START (clamped to the strip)
  const toStripMin = (timeStr) => {
    if (!timeStr) return null
    const [h, m] = timeStr.split(':').map(Number)
    const mins = (h * 60 + (m || 0)) - DAY_START * 60
    return Math.max(0, Math.min(DAY_MINS, mins))
  }

  const place = (wo, startMin, durMin) => {
    const endMin = Math.min(startMin + durMin, DAY_MINS)
    const sh = Math.floor(startMin / 60) + DAY_START, sm = startMin % 60
    const eh = Math.floor(endMin / 60) + DAY_START, em = endMin % 60
    return { ...wo, _startMin:startMin, _endMin:endMin,
      _startTime:`${pad(sh)}:${pad(sm)}`, _endTime:`${pad(eh)}:${pad(em)}` }
  }

  const fixed = []
  const floating = []
  list.forEach(wo => {
    const dur = Math.max(15, (Number(wo.duration_hours) || 1) * 60)
    const start = toStripMin(wo.scheduled_time)
    if (start !== null) fixed.push(place(wo, start, dur))
    else floating.push({ wo, dur })
  })

  // Pack floating jobs (priority order) into the first free cursor slot
  floating.sort((a, b) => (order[a.wo.priority] ?? 3) - (order[b.wo.priority] ?? 3))
  let cursor = 0
  const packed = floating.map(({ wo, dur }) => {
    const card = place(wo, cursor, dur)
    cursor = card._endMin
    return card
  })

  return [...fixed, ...packed].sort((a, b) => a._startMin - b._startMin)
}

// ── Zoomed-out views (week / month) ──────────────────────────────────────────
const MAX_PER_DAY = 8
const pad2 = n => String(n).padStart(2,'0')
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
const parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d) }
const isSunday = s => parseYmd(s).getDay() === 0
const shortTime = t => t ? t.slice(0,5) : ''
const initials = name => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

function JobChip({ wo, techName, onOpen, compact, helper }) {
  const cfg = STATUS_CFG[wo.status] || STATUS_CFG.open
  return (
    <div draggable={!helper}
      onDragStart={e => { if (helper) return; e.dataTransfer.setData('text/plain', wo.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={e => { e.stopPropagation(); onOpen(wo) }}
      title={`${wo.priority} · ${wo.title}\n${wo.stores?.name || ''}${techName ? ' · ' + techName : ''}${wo.scheduled_time ? ' · ' + shortTime(wo.scheduled_time) : ''}`}
      style={{display:'flex',alignItems:'center',gap:4,background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:6,padding:compact?'1px 5px':'3px 6px',fontSize:compact?10:11,color:cfg.text,cursor:'grab',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',userSelect:'none'}}>
      <span style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:P_COLORS[wo.priority]||'#999'}}/>
      {helper && <span title="Helping (second technician) — move it from the main technician's row">👥</span>}
      {wo.schedule_locked && <span>🔒</span>}
      {wo.scheduled_time && <b>{shortTime(wo.scheduled_time)}</b>}
      {techName && <span style={{fontWeight:700}}>{techName}</span>}
      <span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{wo.stores?.name?.split('-').pop().trim() || 'Store'}</span>
    </div>
  )
}

function DropCell({ date, techId, onMove, children, style, dayOff }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { if (dayOff) return; e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (dayOff) return; const id = e.dataTransfer.getData('text/plain'); if (id) onMove(id, { date, techId }) }}
      style={{...style, outline: over ? '2px dashed var(--green)' : 'none', background: dayOff ? 'repeating-linear-gradient(45deg,var(--bg3),var(--bg3) 6px,transparent 6px,transparent 12px)' : (over ? 'rgba(29,158,117,0.08)' : style?.background)}}>
      {children}
    </div>
  )
}

function WeekView({ wos, techs, anchor, onMove, onOpen, onPickDay }) {
  const start = parseYmd(anchor); start.setDate(start.getDate() - ((start.getDay() + 6) % 7))   // Monday
  const days = Array.from({length:7}, (_,i) => { const d = new Date(start); d.setDate(start.getDate()+i); return ymd(d) })
  const today = ymd(new Date())
  const rows = [...techs, { id:'unassigned', full_name:'Unassigned' }]
  const cellWOs = (techId, day) => wos.filter(w => w.scheduled_date === day && ((w.assigned_to || 'unassigned') === techId || (techId !== 'unassigned' && (w.helper_ids || []).includes(techId) && w.assigned_to !== techId)))
    .sort((a,b) => (a.scheduled_time||'99').localeCompare(b.scheduled_time||'99'))
  return (
    <div style={{overflowX:'auto'}}>
      <div style={{display:'grid',gridTemplateColumns:`140px repeat(7, minmax(130px, 1fr))`,gap:4,minWidth:1060}}>
        <div/>
        {days.map(d => {
          const dt = parseYmd(d); const off = dt.getDay() === 0
          const total = wos.filter(w => w.scheduled_date === d).length
          return (
            <button key={d} onClick={() => onPickDay(d)} title="Open this day"
              style={{background: d === today ? 'var(--green-bg)' : 'var(--surface)', border:`1px solid ${d === today ? 'var(--green)' : 'var(--border)'}`, borderRadius:8, padding:'6px 8px', cursor:'pointer', color: off ? 'var(--text3)' : 'var(--text)', textAlign:'left'}}>
              <div style={{fontSize:12,fontWeight:700}}>{dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
              <div style={{fontSize:10,color:'var(--text3)'}}>{off ? 'Day off' : `${total} job${total===1?'':'s'}`}</div>
            </button>
          )
        })}
        {rows.map(t => (
          <div key={t.id} style={{display:'contents'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0'}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:t.id==='unassigned'?'var(--border)':'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700}}>{t.id==='unassigned'?'?':initials(t.full_name)}</div>
              <div style={{fontSize:12,fontWeight:600}}>{t.full_name.split(' ')[0]}</div>
            </div>
            {days.map(d => {
              const list = cellWOs(t.id, d); const off = isSunday(d)
              const full = t.id !== 'unassigned' && list.length >= MAX_PER_DAY
              return (
                <DropCell key={d} date={d} techId={t.id} onMove={onMove} dayOff={off}
                  style={{minHeight:64,background:'var(--surface)',border:`1px solid ${full ? 'var(--red)' : 'var(--border)'}`,borderRadius:8,padding:4,display:'flex',flexDirection:'column',gap:3}}>
                  {!off && t.id !== 'unassigned' && <div style={{fontSize:9,fontWeight:700,color: full ? 'var(--red)' : 'var(--text3)',textAlign:'right'}}>{list.length}/{MAX_PER_DAY}</div>}
                  {list.map(w => <JobChip key={w.id} wo={w} onOpen={onOpen} helper={w.assigned_to !== t.id && t.id !== 'unassigned'}/>)}
                </DropCell>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthView({ wos, techs, anchor, onMove, onOpen, onPickDay }) {
  const a = parseYmd(anchor)
  const first = new Date(a.getFullYear(), a.getMonth(), 1)
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const days = Array.from({length:42}, (_,i) => { const d = new Date(start); d.setDate(start.getDate()+i); return d })
  const today = ymd(new Date())
  const techName = id => { const t = techs.find(x => x.id === id); return t ? '👷' + t.full_name.split(' ')[0] : '' }
  return (
    <div style={{overflowX:'auto'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7, minmax(120px, 1fr))',gap:4,minWidth:860}}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} style={{fontSize:11,fontWeight:700,color:'var(--text3)',padding:'0 4px'}}>{d}{d==='Sun'?' (off)':''}</div>)}
        {days.map(dt => {
          const d = ymd(dt); const inMonth = dt.getMonth() === a.getMonth(); const off = dt.getDay() === 0
          const list = wos.filter(w => w.scheduled_date === d).sort((x,y) => (x.scheduled_time||'99').localeCompare(y.scheduled_time||'99'))
          return (
            <DropCell key={d} date={d} onMove={onMove} dayOff={off}
              style={{minHeight:96,background:'var(--surface)',border:`1px solid ${d === today ? 'var(--green)' : 'var(--border)'}`,borderRadius:8,padding:4,opacity: inMonth ? 1 : 0.45,display:'flex',flexDirection:'column',gap:2}}>
              <button onClick={() => onPickDay(d)} style={{background:'none',border:'none',padding:0,cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',color:'var(--text)'}}>
                <span style={{fontSize:12,fontWeight:700}}>{dt.getDate()}</span>
                {list.length > 0 && <span style={{fontSize:10,color:'var(--text3)'}}>{list.length}</span>}
              </button>
              {list.slice(0, 4).map(w => <JobChip key={w.id} wo={w} techName={w.assigned_to ? techName(w.assigned_to) : ''} onOpen={onOpen} compact/>)}
              {list.length > 4 && <button onClick={() => onPickDay(d)} style={{background:'none',border:'none',padding:0,fontSize:10,color:'var(--blue)',cursor:'pointer',textAlign:'left'}}>+{list.length - 4} more</button>}
            </DropCell>
          )
        })}
      </div>
    </div>
  )
}

export default function Schedule() {
  const { profile, isAdmin } = useAuth()
  const isTechnician = profile?.role === 'technician'
  const navigate = useNavigate()

  const [wos,         setWos]         = useState([])
  const [techs,       setTechs]       = useState([])
  const [stores,      setStores]      = useState([])
  const [assignments, setAssignments] = useState([])
  const [techLocs,    setTechLocs]    = useState({})
  const [loading,     setLoading]     = useState(true)
  const [view,        setView]        = useState('day')
  const [activeWO,    setActiveWO]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [holdReason,  setHoldReason]  = useState('')
  const [showHold,    setShowHold]    = useState(false)
  const [showAssign,  setShowAssign]  = useState(false)
  const [assignStore, setAssignStore] = useState('')
  const [assignTech,  setAssignTech]  = useState('')
  const [dragging,    setDragging]    = useState(null)
  const [dragOver,    setDragOver]    = useState(null)
  const localDay = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  const [day,         setDay]         = useState(() => localDay(new Date()))
  const [planning,    setPlanning]    = useState(false)
  const [planMsg,     setPlanMsg]     = useState('')
  const isStaff = profile?.role === 'admin' || profile?.role === 'operations'
  const shiftDay = (n) => {
    const [y,m,d] = day.split('-').map(Number)
    if (view === 'month') setDay(localDay(new Date(y, m-1+n, 1)))
    else setDay(localDay(new Date(y, m-1, d + (view === 'week' ? 7*n : n))))
  }

  // Live: any change to a work order anywhere refreshes the board
  useLive('work_orders', () => fetchAll(true))

  // Move a job to another day / technician / time (drag & drop or editor)
  async function moveWO(woId, { date, techId, time }) {
    const wo = wos.find(w => w.id === woId)
    if (!wo) return
    if (date && isSunday(date)) { alert('Sunday is a day off — choose another day.'); return }
    const targetTech = techId === undefined ? (wo.assigned_to || null) : (techId === 'unassigned' ? null : techId)
    const targetDate = date || wo.scheduled_date
    const targetTime = time || wo.scheduled_time || '09:00'
    if (targetTech && targetDate) {
      const already = wos.filter(w => w.id !== wo.id && w.assigned_to === targetTech && w.scheduled_date === targetDate).length
      if (already >= MAX_PER_DAY && !window.confirm(`This technician already has ${already} jobs on that day (limit ${MAX_PER_DAY}). Add anyway?`)) return
    }
    if (targetDate === wo.scheduled_date && targetTech === (wo.assigned_to || null) && shortTime(targetTime) === shortTime(wo.scheduled_time)) return
    // optimistic update so the card moves instantly
    setWos(prev => prev.map(w => w.id === wo.id ? { ...w, scheduled_date: targetDate, scheduled_time: targetTime, assigned_to: targetTech, schedule_locked: true } : w))
    const patch = { scheduled_date: targetDate, scheduled_time: targetTime }
    if (isStaff) patch.assigned_to = targetTech
    const { error } = await supabase.from('work_orders').update(patch).eq('id', wo.id)
    if (error && Object.keys(error).length) { alert('Error: ' + error.message); fetchAll(true); return }
    const techName = techs.find(t => t.id === targetTech)?.full_name
    supabase.from('wo_updates').insert({
      work_order_id: wo.id, user_id: profile?.id, type:'note',
      content: `Moved to ${parseYmd(targetDate).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} ${shortTime(targetTime)}${techName && targetTech !== wo.assigned_to ? ' · ' + techName : ''}`,
    }).then(()=>{}, ()=>{})
    fetchAll(true)
  }

  async function autoPlan() {
    setPlanning(true); setPlanMsg('')
    const { data, error } = await supabase.rpc('run_auto_dispatch')
    setPlanning(false)
    if (error && Object.keys(error).length) { setPlanMsg('❌ ' + error.message); return }
    setPlanMsg(`✅ Planned ${data} job${data === 1 ? '' : 's'} — valid SLA first, max ${MAX_PER_DAY} per technician per day, 9am–6pm`)
    setTimeout(() => setPlanMsg(''), 6000)
    fetchAll()
  }

  async function releaseToAutoPlan() {
    if (!activeWO) return
    setSaving(true)
    const { error } = await supabase.from('work_orders').update({ schedule_locked:false }).eq('id', activeWO.id)
    if (error && Object.keys(error).length) { alert('Error: ' + error.message); setSaving(false); return }
    await supabase.rpc('run_auto_dispatch')
    setEditSched(false); setActiveWO(null); setSaving(false); fetchAll()
  }

  // Schedule editor (date / time / duration) inside the WO popup
  const [editSched,  setEditSched]  = useState(false)
  const [schedDate,  setSchedDate]  = useState('')
  const [schedTime,  setSchedTime]  = useState('')
  const [schedDur,   setSchedDur]   = useState(1)
  const [schedTech,  setSchedTech]  = useState('')

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchLocs, 60000)
    return () => clearInterval(iv)
  }, [])

  async function fetchAll(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [woRes, techRes, storeRes, asnRes] = await Promise.all([
        supabase.from('work_orders')
          .select('*,stores(name,latitude,longitude,manager_name,phone)')
          .neq('status','closed').order('priority'),
        supabase.from('profiles').select('id,full_name,phone').eq('role','technician'),
        supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone'),
        supabase.from('store_technician_assignments').select('*'),
      ])

      // Supabase returns {data, error} and does NOT throw, so check error as an object.
      if (woRes.error && Object.keys(woRes.error).length)       console.error('WO load error:', woRes.error)
      if (techRes.error && Object.keys(techRes.error).length)   console.error('Tech load error:', techRes.error)
      if (storeRes.error && Object.keys(storeRes.error).length) console.error('Store load error:', storeRes.error)
      if (asnRes.error && Object.keys(asnRes.error).length)     console.error('Assignment load error:', asnRes.error)

      setWos(woRes.data         || [])
      setTechs(techRes.data     || [])
      setStores(storeRes.data   || [])
      setAssignments(asnRes.data || [])
      await fetchLocs()
    } catch(e) {
      console.error('Dispatch board load threw:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLocs() {
    try {
      const res = await supabase.from('technician_locations').select('*')
        .gte('updated_at', new Date(Date.now() - 120*60000).toISOString())
      const locs = {}
      ;((res && res.data) || []).forEach(l => { locs[l.technician_id] = l })
      setTechLocs(locs)
    } catch { /* table may not exist yet */ }
  }

  async function quickStatus(wo, nextStatus) {
    if (nextStatus === 'on_hold') { setShowHold(true); return }
    if (nextStatus === 'sign') { navigate(`/work-orders/${wo.id}`); return }   // closing needs the manager's signature
    setSaving(true)
    const now = new Date().toISOString()
    const patch = { status:nextStatus, updated_at:now }
    if (nextStatus==='travelling')  patch.trip_started_at  = now
    if (nextStatus==='arrived')     patch.arrived_at       = now
    if (nextStatus==='in_progress') patch.work_started_at  = now
    if (nextStatus==='completed')   patch.completed_at     = now
    if (nextStatus==='closed')      patch.closed_at        = now
    const upd = await supabase.from('work_orders').update(patch).eq('id', wo.id)
    if (upd.error && Object.keys(upd.error).length) { alert('Error: ' + upd.error.message); setSaving(false); return }
    await supabase.from('wo_updates').insert({
      work_order_id:wo.id, user_id:profile.id,
      type:'status_change', content:`Status → ${nextStatus}`
    }).then(() => {}, () => {})
    setActiveWO(null); fetchAll(); setSaving(false)
  }

  async function submitHold() {
    if (!activeWO || !holdReason.trim()) return
    setSaving(true)
    await supabase.from('work_orders').update({
      status:'on_hold', hold_reason:holdReason, updated_at:new Date().toISOString()
    }).eq('id', activeWO.id)
    await supabase.from('wo_updates').insert({
      work_order_id:activeWO.id, user_id:profile.id,
      type:'status_change', content:`On Hold: ${holdReason}`
    }).then(() => {}, () => {})
    setShowHold(false); setHoldReason(''); setActiveWO(null)
    fetchAll(); setSaving(false)
  }

  async function saveAssignment() {
    if (!assignStore || !assignTech) return
    const { error } = await supabase.from('store_technician_assignments')
      .upsert({ store_id:assignStore, technician_id:assignTech }, { onConflict:'store_id,technician_id' })
    if (error && Object.keys(error).length) alert('Error: ' + error.message)
    setShowAssign(false); setAssignStore(''); setAssignTech('')
    fetchAll()
  }

  // Open the schedule editor, pre-filled from the active work order
  function openScheduleEditor() {
    if (!activeWO) return
    const today = new Date()
    const yyyy = today.getFullYear(), mm = String(today.getMonth()+1).padStart(2,'0'), dd = String(today.getDate()).padStart(2,'0')
    setSchedDate(activeWO.scheduled_date || `${yyyy}-${mm}-${dd}`)
    setSchedTime((activeWO.scheduled_time || '09:00').slice(0,5))
    setSchedDur(Number(activeWO.duration_hours) || 1)
    setSchedTech(activeWO.assigned_to || '')
    setEditSched(true)
  }

  async function saveSchedule() {
    if (!activeWO) return
    if (schedDate && isSunday(schedDate)) { alert('Sunday is a day off — choose another day.'); return }
    if (schedTime && (schedTime < '09:00' || schedTime > '17:30')) { if (!window.confirm('That time is outside working hours (9am–6pm). Save anyway?')) return }
    setSaving(true)
    const patch = {
      scheduled_date: schedDate || null,
      scheduled_time: schedTime || null,
      duration_hours: schedDur,
      updated_at: new Date().toISOString(),
    }
    if (isStaff) patch.assigned_to = schedTech || null
    const { error } = await supabase.from('work_orders').update(patch).eq('id', activeWO.id)
    if (error && Object.keys(error).length) { alert('Error: ' + error.message); setSaving(false); return }
    // log to timeline (best-effort)
    supabase.from('wo_updates').insert({
      work_order_id: activeWO.id, user_id: profile?.id,
      type: 'status_change',
      content: `Rescheduled → ${schedDate} ${schedTime} · ${schedDur}h`,
    }).then(()=>{}, ()=>{})
    setEditSched(false); setActiveWO(null); setSaving(false); fetchAll()
  }

  async function onDragStart(wo, techId) { setDragging({ wo, techId }) }
  // Drop on a technician's 9am–6pm strip: time from the mouse position, snapped to 30 minutes
  function onStripDrop(e, targetTechId) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragging?.wo?.id
    setDragging(null); setDragOver(null)
    if (!id) return
    const wo = wos.find(w => w.id === id)
    const rect = e.currentTarget.getBoundingClientRect()
    const durMin = Math.max(30, (Number(wo?.duration_hours) || 1) * 60)
    let mins = Math.round(((e.clientX - rect.left) / rect.width) * DAY_MINS / 30) * 30
    mins = Math.max(0, Math.min(DAY_MINS - durMin, mins))
    const t = `${pad2(DAY_START + Math.floor(mins / 60))}:${pad2(mins % 60)}`
    moveWO(id, { date: day, techId: targetTechId, time: t })
  }

  const woByTech = {}
  const dayWOs  = wos.filter(wo => wo.scheduled_date === day)
  const backlog = wos.filter(wo => !wo.scheduled_date && !['completed','closed'].includes(wo.status))
  dayWOs.forEach(wo => {
    const key = wo.assigned_to || 'unassigned'
    if (!woByTech[key]) woByTech[key] = []
    woByTech[key].push(wo)
    // second technician: the same visit also shows in the helper's row (not draggable there)
    ;(wo.helper_ids || []).forEach(h => { if (h && h !== wo.assigned_to) (woByTech[h] = woByTech[h] || []).push({ ...wo, _helper:true }) })
  })
  Object.keys(woByTech).forEach(k => { woByTech[k] = autoSchedule(woByTech[k]) })

  // Build Google Maps embed URL with markers
  const buildMapUrl = () => {
    const base = 'https://maps.google.com/maps'
    if (selectedStore) {
      return `${base}?q=${selectedStore.latitude},${selectedStore.longitude}&z=15&output=embed`
    }
    if (validStores.length === 0) {
      return `${base}?q=25.2048,55.2708&z=10&output=embed`
    }
    // Show first store by default, user can click to zoom
    const first = validStores[0]
    return `${base}?q=${mapCenter}&z=10&output=embed`
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)'}}>
      Loading dispatch board…
    </div>
  )

  return (
    <div style={{color:'var(--text)'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:22,fontWeight:700}}>Dispatch Board</h2>
          <p style={{margin:'4px 0 0',color:'var(--text3)',fontSize:13}}>
            {Object.values(techLocs).length} active · {techs.length} technicians ·{' '}
            auto-planned daily 9am–6pm · max {MAX_PER_DAY} jobs per technician · valid SLA first
          </p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {isAdmin && (
            <button onClick={()=>setShowAssign(true)} style={{background:'var(--green)',color:'white',border:'none',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',fontWeight:600}}>
              ⚙️ Tech Coverage
            </button>
          )}
          {isStaff && (
            <button onClick={autoPlan} disabled={planning} title="Re-plan all open jobs: valid SLA first, 9am–6pm, max 8 per technician per day"
              style={{background:'var(--blue)',color:'white',border:'none',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',fontWeight:600,opacity:planning?0.6:1}}>
              {planning ? 'Planning…' : '⚡ Auto-plan'}
            </button>
          )}
          <button onClick={fetchAll} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>
            ↻ Refresh
          </button>
          <button onClick={()=>navigate('/my-schedule')} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>
            📆 30-day list
          </button>
          {['day','week','month','map'].map(v => (
            <button key={v} onClick={()=>setView(v)} style={{
              background:view===v?'var(--green)':'var(--surface)',
              color:view===v?'white':'var(--text)',
              border:`1px solid ${view===v?'var(--green)':'var(--border)'}`,
              borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',fontWeight:600,
            }}>
              {{day:'📋 Day',week:'🗓 Week',month:'📅 Month',map:'🗺️ Map'}[v]}
            </button>
          ))}
        </div>
      </div>

      {planMsg && <div style={{padding:'10px 14px',borderRadius:10,marginBottom:12,fontSize:13,background:planMsg.startsWith('❌')?'var(--red-bg)':'var(--green-bg)',color:planMsg.startsWith('❌')?'var(--red)':'var(--green)'}}>{planMsg}</div>}

      {view!=='map' && (
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <button onClick={()=>shiftDay(-1)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'var(--text)'}}>←</button>
          <div style={{fontWeight:700,fontSize:15,minWidth:210,textAlign:'center'}}>
            {(() => {
              const dt = parseYmd(day)
              if (view === 'month') return dt.toLocaleDateString('en-GB',{month:'long',year:'numeric'})
              if (view === 'week') { const s0 = new Date(dt); s0.setDate(dt.getDate() - ((dt.getDay()+6)%7)); const e0 = new Date(s0); e0.setDate(s0.getDate()+6)
                return `${s0.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${e0.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` }
              return dt.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}) + (dt.getDay()===0 ? ' · day off' : '')
            })()}
          </div>
          <button onClick={()=>shiftDay(1)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'var(--text)'}}>→</button>
          {day !== localDay(new Date()) && <button onClick={()=>setDay(localDay(new Date()))} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'var(--text)',fontSize:12}}>Today</button>}
          <input type="date" value={day} onChange={e=>e.target.value&&setDay(e.target.value)} style={{background:'var(--input-bg)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 8px',color:'var(--text)',fontSize:12}}/>
          {view==='day' && <span style={{fontSize:12,color:'var(--text3)'}}>{dayWOs.length} job{dayWOs.length===1?'':'s'} this day</span>}
          {view!=='day' && <span style={{fontSize:12,color:'var(--text3)'}}>Drag a job to another day{view==='week'?' or technician':''} · click a day to open it</span>}
        </div>
      )}

      {view==='week' && <WeekView wos={wos} techs={techs} anchor={day} onMove={moveWO} onOpen={setActiveWO} onPickDay={d=>{setDay(d);setView('day')}}/>}
      {view==='month' && <MonthView wos={wos} techs={techs} anchor={day} onMove={moveWO} onOpen={setActiveWO} onPickDay={d=>{setDay(d);setView('day')}}/>}

      {/* DAY TIMELINE VIEW */}
      {view==='day' && (
        <div style={{overflowX:'auto'}}>
          <div style={{minWidth:900}}>
            <div style={{display:'flex',marginLeft:160,marginBottom:4}}>
              {HOURS.map(h=>(
                <div key={h} style={{flex:1,textAlign:'left',fontSize:11,color:'var(--text3)',paddingLeft:4}}>
                  {h<12?`${h}am`:h===12?'12pm':`${h-12}pm`}
                </div>
              ))}
            </div>
            {[...techs,{id:'unassigned',full_name:'Unassigned'}].map(tech=>{
              const myWOs  = woByTech[tech.id] || []
              const loc    = techLocs[tech.id]
              const online = loc && (Date.now()-new Date(loc.updated_at))<5*60000
              return (
                <div key={tech.id}
                  onDragOver={e=>{e.preventDefault();setDragOver(tech.id)}}
                  onDragLeave={()=>setDragOver(null)}
                  style={{display:'flex',alignItems:'stretch',marginBottom:6,background:dragOver===tech.id?'rgba(29,158,117,0.05)':'transparent',borderRadius:8,border:dragOver===tech.id?'1px dashed var(--green)':'1px solid transparent'}}
                >
                  <div style={{width:155,flexShrink:0,display:'flex',alignItems:'center',gap:8,paddingRight:8}}>
                    <div style={{width:32,height:32,borderRadius:'50%',flexShrink:0,background:tech.id==='unassigned'?'var(--border)':'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700}}>
                      {tech.id==='unassigned'?'?':tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{tech.full_name.split(' ')[0]}
                        {tech.id!=='unassigned' && <span style={{marginLeft:6,fontSize:10,fontWeight:700,color:myWOs.length>=MAX_PER_DAY?'var(--red)':'var(--text3)'}}>{myWOs.length}/{MAX_PER_DAY}</span>}
                      </div>
                      <div style={{fontSize:10,color:online?'#1D9E75':'var(--text3)'}}>{tech.id==='unassigned'?'':online?'🟢 online':'⚫ offline'}</div>
                    </div>
                  </div>
                  <div onDragOver={e=>e.preventDefault()} onDrop={e=>onStripDrop(e, tech.id)}
                    style={{flex:1,position:'relative',height:52,background:isSunday(day)?'repeating-linear-gradient(45deg,var(--bg3),var(--bg3) 6px,var(--surface) 6px,var(--surface) 12px)':'var(--surface)',borderRadius:8,border:'1px solid var(--border)',overflow:'visible'}}>
                    {HOURS.slice(0,-1).map((_,i)=>(
                      <div key={i} style={{position:'absolute',top:0,bottom:0,left:`${(i/(HOURS.length-1))*100}%`,borderLeft:'1px dashed var(--border)',pointerEvents:'none'}}/>
                    ))}
                    {myWOs.map(wo=>{
                      const cfg=STATUS_CFG[wo.status]||STATUS_CFG.open
                      return (
                        <div key={wo.id + (wo._helper ? '-h' : '')} draggable={!wo._helper} onDragStart={e=>{ if (wo._helper) return; e.dataTransfer.setData('text/plain', wo.id); onDragStart(wo,tech.id)}} onClick={()=>setActiveWO(wo)} title={wo._helper ? 'Helping (second technician)' : undefined}
                          style={{position:'absolute',top:4,height:'calc(100% - 8px)',left:`${(wo._startMin/DAY_MINS)*100}%`,width:`${Math.max(2,((wo._endMin-wo._startMin)/DAY_MINS)*100)}%`,minWidth:60,background:cfg.bg,border:`1.5px solid ${cfg.border}`,borderRadius:6,cursor:'pointer',overflow:'hidden',display:'flex',alignItems:'center',padding:'0 6px',boxSizing:'border-box',zIndex:2,boxShadow:'0 1px 4px rgba(0,0,0,.1)'}}
                          onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
                          onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                        >
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:10,fontWeight:700,color:cfg.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                              <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:P_COLORS[wo.priority]||'#999',marginRight:4}}/>
                              {wo._helper && <span title="Helping (second technician)">👥 </span>}
                              {wo.schedule_locked && <span title="Placed by hand — auto-plan won't move it">🔒 </span>}
                              {wo.stores?.name?.split('-').pop().trim()||'Store'}
                            </div>
                            <div style={{fontSize:9,color:cfg.text,opacity:0.8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{wo._startTime}–{wo._endTime}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <p style={{color:'var(--text3)',fontSize:11,marginTop:12}}>💡 Drag work orders between technicians to reassign · Click a card to update status · 🔒 = placed by hand (auto-plan keeps it)</p>
          {false && backlog.length > 0 && (
            <div style={{marginTop:14,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:8}}>
                Not scheduled yet ({backlog.length}) {isStaff && <span style={{fontWeight:400,color:'var(--text3)'}}>— press ⚡ Auto-plan, or open one to set a time</span>}
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {backlog.map(wo => (
                  <button key={wo.id} onClick={()=>setActiveWO(wo)} style={{display:'flex',alignItems:'center',gap:6,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:P_COLORS[wo.priority]||'#999'}}/>
                    {wo.priority} · {wo.stores?.name || 'Store'}{wo.vendor_name ? ` · 🧰 ${wo.vendor_name}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {view!=='map' && backlog.length > 0 && (
        <div style={{marginTop:14,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:12}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',marginBottom:8}}>
            Not scheduled yet ({backlog.length}) <span style={{fontWeight:400,color:'var(--text3)'}}>— drag onto a day{isStaff ? ', or press ⚡ Auto-plan' : ''}</span>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {backlog.map(wo => <JobChip key={wo.id} wo={wo} techName={techs.find(t=>t.id===wo.assigned_to)?.full_name?.split(' ')[0] || ''} onOpen={setActiveWO}/>)}
          </div>
        </div>
      )}

      {/* LIVE MAP VIEW */}
      {view==='map' && <LiveMap height={520} />}

      {/* WO Detail popup */}
      {activeWO && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={e=>{if(e.target===e.currentTarget)setActiveWO(null)}}>
          <div style={{background:'var(--surface)',borderRadius:14,padding:24,width:'100%',maxWidth:440,boxShadow:'0 8px 32px rgba(0,0,0,.25)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <div>
                <h3 style={{margin:0,fontSize:17,fontWeight:700}}>{activeWO.title||'Work Order'}</h3>
                <div style={{color:'var(--text3)',fontSize:13,marginTop:4}}>{activeWO.stores?.name}</div>
              </div>
              <button onClick={()=>setActiveWO(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--text3)',lineHeight:1}}>×</button>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
              <span style={{background:P_COLORS[activeWO.priority]+'22',color:P_COLORS[activeWO.priority],borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:700,border:`1px solid ${P_COLORS[activeWO.priority]}`}}>{activeWO.priority}</span>
              {(()=>{const c=STATUS_CFG[activeWO.status]||STATUS_CFG.open;return <span style={{background:c.bg,color:c.text,border:`1px solid ${c.border}`,borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:600}}>{c.label}</span>})()}
            </div>
            <div style={{fontSize:12,color:'var(--text2)',marginBottom:12,display:'flex',gap:12,flexWrap:'wrap'}}>
              <span>🗓 {activeWO.scheduled_date ? parseYmd(activeWO.scheduled_date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : 'Not scheduled'}{activeWO.scheduled_time ? ' · ' + shortTime(activeWO.scheduled_time) : ''} · {Number(activeWO.duration_hours)||1}h</span>
              <span>👷 {techs.find(t=>t.id===activeWO.assigned_to)?.full_name || 'Unassigned'}</span>
              {activeWO.schedule_locked && <span title="Placed by hand">🔒 fixed time</span>}
            </div>
            {activeWO.description && <p style={{fontSize:13,color:'var(--text2)',margin:'0 0 16px',lineHeight:1.5}}>{activeWO.description}</p>}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap'}}>
              <button onClick={()=>navigate(`/work-orders/${activeWO.id}`)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>📄 Full Details</button>
              {(isStaff || isTechnician) && (
                <button onClick={openScheduleEditor} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>🗓 Reschedule</button>
              )}
              {NEXT_STATUS[activeWO.status] && (
                <button disabled={saving} onClick={()=>quickStatus(activeWO,NEXT_STATUS[activeWO.status].next)} style={{background:'var(--green)',color:'white',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,cursor:'pointer',fontWeight:600,opacity:saving?0.6:1}}>
                  {saving?'Saving…':NEXT_STATUS[activeWO.status].label}
                </button>
              )}
              <button onClick={()=>setShowHold(true)} style={{background:'#FBE9E7',color:'#BF360C',border:'1px solid #E24B4A',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',fontWeight:600}}>⏸ Hold</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule editor modal */}
      {editSched && activeWO && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1020,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget)setEditSched(false)}}>
          <div style={{background:'var(--surface)',borderRadius:14,padding:24,width:'100%',maxWidth:380}}>
            <h3 style={{margin:'0 0 4px',fontSize:16,fontWeight:700}}>Reschedule Work Order</h3>
            <div style={{color:'var(--text3)',fontSize:12,marginBottom:18}}>{activeWO.title}</div>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:6}}>Date</div>
              <input type="date" value={schedDate} onChange={e=>setSchedDate(e.target.value)}
                style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',fontSize:14,background:'var(--bg)',color:'var(--text)',boxSizing:'border-box'}}/>
            </div>

            {isStaff && (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:6}}>Technician</div>
                <select value={schedTech} onChange={e=>setSchedTech(e.target.value)}
                  style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',fontSize:14,background:'var(--bg)',color:'var(--text)',boxSizing:'border-box'}}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}

            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:6}}>Start Time</div>
              <input type="time" value={schedTime} onChange={e=>setSchedTime(e.target.value)} step="900"
                style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',fontSize:14,background:'var(--bg)',color:'var(--text)',boxSizing:'border-box'}}/>
            </div>

            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:6}}>Duration</div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>setSchedDur(d=>Math.max(0.5, Math.round((d-0.5)*2)/2))}
                  style={{width:40,height:40,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:20,cursor:'pointer',fontWeight:700,lineHeight:1}}>−</button>
                <div style={{flex:1,textAlign:'center',fontSize:18,fontWeight:700}}>
                  {schedDur} <span style={{fontSize:13,fontWeight:500,color:'var(--text3)'}}>hour{schedDur===1?'':'s'}</span>
                </div>
                <button onClick={()=>setSchedDur(d=>Math.min(9, Math.round((d+0.5)*2)/2))}
                  style={{width:40,height:40,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:20,cursor:'pointer',fontWeight:700,lineHeight:1}}>+</button>
              </div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:6,textAlign:'center'}}>Adjust in 30-minute steps (0.5h – 9h)</div>
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap'}}>
              {activeWO.schedule_locked && isStaff && (
                <button onClick={releaseToAutoPlan} disabled={saving} title="Remove the manual time and let the automatic plan place this job"
                  style={{background:'var(--surface)',border:'1px solid var(--blue)',borderRadius:8,padding:'9px 14px',fontSize:13,cursor:'pointer',color:'var(--blue)',marginRight:'auto'}}>⚡ Let auto-plan decide</button>
              )}
              <button onClick={()=>setEditSched(false)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 16px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>Cancel</button>
              <button onClick={saveSchedule} disabled={saving||!schedDate||!schedTime}
                style={{background:'var(--green)',color:'white',border:'none',borderRadius:8,padding:'9px 18px',fontSize:13,cursor:'pointer',fontWeight:600,opacity:(saving||!schedDate||!schedTime)?0.6:1}}>
                {saving?'Saving…':'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold modal */}
      {showHold && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1010,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--surface)',borderRadius:14,padding:24,width:'100%',maxWidth:360}}>
            <h3 style={{margin:'0 0 12px',fontSize:16}}>Reason for Hold</h3>
            <textarea value={holdReason} onChange={e=>setHoldReason(e.target.value)} placeholder="Describe why this is on hold…"
              style={{width:'100%',minHeight:80,borderRadius:8,border:'1px solid var(--border)',padding:10,fontSize:13,background:'var(--bg)',color:'var(--text)',resize:'vertical',boxSizing:'border-box'}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>
              <button onClick={()=>setShowHold(false)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>Cancel</button>
              <button onClick={submitHold} disabled={saving||!holdReason.trim()} style={{background:'#E24B4A',color:'white',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,cursor:'pointer',fontWeight:600,opacity:(saving||!holdReason.trim())?0.6:1}}>
                {saving?'Saving…':'Confirm Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tech coverage modal */}
      {showAssign && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:1010,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--surface)',borderRadius:14,padding:24,width:'100%',maxWidth:400}}>
            <h3 style={{margin:'0 0 16px',fontSize:16}}>Assign Technician to Store</h3>
            <select value={assignStore} onChange={e=>setAssignStore(e.target.value)}
              style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',marginBottom:10,fontSize:13,background:'var(--bg)',color:'var(--text)'}}>
              <option value=''>Select store…</option>
              {stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={assignTech} onChange={e=>setAssignTech(e.target.value)}
              style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',marginBottom:16,fontSize:13,background:'var(--bg)',color:'var(--text)'}}>
              <option value=''>Select technician…</option>
              {techs.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAssign(false)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer',color:'var(--text)'}}>Cancel</button>
              <button onClick={saveAssignment} disabled={!assignStore||!assignTech} style={{background:'var(--green)',color:'white',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,cursor:'pointer',fontWeight:600,opacity:(!assignStore||!assignTech)?0.5:1}}>Save Assignment</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
