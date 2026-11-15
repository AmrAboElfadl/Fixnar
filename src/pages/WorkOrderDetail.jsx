import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'
import { compressImage, uploadWoFile, openWoFile } from '../lib/files'
import { CHECKLIST_TEMPLATES } from '../lib/checklists'

const hasErr = (e) => e && Object.keys(e).length
const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }

const STATUS_STEPS = [
  { key:'open',        label:'Open',        icon:'◯' },
  { key:'travelling',  label:'On the Way',  icon:'🚗' },
  { key:'arrived',     label:'Arrived',     icon:'📍' },
  { key:'in_progress', label:'In Progress', icon:'🔧' },
  { key:'on_hold',     label:'On Hold',     icon:'⏸' },
  { key:'completed',   label:'Completed',   icon:'✅' },
  { key:'closed',      label:'Closed',      icon:'🔒' },
]
const QUOTE_STATUS = {
  submitted: { label:'Waiting approval', color:'var(--amber)', bg:'var(--amber-bg)' },
  approved:  { label:'Approved',         color:'var(--green)', bg:'var(--green-bg)' },
  rejected:  { label:'Rejected',         color:'var(--red)',   bg:'var(--red-bg)' },
  paid:      { label:'Paid',             color:'var(--blue)',  bg:'var(--blue-bg)' },
}
const AED = (n) => `AED ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`

export default function WorkOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const role = profile?.role
  const isStaff = role === 'admin' || role === 'operations'
  const isVendor = role === 'vendor'
  const sigCanvas = useRef(null)

  const [wo, setWo]             = useState(null)
  const [updates, setUpdates]   = useState([])
  const [checklist, setChecklist] = useState([])
  const [quotes, setQuotes]     = useState([])
  const [techs, setTechs]       = useState([])
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [msg, setMsg]           = useState(null)
  const [note, setNote]         = useState('')
  const [holdReason, setHoldReason] = useState('')
  const [workUpdate, setWorkUpdate] = useState('')
  const [photos, setPhotos]     = useState([])
  const [action, setAction]     = useState(null) // 'hold' | 'complete' | 'signature' | 'assign' | 'quote'
  const [saving, setSaving]     = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSig, setHasSig]     = useState(false)
  const [signedBy, setSignedBy] = useState('')
  const [assign, setAssign]     = useState({})
  const [quoteForm, setQuoteForm] = useState({ kind:'quote', amount:'', description:'', file:null })
  const [newItem, setNewItem]   = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [partsUsed, setPartsUsed] = useState([])
  const [partsList, setPartsList] = useState([])
  const [partForm, setPartForm] = useState(null)   // { part_id, qty, from }

  useEffect(() => { fetchWO() }, [id])

  function flash(text, type = 'ok') { setMsg({ text, type }); setTimeout(() => setMsg(null), 5000) }

  async function fetchWO() {
    setLoading(true)
    const [woRes, updRes, chkRes, qRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(*),assets(id,name)').eq('id', id).maybeSingle(),
      supabase.from('wo_updates').select('*,profiles(full_name)').eq('work_order_id', id).order('created_at'),
      supabase.from('wo_checklist_items').select('*').eq('work_order_id', id).order('position'),
      supabase.from('vendor_quotes').select('*').eq('work_order_id', id).order('created_at'),
    ])
    if (hasErr(woRes.error)) console.error('WO fetch error:', woRes.error)
    setWo(woRes.data || null)
    setUpdates(updRes.data || [])
    setChecklist(chkRes.data || [])
    setQuotes(qRes.data || [])
    if (!isVendor) {
      const pu = await supabase.from('stock_movements').select('id,part_id,qty_change,unit_cost,store_id,created_at,parts(name,unit)')
        .eq('work_order_id', id).eq('kind', 'use').order('created_at')
      setPartsUsed(pu.data || [])
    }
    setLoading(false)
    if (isStaff && techs.length === 0) {
      const [t, v] = await Promise.all([
        supabase.from('profiles').select('id,full_name').eq('role','technician').order('full_name'),
        supabase.from('vendors').select('id,name').eq('is_active', true).order('name'),
      ])
      setTechs(t.data || []); setVendors(v.data || [])
    }
  }

  async function logUpdate(type, content, pics = null) {
    const { error } = await supabase.from('wo_updates').insert({ work_order_id:id, user_id:profile.id, type, content, photos:pics })
    if (hasErr(error)) console.error('log update error', error)
  }

  async function updateStatus(newStatus, extra = {}) {
    setSaving(true)
    const now = new Date().toISOString()
    const patch = { status:newStatus, updated_at:now }
    if (extra.work_update) patch.work_update = extra.work_update
    if (extra.hold_reason) patch.hold_reason = extra.hold_reason
    if (newStatus === 'travelling')  patch.trip_started_at = now
    if (newStatus === 'arrived')     patch.arrived_at      = now
    if (newStatus === 'in_progress' && !wo.work_started_at) patch.work_started_at = now
    if (newStatus === 'completed')   patch.completed_at    = now

    const { data, error } = await supabase.from('work_orders').update(patch).eq('id', id).select('id')
    if (hasErr(error) || !data?.length) {
      setSaving(false)
      return flash(hasErr(error) ? error.message : 'You are not allowed to update this work order', 'error')
    }
    await logUpdate('status_change',
      `Status changed to ${newStatus}${extra.work_update ? ': ' + extra.work_update : ''}${extra.hold_reason && extra.hold_reason !== extra.work_update ? ' — Hold reason: ' + extra.hold_reason : ''}`,
      photos.length ? photos : null)
    setAction(null); setNote(''); setHoldReason(''); setWorkUpdate(''); setPhotos([])
    await fetchWO()
    setSaving(false)
  }

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    await logUpdate('note', note.trim())
    setNote(''); await fetchWO(); setSaving(false)
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    try {
      const imgs = await Promise.all(files.map(f => compressImage(f)))
      const tooBig = imgs.find(x => x.length > 4_000_000)
      if (tooBig) flash('One file was too large and was skipped (videos must be short)', 'error')
      setPhotos(prev => [...prev, ...imgs.filter(x => x.length <= 4_000_000)])
    } catch { flash('Could not read that photo', 'error') }
  }

  // ── Signature canvas (scaled so drawing lines up on any screen width) ──
  function pos(e) {
    const c = sigCanvas.current; const r = c.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x:(p.clientX - r.left) * (c.width / r.width), y:(p.clientY - r.top) * (c.height / r.height) }
  }
  function startDraw(e) {
    setIsDrawing(true)
    const ctx = sigCanvas.current.getContext('2d'); const { x, y } = pos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  function draw(e) {
    if (!isDrawing) return
    if (e.cancelable) e.preventDefault()
    const ctx = sigCanvas.current.getContext('2d'); const { x, y } = pos(e)
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#111111'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.lineTo(x, y); ctx.stroke(); setHasSig(true)
  }
  function endDraw() { setIsDrawing(false) }
  function clearSig() {
    const c = sigCanvas.current; const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); setHasSig(false)
  }
  useEffect(() => { if (action === 'signature' && sigCanvas.current) clearSig() }, [action])

  async function submitSignature() {
    if (!hasSig || !signedBy.trim()) return
    setSaving(true)
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('work_orders').update({
      signature_url: sigCanvas.current.toDataURL('image/png'), signed_by: signedBy.trim(),
      signed_at: now, status:'closed',
    }).eq('id', id).select('id')
    if (hasErr(error) || !data?.length) { setSaving(false); return flash(hasErr(error) ? error.message : 'Not allowed', 'error') }
    await logUpdate('signature', `Work order closed. Signed by ${signedBy.trim()}`)
    setAction(null); await fetchWO(); setSaving(false)
  }

  // ── Assignment (staff) ──
  function openAssign() {
    setAssign({
      assigned_to: wo.assigned_to || '', vendor_id: wo.vendor_id || '', priority: wo.priority || 'P3',
      scheduled_date: wo.scheduled_date || '', cost: wo.cost ?? '',
    })
    setAction('assign')
  }
  async function saveAssign() {
    setSaving(true)
    const patch = {
      assigned_to: assign.assigned_to || null, vendor_id: assign.vendor_id || null, priority: assign.priority,
      scheduled_date: assign.scheduled_date || null, cost: assign.cost === '' ? null : Number(assign.cost),
    }
    if (!assign.vendor_id && wo.vendor_id) patch.vendor_name = null
    const { error } = await supabase.from('work_orders').update(patch).eq('id', id)
    if (hasErr(error)) { setSaving(false); return flash(error.message, 'error') }
    const changes = []
    if ((patch.assigned_to || null) !== (wo.assigned_to || null)) changes.push(`technician → ${techs.find(t => t.id === patch.assigned_to)?.full_name || 'none'}`)
    if ((patch.vendor_id || null) !== (wo.vendor_id || null)) changes.push(`vendor → ${vendors.find(v => v.id === patch.vendor_id)?.name || 'none'}`)
    if (patch.priority !== wo.priority) changes.push(`priority → ${patch.priority}`)
    if (changes.length) await logUpdate('note', 'Updated: ' + changes.join(', '))
    setAction(null); await fetchWO(); setSaving(false); flash('✅ Saved')
  }

  // ── Checklist ──
  async function toggleItem(item, patch) {
    const now = new Date().toISOString()
    const full = { ...patch }
    if ('is_done' in patch) { full.done_by = patch.is_done ? profile.id : null; full.done_at = patch.is_done ? now : null }
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, ...full } : c))
    const { data, error } = await supabase.from('wo_checklist_items').update(full).eq('id', item.id).select('id')
    if (hasErr(error) || !data?.length) { flash(hasErr(error) ? error.message : 'You cannot edit this checklist', 'error'); fetchWO() }
  }
  async function addItems(labels) {
    if (!labels.length) return
    const { error } = await supabase.rpc('add_checklist', { p_wo:id, p_items:labels })
    if (hasErr(error)) return flash(error.message, 'error')
    setNewItem(''); fetchWO()
  }
  async function removeItem(item) {
    const { error } = await supabase.from('wo_checklist_items').delete().eq('id', item.id)
    if (hasErr(error)) return flash(error.message, 'error')
    fetchWO()
  }

  // ── Quotes & invoices ──
  async function submitQuote() {
    const amount = Number(quoteForm.amount)
    if (!amount || amount < 0) return flash('Enter the amount', 'error')
    setSaving(true)
    try {
      let file = { path:null, name:null }
      if (quoteForm.file) file = await uploadWoFile(id, quoteForm.file)
      const { error } = await supabase.from('vendor_quotes').insert({
        work_order_id:id, vendor_id: isVendor ? profile.vendor_id : (wo.vendor_id || null),
        kind: quoteForm.kind, amount, description: quoteForm.description || null,
        file_path: file.path, file_name: file.name, status:'submitted',
      })
      if (hasErr(error)) throw new Error(error.message)
      await logUpdate('note', `${quoteForm.kind === 'invoice' ? 'Invoice' : 'Quote'} submitted: ${AED(amount)}`)
      setQuoteForm({ kind:'quote', amount:'', description:'', file:null }); setAction(null)
      flash('✅ Sent for approval'); fetchWO()
    } catch (e) { flash(e.message || 'Could not submit', 'error') }
    setSaving(false)
  }
  async function reviewQuote(q, status) {
    const reason = status === 'rejected' ? window.prompt('Reason for rejecting (the vendor will see this):', '') : ''
    if (status === 'rejected' && reason === null) return
    const { error } = await supabase.from('vendor_quotes').update({ status, review_note: reason || null }).eq('id', q.id)
    if (hasErr(error)) return flash(error.message, 'error')
    await logUpdate('note', `${q.kind === 'invoice' ? 'Invoice' : 'Quote'} ${AED(q.amount)} ${status}${reason ? ': ' + reason : ''}`)
    fetchWO()
  }
  // ── Parts used ──
  async function openPartForm() {
    if (partsList.length === 0) {
      const { data } = await supabase.from('parts').select('id,name,unit,unit_cost,part_no').eq('is_active', true).order('name')
      setPartsList(data || [])
    }
    setPartForm({ part_id:'', qty:1, from: wo.store_id || 'central' })
  }
  async function savePartUse() {
    if (!partForm.part_id || !(Number(partForm.qty) > 0)) return flash('Choose a part and quantity', 'error')
    setSaving(true)
    const part = partsList.find(p => p.id === partForm.part_id)
    const { error } = await supabase.from('stock_movements').insert({
      part_id: partForm.part_id, qty_change: -Math.abs(Number(partForm.qty)), kind:'use',
      store_id: partForm.from === 'central' ? null : partForm.from, work_order_id: id,
    })
    if (hasErr(error)) { setSaving(false); return flash(error.message, 'error') }
    await logUpdate('note', `Part used: ${partForm.qty} × ${part?.name || 'part'}`)
    setPartForm(null); setSaving(false); fetchWO()
  }

  async function openFile(path) { try { await openWoFile(path) } catch (e) { flash(e.message, 'error') } }

  if (loading) return <div style={{ color:'var(--text3)', padding:40, textAlign:'center' }}>Loading work order...</div>
  if (!wo) return <div style={{ color:'var(--red)', padding:40, textAlign:'center' }}>Work order not found, or you don't have access to it.</div>

  const visibleSteps = STATUS_STEPS.filter(s => s.key !== 'on_hold' || wo.status === 'on_hold')
  const stepIdx = Math.max(0, visibleSteps.findIndex(s => s.key === wo.status))
  const isClosed = wo.status === 'closed'
  const canAct = isStaff || wo.assigned_to === profile?.id || (isVendor && wo.vendor_id && wo.vendor_id === profile?.vendor_id)
  const canEditChecklist = canAct
  const doneCount = checklist.filter(c => c.is_done).length
  const checklistIncomplete = checklist.length > 0 && doneCount < checklist.length
  const canQuote = isStaff || (isVendor && wo.vendor_id === profile?.vendor_id)

  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:16 }
  const inp  = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }
  const lbl  = { color:'var(--text2)', fontSize:12, display:'block', marginBottom:5 }
  const btn  = (bg, color = 'white', border = 'none') => ({ background:bg, color, border, borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' })
  const ghost = { background:'transparent', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }

  const PhotoPicker = (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:'inline-flex', alignItems:'center', gap:8, background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'var(--blue)', fontSize:13 }}>
        📸 Add photos
        <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoUpload} style={{ display:'none' }}/>
      </label>
      {photos.length > 0 && (
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position:'relative' }}>
              <img src={p} alt="" style={{ height:70, borderRadius:8, objectFit:'cover' }}/>
              <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                style={{ position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:'50%', background:'var(--red)', color:'white', border:'none', cursor:'pointer', fontSize:10 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth:900, color:'var(--text)' }}>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, cursor:'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth:'100%', maxHeight:'100%', borderRadius:8 }}/>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <button onClick={() => navigate('/work-orders')} style={{ background:'transparent', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0 }}>← Work Orders</button>
        <span style={{ color:'var(--border2)' }}>/</span>
        <span style={{ fontSize:13, fontWeight:500 }}>{wo.title}</span>
        <Link to={`/work-orders/${id}/report`} style={{ marginLeft:'auto', fontSize:12, color:'var(--blue)', fontWeight:600 }}>📄 PDF report</Link>
        {role === 'admin' && <Link to={`/audit?record=${id}`} style={{ fontSize:12, color:'var(--green)' }}>Full change history ↗</Link>}
      </div>

      {msg && <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:12, fontSize:13, background: msg.type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>}

      {/* Header */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:240 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
              <span style={{ background:(P_COLORS[wo.priority] || '#888') + '22', color:P_COLORS[wo.priority], fontSize:12, padding:'3px 10px', borderRadius:6, fontWeight:600 }}>{wo.priority}</span>
              {wo.wo_type === 'ppm' && <span style={{ background:'var(--amber-bg)', color:'var(--amber)', fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:600 }}>PPM</span>}
              <span style={{ color:'var(--text3)', fontSize:12 }}>#{id.slice(0, 8).toUpperCase()}</span>
            </div>
            <h1 style={{ fontSize:18, fontWeight:600, margin:'0 0 6px' }}>{wo.title}</h1>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', fontSize:13, color:'var(--text2)' }}>
              {wo.stores && <span>📍 {wo.stores.name}</span>}
              {wo.assets && <Link to={`/a/${wo.assets.id}`} style={{ color:'var(--text2)' }}>🔧 {wo.assets.name}</Link>}
              {wo.stores?.manager_name && <span>👤 {wo.stores.manager_name}</span>}
              {wo.stores?.phone && <a href={`tel:${wo.stores.phone}`} style={{ color:'var(--blue)', textDecoration:'none' }}>📞 {wo.stores.phone}</a>}
            </div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', fontSize:12, color:'var(--text3)', marginTop:8 }}>
              <span>👷 {wo.assigned_to === profile?.id ? 'You' : techs.find(t => t.id === wo.assigned_to)?.full_name || (wo.assigned_to ? 'Technician assigned' : 'No technician')}</span>
              {wo.vendor_name && <span>🧰 {wo.vendor_name}</span>}
              {wo.scheduled_date && <span>📅 {new Date(wo.scheduled_date).toLocaleDateString('en-GB')}</span>}
              {wo.cost != null && !isVendor && <span>💰 {AED(wo.cost)}</span>}
            </div>
          </div>
          <div style={{ minWidth:160 }}>
            <SLABadge priority={wo.priority} createdAt={wo.created_at} status={wo.status}/>
            {isStaff && !isClosed && <button onClick={openAssign} style={{ ...ghost, marginTop:10, width:'100%', padding:'7px 10px' }}>✏️ Assign / edit</button>}
          </div>
        </div>
        {wo.description && <div style={{ color:'var(--text2)', fontSize:13, marginTop:12, padding:'10px 12px', background:'var(--bg)', borderRadius:8 }}>{wo.description}</div>}
      </div>

      {/* Assign panel */}
      {action === 'assign' && (
        <div style={{ ...card, borderColor:'var(--blue)' }}>
          <h3 style={{ fontSize:15, margin:'0 0 14px', color:'var(--blue)' }}>Assign & edit</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 }}>
            <div><label style={lbl}>Technician</label>
              <select value={assign.assigned_to} onChange={e => setAssign({ ...assign, assigned_to:e.target.value })} style={inp}>
                <option value="">— none —</option>{techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select></div>
            <div><label style={lbl}>Vendor</label>
              <select value={assign.vendor_id} onChange={e => setAssign({ ...assign, vendor_id:e.target.value })} style={inp}>
                <option value="">— in-house —</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            <div><label style={lbl}>Priority</label>
              <select value={assign.priority} onChange={e => setAssign({ ...assign, priority:e.target.value })} style={inp}>
                {['P1','P2','P3','P4'].map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div><label style={lbl}>Scheduled date</label><input type="date" value={assign.scheduled_date || ''} onChange={e => setAssign({ ...assign, scheduled_date:e.target.value })} style={inp}/></div>
            <div><label style={lbl}>Cost (AED)</label><input type="number" min="0" step="0.01" value={assign.cost} onChange={e => setAssign({ ...assign, cost:e.target.value })} style={inp}/></div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:14 }}>
            <button onClick={saveAssign} disabled={saving} style={btn('var(--blue)')}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setAction(null)} style={ghost}>Cancel</button>
          </div>
        </div>
      )}

      {/* Status stepper + actions */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:6 }}>
          {visibleSteps.map((step, i) => {
            const done = stepIdx >= i; const active = wo.status === step.key
            return (
              <div key={step.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
                  background: active ? 'var(--green)' : done ? 'var(--green-bg)' : 'var(--bg3)',
                  border:`2px solid ${done ? 'var(--green)' : 'var(--border2)'}`, color: active ? 'white' : done ? 'var(--green)' : 'var(--text3)' }}>
                  {done && !active ? '✓' : step.icon}
                </div>
                <span style={{ color: active ? 'var(--text)' : 'var(--text3)', fontSize:12, fontWeight: active ? 600 : 400 }}>{step.label}</span>
                {i < visibleSteps.length - 1 && <div style={{ width:18, height:1, background: done ? 'var(--green)' : 'var(--border2)' }}/>}
              </div>
            )
          })}
        </div>

        {!isClosed && canAct && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {wo.status === 'open' && <button onClick={() => updateStatus('travelling')} disabled={saving} style={btn('var(--blue)')}>🚗 Start Trip</button>}
            {wo.status === 'open' && <button onClick={() => updateStatus('in_progress')} disabled={saving} style={ghost}>Already on site → Start Work</button>}
            {wo.status === 'travelling' && <button onClick={() => updateStatus('arrived')} disabled={saving} style={btn('var(--amber)')}>📍 I've Arrived</button>}
            {wo.status === 'arrived' && <button onClick={() => updateStatus('in_progress')} disabled={saving} style={btn('var(--green)')}>🔧 Start Work</button>}
            {wo.status === 'in_progress' && <>
              <button onClick={() => setAction('hold')} style={btn('var(--amber-bg)', 'var(--amber)', '1px solid var(--amber)')}>⏸ Put On Hold</button>
              <button onClick={() => setAction('complete')} style={btn('var(--green)')}>✅ Work Complete</button>
            </>}
            {wo.status === 'on_hold' && <button onClick={() => updateStatus('in_progress')} disabled={saving} style={btn('var(--green)')}>↩ Resume Work</button>}
            {wo.status === 'completed' && <button onClick={() => setAction('signature')} style={btn('var(--purple)')}>✍️ Get Manager Signature to Close</button>}
            {wo.status === 'completed' && isStaff && <button onClick={() => updateStatus('in_progress')} disabled={saving} style={ghost}>↩ Re-open (not fixed)</button>}
          </div>
        )}
        {!isClosed && !canAct && <div style={{ fontSize:13, color:'var(--text3)' }}>Only the assigned technician, vendor or operations team can update this job.</div>}

        {isClosed && (
          <div style={{ background:'var(--green-bg)', border:'1px solid var(--green)', borderRadius:8, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:20 }}>✅</span>
            <div>
              <div style={{ color:'var(--green)', fontSize:13, fontWeight:600 }}>Closed{wo.signed_by ? ' & Signed' : ''}</div>
              {wo.signed_by && <div style={{ color:'var(--text3)', fontSize:12 }}>Signed by {wo.signed_by}{wo.signed_at ? ' · ' + new Date(wo.signed_at).toLocaleString('en-GB') : ''}</div>}
            </div>
            {wo.signature_url && <img src={wo.signature_url} alt="Signature" style={{ height:44, marginLeft:'auto', borderRadius:4, background:'white', padding:4 }}/>}
          </div>
        )}
      </div>

      {action === 'hold' && (
        <div style={{ ...card, borderColor:'var(--amber)' }}>
          <h3 style={{ color:'var(--amber)', fontSize:15, margin:'0 0 14px' }}>⏸ Put On Hold</h3>
          <label style={lbl}>Reason for hold *</label>
          <textarea style={{ ...inp, height:80, resize:'vertical', marginBottom:12 }} value={holdReason} onChange={e => setHoldReason(e.target.value)} placeholder="e.g. Waiting for spare part, need access to area…"/>
          {PhotoPicker}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => updateStatus('on_hold', { hold_reason:holdReason.trim(), work_update:holdReason.trim() })} disabled={saving || !holdReason.trim()} style={{ ...btn('var(--amber)'), opacity: saving || !holdReason.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Confirm Hold'}</button>
            <button onClick={() => { setAction(null); setPhotos([]) }} style={ghost}>Cancel</button>
          </div>
        </div>
      )}

      {action === 'complete' && (
        <div style={{ ...card, borderColor:'var(--green)' }}>
          <h3 style={{ color:'var(--green)', fontSize:15, margin:'0 0 14px' }}>✅ Work Complete</h3>
          {checklistIncomplete && (
            <div style={{ background:'var(--amber-bg)', color:'var(--amber)', borderRadius:8, padding:'8px 12px', fontSize:13, marginBottom:12 }}>
              ⚠️ Checklist not finished ({doneCount}/{checklist.length}). Please tick the remaining items below, or explain in the summary why they were skipped.
            </div>
          )}
          <label style={lbl}>Work summary *</label>
          <textarea style={{ ...inp, height:100, resize:'vertical', marginBottom:12 }} value={workUpdate} onChange={e => setWorkUpdate(e.target.value)} placeholder="What was done, parts used, observations…"/>
          {PhotoPicker}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => updateStatus('completed', { work_update:workUpdate.trim() })} disabled={saving || !workUpdate.trim()} style={{ ...btn('var(--green)'), opacity: saving || !workUpdate.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Mark as Complete'}</button>
            <button onClick={() => { setAction(null); setPhotos([]) }} style={ghost}>Cancel</button>
          </div>
        </div>
      )}

      {action === 'signature' && (
        <div style={{ ...card, borderColor:'var(--purple)' }}>
          <h3 style={{ color:'var(--purple)', fontSize:15, margin:'0 0 6px' }}>✍️ Manager Signature Required</h3>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'0 0 14px' }}>The store manager signs to confirm the job is done.</p>
          <label style={lbl}>Manager name *</label>
          <input style={{ ...inp, maxWidth:300, marginBottom:12 }} value={signedBy} onChange={e => setSignedBy(e.target.value)} placeholder={wo.stores?.manager_name || 'Manager name'}/>
          <label style={lbl}>Signature (draw below) *</label>
          <div style={{ background:'#fff', border:'1px solid var(--border2)', borderRadius:8, overflow:'hidden', touchAction:'none' }}>
            <canvas ref={sigCanvas} width={600} height={180} style={{ display:'block', width:'100%', height:180, cursor:'crosshair' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', margin:'6px 0 12px' }}>
            <span style={{ color:'var(--text3)', fontSize:12 }}>Sign with finger or mouse</span>
            <button onClick={clearSig} style={{ background:'transparent', border:'none', color:'var(--text3)', fontSize:12, cursor:'pointer', textDecoration:'underline' }}>Clear</button>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={submitSignature} disabled={saving || !hasSig || !signedBy.trim()} style={{ ...btn('var(--purple)'), opacity: saving || !hasSig || !signedBy.trim() ? 0.5 : 1 }}>{saving ? 'Closing…' : '🔒 Close Work Order'}</button>
            <button onClick={() => setAction(null)} style={ghost}>Cancel</button>
          </div>
        </div>
      )}

      {/* Checklist */}
      {(checklist.length > 0 || isStaff) && (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:10, flexWrap:'wrap' }}>
            <h2 style={{ fontSize:15, fontWeight:600, margin:0 }}>Checklist {checklist.length > 0 && <span style={{ color:'var(--text3)', fontWeight:400 }}>· {doneCount}/{checklist.length}</span>}</h2>
            {isStaff && !isClosed && (
              <select value="" onChange={e => { const t = CHECKLIST_TEMPLATES[e.target.value]; if (t) addItems(t) }} style={{ ...inp, width:'auto', padding:'6px 10px' }}>
                <option value="">+ Add from template…</option>
                {Object.keys(CHECKLIST_TEMPLATES).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            )}
          </div>
          {checklist.length > 0 && (
            <div style={{ height:6, background:'var(--bg3)', borderRadius:3, marginBottom:12, overflow:'hidden' }}>
              <div style={{ width:`${(doneCount / checklist.length) * 100}%`, height:'100%', background:'var(--green)', transition:'width .2s' }}/>
            </div>
          )}
          {checklist.length === 0 && <div style={{ fontSize:13, color:'var(--text3)' }}>No checklist on this job.</div>}
          <div style={{ display:'grid', gap:6 }}>
            {checklist.map(c => (
              <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background: c.is_done ? 'var(--green-bg)' : 'var(--bg)', flexWrap:'wrap' }}>
                <input type="checkbox" checked={c.is_done} disabled={!canEditChecklist || isClosed} onChange={e => toggleItem(c, { is_done:e.target.checked, result: e.target.checked ? (c.result || 'ok') : null })}
                  style={{ width:18, height:18, accentColor:'var(--green)' }}/>
                <span style={{ flex:1, minWidth:160, fontSize:13, textDecoration: c.is_done && c.result !== 'issue' ? 'line-through' : 'none', color: c.is_done ? 'var(--text2)' : 'var(--text)' }}>{c.label}</span>
                {canEditChecklist && !isClosed && (
                  <div style={{ display:'flex', gap:4 }}>
                    {[['ok','OK','var(--green)'], ['issue','Issue','var(--red)'], ['na','N/A','var(--text3)']].map(([k, l, col]) => (
                      <button key={k} onClick={() => toggleItem(c, { result:k, is_done:true })}
                        style={{ fontSize:11, padding:'3px 8px', borderRadius:6, cursor:'pointer', border:`1px solid ${col}`, background: c.result === k ? col : 'transparent', color: c.result === k ? 'white' : col }}>{l}</button>
                    ))}
                  </div>
                )}
                {(!canEditChecklist || isClosed) && c.result && <span style={{ fontSize:11, fontWeight:600, color: c.result === 'issue' ? 'var(--red)' : 'var(--text3)' }}>{c.result.toUpperCase()}</span>}
                {isStaff && !isClosed && <button onClick={() => removeItem(c)} title="Remove" style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer' }}>✕</button>}
              </div>
            ))}
          </div>
          {isStaff && !isClosed && (
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add a checklist item…" style={inp}
                onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) addItems([newItem.trim()]) }}/>
              <button onClick={() => newItem.trim() && addItems([newItem.trim()])} style={ghost}>Add</button>
            </div>
          )}
        </div>
      )}

      {/* Parts used */}
      {!isVendor && (partsUsed.length > 0 || (canAct && !isClosed)) && (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:10, flexWrap:'wrap' }}>
            <h2 style={{ fontSize:15, fontWeight:600, margin:0 }}>Parts used {Number(wo.parts_cost) > 0 && <span style={{ color:'var(--text3)', fontWeight:400 }}>· {AED(wo.parts_cost)}</span>}</h2>
            {canAct && !isClosed && !partForm && <button onClick={openPartForm} style={{ ...ghost, padding:'6px 12px' }}>+ Add part used</button>}
          </div>
          {partForm && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:10, background:'var(--bg)', borderRadius:10, padding:12, marginBottom:10 }}>
              <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>Part</label>
                <select value={partForm.part_id} onChange={e => setPartForm({ ...partForm, part_id:e.target.value })} style={inp}>
                  <option value="">Select part…</option>
                  {partsList.map(p => <option key={p.id} value={p.id}>{p.name}{p.part_no ? ` (#${p.part_no})` : ''}</option>)}
                </select>
                {partsList.length === 0 && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>No parts in the catalogue yet — add them on the Spare Parts page.</div>}
              </div>
              <div><label style={lbl}>Quantity</label><input type="number" min="0" step="any" value={partForm.qty} onChange={e => setPartForm({ ...partForm, qty:e.target.value })} style={inp}/></div>
              <div><label style={lbl}>Taken from</label>
                <select value={partForm.from} onChange={e => setPartForm({ ...partForm, from:e.target.value })} style={inp}>
                  {wo.store_id && <option value={wo.store_id}>{wo.stores?.name || 'This store'}</option>}
                  <option value="central">Central store / van</option>
                </select></div>
              <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                <button onClick={savePartUse} disabled={saving} style={btn('var(--green)')}>Save</button>
                <button onClick={() => setPartForm(null)} style={ghost}>Cancel</button>
              </div>
            </div>
          )}
          {partsUsed.length === 0 && !partForm && <div style={{ fontSize:13, color:'var(--text3)' }}>No parts recorded.</div>}
          {partsUsed.map(m => (
            <div key={m.id} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'7px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
              <span>{Math.abs(m.qty_change)} {m.parts?.unit || ''} × {m.parts?.name || 'Part'}</span>
              <span style={{ color:'var(--text3)' }}>{AED(Math.abs(m.qty_change) * Number(m.unit_cost || 0))}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quotes & invoices */}
      {(quotes.length > 0 || canQuote) && (wo.vendor_id || quotes.length > 0 || isStaff) && (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:10, flexWrap:'wrap' }}>
            <h2 style={{ fontSize:15, fontWeight:600, margin:0 }}>Quotes & invoices</h2>
            {canQuote && action !== 'quote' && <button onClick={() => setAction('quote')} style={{ ...ghost, padding:'6px 12px' }}>+ Submit quote / invoice</button>}
          </div>
          {action === 'quote' && (
            <div style={{ background:'var(--bg)', borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:10 }}>
                <div><label style={lbl}>Type</label>
                  <select value={quoteForm.kind} onChange={e => setQuoteForm({ ...quoteForm, kind:e.target.value })} style={inp}>
                    <option value="quote">Quote (before work)</option><option value="invoice">Invoice (after work)</option>
                  </select></div>
                <div><label style={lbl}>Amount (AED) *</label><input type="number" min="0" step="0.01" value={quoteForm.amount} onChange={e => setQuoteForm({ ...quoteForm, amount:e.target.value })} style={inp}/></div>
                <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>Description</label><input value={quoteForm.description} onChange={e => setQuoteForm({ ...quoteForm, description:e.target.value })} placeholder="Parts and labour…" style={inp}/></div>
                <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>Attach PDF or photo (max 10 MB)</label>
                  <input type="file" accept="application/pdf,image/*" onChange={e => setQuoteForm({ ...quoteForm, file:e.target.files?.[0] || null })} style={{ fontSize:12, color:'var(--text2)' }}/></div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                <button onClick={submitQuote} disabled={saving} style={btn('var(--green)')}>{saving ? 'Sending…' : 'Send for approval'}</button>
                <button onClick={() => setAction(null)} style={ghost}>Cancel</button>
              </div>
            </div>
          )}
          {quotes.length === 0 && action !== 'quote' && <div style={{ fontSize:13, color:'var(--text3)' }}>No quotes or invoices yet.</div>}
          <div style={{ display:'grid', gap:8 }}>
            {quotes.map(q => {
              const s = QUOTE_STATUS[q.status] || QUOTE_STATUS.submitted
              return (
                <div key={q.id} style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', padding:'10px 12px', borderRadius:8, background:'var(--bg)' }}>
                  <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'var(--text3)', width:58 }}>{q.kind}</span>
                  <span style={{ fontWeight:700 }}>{AED(q.amount)}</span>
                  <span style={{ fontSize:12, color:'var(--text2)', flex:1, minWidth:120 }}>{q.description}{q.review_note ? ` — ${q.review_note}` : ''}</span>
                  {q.file_path && <button onClick={() => openFile(q.file_path)} style={{ ...ghost, padding:'4px 10px', fontSize:12 }}>📎 {q.file_name || 'File'}</button>}
                  <span style={{ fontSize:11, fontWeight:600, color:s.color, background:s.bg, borderRadius:20, padding:'3px 10px' }}>{s.label}</span>
                  {isStaff && q.status === 'submitted' && <>
                    <button onClick={() => reviewQuote(q, 'approved')} style={{ ...btn('var(--green)'), padding:'5px 12px' }}>Approve</button>
                    <button onClick={() => reviewQuote(q, 'rejected')} style={{ ...ghost, padding:'5px 12px', color:'var(--red)' }}>Reject</button>
                  </>}
                  {isStaff && q.status === 'approved' && q.kind === 'invoice' && <button onClick={() => reviewQuote(q, 'paid')} style={{ ...ghost, padding:'5px 12px' }}>Mark paid</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Photos on the job */}
      {Array.isArray(wo.photos) && wo.photos.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize:15, fontWeight:600, margin:'0 0 10px' }}>Photos</h2>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {wo.photos.map((p, i) => <img key={i} src={p} alt="" onClick={() => setLightbox(p)} style={{ height:90, borderRadius:8, objectFit:'cover', cursor:'pointer' }}/>)}
          </div>
        </div>
      )}

      {/* Activity log */}
      <div style={card}>
        <h2 style={{ fontSize:15, fontWeight:600, margin:'0 0 14px' }}>Activity Log</h2>
        {updates.length === 0 ? <div style={{ color:'var(--text3)', fontSize:13 }}>No activity yet</div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {updates.map(u => (
              <div key={u.id} style={{ display:'flex', gap:12 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: u.type === 'signature' ? 'var(--purple)' : u.type === 'note' ? 'var(--blue)' : 'var(--green)', marginTop:6, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3, gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>{u.profiles?.full_name || (u.user_id === profile?.id ? profile.full_name : 'Team member')}</span>
                    <span style={{ color:'var(--text3)', fontSize:11 }}>{new Date(u.created_at).toLocaleString('en-GB')}</span>
                  </div>
                  <div style={{ color:'var(--text2)', fontSize:13 }}>{u.content}</div>
                  {Array.isArray(u.photos) && u.photos.length > 0 && (
                    <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                      {u.photos.map((p, i) => <img key={i} src={p} alt="" onClick={() => setLightbox(p)} style={{ height:60, borderRadius:6, objectFit:'cover', cursor:'pointer' }}/>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!isClosed && (
          <div style={{ marginTop:16, display:'flex', gap:10 }}>
            <input style={{ ...inp, flex:1 }} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" onKeyDown={e => e.key === 'Enter' && addNote()}/>
            <button onClick={addNote} disabled={!note.trim() || saving} style={{ ...btn('var(--green)'), whiteSpace:'nowrap' }}>Add Note</button>
          </div>
        )}
      </div>
    </div>
  )
}
