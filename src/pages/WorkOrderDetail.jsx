import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'

const P_COLORS = { P1:'#f85149', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }

const STATUS_STEPS = [
  { key:'open',        label:'Open',        icon:'◯' },
  { key:'travelling',  label:'On the Way',  icon:'🚗' },
  { key:'arrived',     label:'Arrived',     icon:'📍' },
  { key:'in_progress', label:'In Progress', icon:'🔧' },
  { key:'on_hold',     label:'On Hold',     icon:'⏸' },
  { key:'completed',   label:'Completed',   icon:'✅' },
  { key:'closed',      label:'Closed',      icon:'🔒' },
]

export default function WorkOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const sigCanvas = useRef(null)
  const [wo, setWo]           = useState(null)
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [note, setNote]       = useState('')
  const [holdReason, setHoldReason] = useState('')
  const [workUpdate, setWorkUpdate] = useState('')
  const [photos, setPhotos]   = useState([])
  const [action, setAction]   = useState(null) // 'hold' | 'complete' | 'signature'
  const [saving, setSaving]   = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSig, setHasSig]   = useState(false)
  const [signedBy, setSignedBy] = useState('')

  useEffect(() => { fetchWO() }, [id])

  async function fetchWO() {
    setLoading(true)
    const [woRes, updRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(*),assets(name),profiles(full_name)').eq('id', id).single(),
      supabase.from('wo_updates').select('*,profiles(full_name)').eq('work_order_id', id).order('created_at'),
    ])
    setWo(woRes.data)
    setUpdates(updRes.data || [])
    setLoading(false)
  }

  async function updateStatus(newStatus, extra = {}) {
    setSaving(true)
    const now = new Date().toISOString()
    const patch = { status: newStatus, updated_at: now, ...extra }
    if (newStatus === 'travelling')  patch.trip_started_at = now
    if (newStatus === 'arrived')     patch.arrived_at = now
    if (newStatus === 'in_progress') patch.work_started_at = now
    if (newStatus === 'completed')   patch.completed_at = now
    if (newStatus === 'closed')      patch.closed_at = now

    await supabase.from('work_orders').update(patch).eq('id', id)
    await supabase.from('wo_updates').insert({
      work_order_id: id, user_id: profile.id,
      type: 'status_change',
      content: `Status changed to ${newStatus}${extra.work_update ? ': ' + extra.work_update : ''}${extra.hold_reason ? ' — Hold reason: ' + extra.hold_reason : ''}`,
      photos: photos.length > 0 ? photos : null,
    })
    setAction(null); setNote(''); setHoldReason(''); setWorkUpdate(''); setPhotos([])
    fetchWO()
    setSaving(false)
  }

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    await supabase.from('wo_updates').insert({
      work_order_id: id, user_id: profile.id,
      type: 'note', content: note,
    })
    setNote(''); fetchWO(); setSaving(false)
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files)
    const base64s = await Promise.all(files.map(f => new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.onerror = rej
      r.readAsDataURL(f)
    })))
    setPhotos(prev => [...prev, ...base64s])
  }

  // Signature canvas
  function startDraw(e) {
    setIsDrawing(true)
    const ctx = sigCanvas.current.getContext('2d')
    const rect = sigCanvas.current.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  function draw(e) {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = sigCanvas.current.getContext('2d')
    const rect = sigCanvas.current.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.lineWidth = 2; ctx.strokeStyle = '#e6edf3'; ctx.lineCap = 'round'
    ctx.lineTo(x, y); ctx.stroke()
    setHasSig(true)
  }
  function endDraw() { setIsDrawing(false) }
  function clearSig() {
    const ctx = sigCanvas.current.getContext('2d')
    ctx.clearRect(0, 0, sigCanvas.current.width, sigCanvas.current.height)
    setHasSig(false)
  }

  async function submitSignature() {
    if (!hasSig || !signedBy.trim()) return
    setSaving(true)
    const sigUrl = sigCanvas.current.toDataURL()
    await supabase.from('work_orders').update({
      signature_url: sigUrl, signed_by: signedBy,
      signed_at: new Date().toISOString(), status: 'closed',
      closed_at: new Date().toISOString(),
    }).eq('id', id)
    await supabase.from('wo_updates').insert({
      work_order_id: id, user_id: profile.id,
      type: 'signature',
      content: `Work order closed. Signed by ${signedBy}`,
    })
    setAction(null); fetchWO(); setSaving(false)
  }

  function getStepIndex(status) {
    const idx = STATUS_STEPS.findIndex(s => s.key === status)
    return idx === -1 ? 0 : idx
  }

  if (loading) return <div style={{ color:'#6b7280', padding:40, textAlign:'center', fontFamily:"'DM Sans', sans-serif" }}>Loading work order...</div>
  if (!wo) return <div style={{ color:'#f85149', padding:40, textAlign:'center', fontFamily:"'DM Sans', sans-serif" }}>Work order not found</div>

  const stepIdx = getStepIndex(wo.status)
  const isClosed = wo.status === 'closed'
  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'10px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", maxWidth:900 }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
        <button onClick={() => navigate('/work-orders')} style={{ background:'transparent', border:'none', color:'#6b7280', cursor:'pointer', fontSize:13, padding:0 }}>
          ← Work Orders
        </button>
        <span style={{ color:'#30363d' }}>/</span>
        <span style={{ color:'#e6edf3', fontSize:13, fontWeight:500 }}>{wo.title}</span>
      </div>

      {/* Header */}
      <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <span style={{ background: P_COLORS[wo.priority]+'22', color: P_COLORS[wo.priority], fontSize:12, padding:'3px 10px', borderRadius:6, fontWeight:600 }}>{wo.priority}</span>
              <span style={{ color:'#6b7280', fontSize:12 }}>#{id.slice(0,8).toUpperCase()}</span>
            </div>
            <h1 style={{ color:'#e6edf3', fontSize:18, fontWeight:600, margin:'0 0 6px' }}>{wo.title}</h1>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {wo.stores && <span style={{ color:'#8b949e', fontSize:13 }}>📍 {wo.stores.name}</span>}
              {wo.stores?.manager_name && <span style={{ color:'#8b949e', fontSize:13 }}>👤 {wo.stores.manager_name}</span>}
              {wo.stores?.phone && <a href={`tel:${wo.stores.phone}`} style={{ color:'#378ADD', fontSize:13, textDecoration:'none' }}>📞 {wo.stores.phone}</a>}
            </div>
          </div>
          <div style={{ minWidth:160 }}>
            <SLABadge priority={wo.priority} createdAt={wo.created_at} status={wo.status}/>
          </div>
        </div>
        {wo.description && <div style={{ color:'#8b949e', fontSize:13, marginTop:8, padding:'10px 12px', background:'#0d1117', borderRadius:8 }}>{wo.description}</div>}
      </div>

      {/* Status stepper */}
      <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
          {STATUS_STEPS.filter(s => !['on_hold'].includes(s.key) || wo.status === 'on_hold').map((step, i) => {
            const done = getStepIndex(wo.status) >= i
            const active = wo.status === step.key
            return (
              <div key={step.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{
                  width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14,
                  background: active ? '#1D9E75' : done ? '#1d2f26' : '#21262d',
                  border: active ? '2px solid #1D9E75' : done ? '2px solid #1D9E75' : '2px solid #30363d',
                  color: done ? '#1D9E75' : '#6b7280',
                }}>
                  {done ? '✓' : step.icon}
                </div>
                <span style={{ color: active ? '#e6edf3' : done ? '#8b949e' : '#6b7280', fontSize:12, fontWeight: active ? 500 : 400 }}>{step.label}</span>
                {i < STATUS_STEPS.filter(s => !['on_hold'].includes(s.key) || wo.status === 'on_hold').length - 1 && (
                  <div style={{ width:24, height:1, background: done ? '#1D9E75' : '#30363d', margin:'0 4px' }}/>
                )}
              </div>
            )
          })}
        </div>

        {/* Action buttons based on current status */}
        {!isClosed && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {wo.status === 'open' && (
              <button onClick={() => updateStatus('travelling')}
                style={{ background:'#378ADD', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                🚗 Start Trip
              </button>
            )}
            {wo.status === 'travelling' && (
              <button onClick={() => updateStatus('arrived')}
                style={{ background:'#EF9F27', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                📍 I've Arrived
              </button>
            )}
            {wo.status === 'arrived' && (
              <button onClick={() => updateStatus('in_progress')}
                style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                🔧 Start Work
              </button>
            )}
            {wo.status === 'in_progress' && (
              <>
                <button onClick={() => setAction('hold')}
                  style={{ background:'#2d2208', color:'#EF9F27', border:'1px solid #EF9F27', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  ⏸ Put On Hold
                </button>
                <button onClick={() => setAction('complete')}
                  style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  ✅ Work Complete
                </button>
              </>
            )}
            {wo.status === 'on_hold' && (
              <button onClick={() => updateStatus('in_progress')}
                style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                ↩ Reopen — Resume Work
              </button>
            )}
            {wo.status === 'completed' && (
              <button onClick={() => setAction('signature')}
                style={{ background:'#7F77DD', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                ✍️ Get Manager Signature to Close
              </button>
            )}
          </div>
        )}

        {isClosed && wo.signature_url && (
          <div style={{ background:'#1d2f26', border:'1px solid #1D9E75', borderRadius:8, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:20 }}>✅</span>
            <div>
              <div style={{ color:'#1D9E75', fontSize:13, fontWeight:500 }}>Closed & Signed</div>
              <div style={{ color:'#6b7280', fontSize:12 }}>Signed by {wo.signed_by} · {new Date(wo.signed_at).toLocaleString()}</div>
            </div>
            <img src={wo.signature_url} alt="Signature" style={{ height:40, marginLeft:'auto', borderRadius:4, background:'white', padding:4 }}/>
          </div>
        )}
      </div>

      {/* Hold action panel */}
      {action === 'hold' && (
        <div style={{ background:'#161b22', border:'1px solid #EF9F27', borderRadius:12, padding:20, marginBottom:16 }}>
          <h3 style={{ color:'#EF9F27', fontSize:15, fontWeight:500, margin:'0 0 14px' }}>⏸ Put On Hold</h3>
          <div style={{ marginBottom:12 }}>
            <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Reason for hold *</label>
            <textarea style={{ ...inp, height:80, resize:'vertical' }} value={holdReason} onChange={e => setHoldReason(e.target.value)} placeholder="e.g. Waiting for spare part, Need access to area..."/>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Add photos</label>
            <input type="file" accept="image/*,video/*" multiple capture="environment" onChange={handlePhotoUpload}
              style={{ color:'#8b949e', fontSize:12 }}/>
            {photos.length > 0 && (
              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                {photos.map((p,i) => <img key={i} src={p} alt="" style={{ height:60, borderRadius:6, objectFit:'cover' }}/>)}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => updateStatus('on_hold', { hold_reason: holdReason, work_update: holdReason })} disabled={saving || !holdReason.trim()}
              style={{ background: saving||!holdReason.trim() ? '#2d2208':'#EF9F27', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>
              {saving ? 'Saving...' : 'Confirm Hold'}
            </button>
            <button onClick={() => { setAction(null); setPhotos([]) }}
              style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Work Complete panel */}
      {action === 'complete' && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:20, marginBottom:16 }}>
          <h3 style={{ color:'#1D9E75', fontSize:15, fontWeight:500, margin:'0 0 14px' }}>✅ Work Complete</h3>
          <div style={{ marginBottom:12 }}>
            <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Work summary *</label>
            <textarea style={{ ...inp, height:100, resize:'vertical' }} value={workUpdate} onChange={e => setWorkUpdate(e.target.value)} placeholder="Describe what was done, parts used, observations..."/>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Add photos / videos</label>
            <label style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#1a2b3c', border:'1px solid #1f3a56', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#378ADD', fontSize:13 }}>
              📸 Open Camera / Gallery
              <input type="file" accept="image/*,video/*" multiple capture="environment" onChange={handlePhotoUpload} style={{ display:'none' }}/>
            </label>
            {photos.length > 0 && (
              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                {photos.map((p,i) => (
                  <div key={i} style={{ position:'relative' }}>
                    <img src={p} alt="" style={{ height:80, borderRadius:8, objectFit:'cover' }}/>
                    <button onClick={() => setPhotos(prev => prev.filter((_,j) => j!==i))}
                      style={{ position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:'50%', background:'#f85149', color:'white', border:'none', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => updateStatus('completed', { work_update: workUpdate })} disabled={saving || !workUpdate.trim()}
              style={{ background: saving||!workUpdate.trim() ? '#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>
              {saving ? 'Saving...' : 'Mark as Complete'}
            </button>
            <button onClick={() => { setAction(null); setPhotos([]) }}
              style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Signature panel */}
      {action === 'signature' && (
        <div style={{ background:'#161b22', border:'1px solid #7F77DD', borderRadius:12, padding:20, marginBottom:16 }}>
          <h3 style={{ color:'#7F77DD', fontSize:15, fontWeight:500, margin:'0 0 6px' }}>✍️ Manager Signature Required</h3>
          <p style={{ color:'#6b7280', fontSize:13, margin:'0 0 16px' }}>The work order cannot be closed without the store manager's signature.</p>
          <div style={{ marginBottom:14 }}>
            <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Manager name *</label>
            <input style={{ ...inp, maxWidth:300 }} value={signedBy} onChange={e => setSignedBy(e.target.value)} placeholder={wo.stores?.manager_name || 'Enter manager name'}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Signature (draw below) *</label>
            <div style={{ background:'#0d1117', border:'1px solid #30363d', borderRadius:8, overflow:'hidden', touchAction:'none' }}>
              <canvas ref={sigCanvas} width={500} height={150}
                style={{ display:'block', width:'100%', cursor:'crosshair' }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
              <span style={{ color:'#6b7280', fontSize:12 }}>Draw signature with finger or mouse</span>
              <button onClick={clearSig} style={{ background:'transparent', border:'none', color:'#6b7280', fontSize:12, cursor:'pointer', textDecoration:'underline' }}>Clear</button>
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={submitSignature} disabled={saving || !hasSig || !signedBy.trim()}
              style={{ background: saving||!hasSig||!signedBy.trim() ? '#3a3580':'#7F77DD', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>
              {saving ? 'Closing...' : '🔒 Close Work Order'}
            </button>
            <button onClick={() => setAction(null)}
              style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Activity log */}
      <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:20 }}>
        <h2 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 16px' }}>Activity Log</h2>

        {updates.length === 0 ? (
          <div style={{ color:'#6b7280', fontSize:13 }}>No activity yet</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {updates.map(u => (
              <div key={u.id} style={{ display:'flex', gap:12 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: u.type==='signature'?'#7F77DD': u.type==='photo'?'#378ADD':'#1D9E75', marginTop:5, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ color:'#e6edf3', fontSize:13 }}>{u.profiles?.full_name || 'System'}</span>
                    <span style={{ color:'#6b7280', fontSize:11 }}>{new Date(u.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ color:'#8b949e', fontSize:13 }}>{u.content}</div>
                  {u.photos && u.photos.length > 0 && (
                    <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                      {u.photos.map((p,i) => <img key={i} src={p} alt="" style={{ height:60, borderRadius:6, objectFit:'cover', cursor:'pointer' }} onClick={() => window.open(p)}/>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add note */}
        {!isClosed && (
          <div style={{ marginTop:16, display:'flex', gap:10 }}>
            <input style={{ ...inp, flex:1 }} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note..." onKeyDown={e => e.key==='Enter' && addNote()}/>
            <button onClick={addNote} disabled={!note.trim() || saving}
              style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>
              Add Note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
