import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, fetchAllRows } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const hasErr = (e) => e && Object.keys(e).length
const CENTRAL = '__central__'
const EMPTY_PART = { name:'', part_no:'', category:'', unit:'pcs', unit_cost:'', min_qty:'', notes:'', is_active:true }
const AED = (n) => `AED ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits:2 })}`

const INP = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box' }

function LocSelect({ value, onChange, stores }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={INP}>
      <option value={CENTRAL}>Central store / van</option>
      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}

function Modal({ children, onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:22, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>{children}</div>
    </div>
  )
}

export default function Inventory() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'operations'

  const [parts, setParts]   = useState([])
  const [stock, setStock]   = useState([])
  const [stores, setStores] = useState([])
  const [moves, setMoves]   = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg]       = useState(null)
  const [search, setSearch] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [loc, setLoc]       = useState('all')
  const [partForm, setPartForm] = useState(null)
  const [moveForm, setMoveForm] = useState(null)   // { part, kind, qty, from, to, unit_cost, note }
  const [history, setHistory] = useState(null)     // part
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  function flash(text, type = 'ok') { setMsg({ text, type }); setTimeout(() => setMsg(null), 5000) }

  async function load() {
    setLoading(true)
    const [p, s, st] = await Promise.all([
      fetchAllRows(() => supabase.from('parts').select('*').order('name')),
      fetchAllRows(() => supabase.from('part_stock').select('*').order('id')),
      supabase.from('stores').select('id,name').order('name'),
    ])
    if (p.error) flash(p.error.message || 'Could not load parts', 'error')
    setParts(p.data || []); setStock(s.data || []); setStores(st.data || [])
    setLoading(false)
  }

  async function loadHistory(part) {
    setHistory(part); setMoves([])
    const { data } = await supabase.from('stock_movements')
      .select('*, stores(name), work_orders(id,title), profiles(full_name)')
      .eq('part_id', part.id).order('created_at', { ascending:false }).limit(100)
    setMoves(data || [])
  }

  const storeName = (id) => id ? (stores.find(s => s.id === id)?.name || 'Store') : 'Central store'
  const qtyAt = (partId, storeId) => Number(stock.find(s => s.part_id === partId && (s.store_id || null) === (storeId || null))?.qty || 0)
  const totalQty = (partId) => stock.filter(s => s.part_id === partId).reduce((a, s) => a + Number(s.qty), 0)

  const rows = useMemo(() => parts.map(p => {
    const qty = loc === 'all' ? totalQty(p.id) : qtyAt(p.id, loc === CENTRAL ? null : loc)
    return { ...p, qty, low: Number(p.min_qty) > 0 && qty <= Number(p.min_qty) }
  }).filter(p => {
    if (onlyLow && !p.low) return false
    if (search && !`${p.name} ${p.part_no || ''} ${p.category || ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [parts, stock, loc, onlyLow, search])

  const stockValue = parts.reduce((a, p) => a + totalQty(p.id) * Number(p.unit_cost || 0), 0)
  const lowCount = parts.filter(p => Number(p.min_qty) > 0 && totalQty(p.id) <= Number(p.min_qty)).length

  async function savePart() {
    if (!partForm.name.trim()) return flash('Part name is required', 'error')
    setSaving(true)
    const row = {
      name: partForm.name.trim(), part_no: partForm.part_no?.trim() || null, category: partForm.category || null,
      unit: partForm.unit || 'pcs', unit_cost: Number(partForm.unit_cost) || 0, min_qty: Number(partForm.min_qty) || 0,
      notes: partForm.notes || null, is_active: partForm.is_active !== false,
    }
    const res = partForm.id ? await supabase.from('parts').update(row).eq('id', partForm.id)
                            : await supabase.from('parts').insert(row)
    setSaving(false)
    if (hasErr(res.error)) return flash(res.error.message, 'error')
    setPartForm(null); flash('✅ Saved'); load()
  }

  async function saveMove() {
    const f = moveForm; const qty = Number(f.qty)
    if (!qty || qty <= 0) return flash('Enter a quantity above 0', 'error')
    setSaving(true)
    const loc = (v) => (v === CENTRAL || !v) ? null : v
    let rowsToInsert = []
    if (f.kind === 'receive') rowsToInsert = [{ part_id:f.part.id, store_id:loc(f.to), qty_change:qty, kind:'receive', unit_cost: f.unit_cost === '' ? null : Number(f.unit_cost), note:f.note || null }]
    if (f.kind === 'adjust') {
      const diff = qty - qtyAt(f.part.id, loc(f.to))
      if (diff === 0) { setSaving(false); return flash('Stock is already at that quantity') }
      rowsToInsert = [{ part_id:f.part.id, store_id:loc(f.to), qty_change:diff, kind:'adjust', note:f.note || 'Stock count' }]
    }
    if (f.kind === 'transfer') {
      if ((f.from || CENTRAL) === (f.to || CENTRAL)) { setSaving(false); return flash('Choose two different locations', 'error') }
      rowsToInsert = [
        { part_id:f.part.id, store_id:loc(f.from), qty_change:-qty, kind:'transfer_out', note:`To ${storeName(loc(f.to))}` },
        { part_id:f.part.id, store_id:loc(f.to),   qty_change: qty, kind:'transfer_in',  note:`From ${storeName(loc(f.from))}` },
      ]
    }
    const { error } = await supabase.from('stock_movements').insert(rowsToInsert)
    setSaving(false)
    if (hasErr(error)) return flash(error.message, 'error')
    setMoveForm(null); flash('✅ Stock updated'); load()
  }

  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }
  const inp  = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box' }
  const lbl  = { fontSize:11, fontWeight:600, color:'var(--text3)', marginBottom:5, display:'block' }
  const btn  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', fontSize:12, cursor:'pointer', color:'var(--text)' }
  const primary = { ...btn, background:'var(--green)', color:'white', border:'none', fontWeight:600, fontSize:13, padding:'9px 16px' }
  return (
    <div style={{ color:'var(--text)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:18 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Spare Parts</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text3)' }}>Stock in the central store and at each branch. Parts used on a job are taken from stock automatically.</p>
        </div>
        {canEdit && <button onClick={() => setPartForm({ ...EMPTY_PART })} style={primary}>+ New part</button>}
      </div>

      {msg && <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:12, fontSize:13, background: msg.type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12, marginBottom:16 }}>
        {[['Parts', parts.length, 'var(--text)'], ['Low stock', lowCount, 'var(--red)'], ['Stock value', AED(stockValue), 'var(--green)']].map(([l, v, c]) => (
          <div key={l} style={{ ...card, padding:'14px 16px', cursor: l === 'Low stock' ? 'pointer' : 'default' }} onClick={() => l === 'Low stock' && setOnlyLow(x => !x)}>
            <div style={{ fontSize:12, color:'var(--text3)' }}>{l}{l === 'Low stock' && onlyLow ? ' (filtered)' : ''}</div>
            <div style={{ fontSize:24, fontWeight:700, color:c, marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search part name, number, category…" style={{ ...inp, maxWidth:280 }}/>
        <select value={loc} onChange={e => setLoc(e.target.value)} style={{ ...inp, width:'auto' }}>
          <option value="all">All locations (total)</option>
          <option value={CENTRAL}>Central store / van</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={{ display:'flex', gap:6, alignItems:'center', fontSize:13 }}>
          <input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} style={{ accentColor:'var(--green)' }}/> Low stock only
        </label>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading…</div> : rows.length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center', color:'var(--text3)' }}>
          {parts.length === 0 ? <>No parts yet.{canEdit && ' Click "+ New part" to add your common spares (capacitors, filters, contactors, thermostats…).'}</> : 'No parts match.'}
        </div>
      ) : (
        <div style={{ ...card, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)', color:'var(--text3)', fontSize:11, textAlign:'left' }}>
              {['Part','Category','In stock','Minimum','Unit cost','Value',''].map(h => <th key={h} style={{ padding:'10px 12px', fontWeight:600 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid var(--border)', opacity: p.is_active ? 1 : 0.55 }}>
                  <td style={{ padding:'10px 12px' }}>
                    <div style={{ fontWeight:600 }}>{p.name}</div>
                    {p.part_no && <div style={{ fontSize:11, color:'var(--text3)' }}>#{p.part_no}</div>}
                  </td>
                  <td style={{ padding:'10px 12px' }}>{p.category || '—'}</td>
                  <td style={{ padding:'10px 12px', fontWeight:700, color: p.low ? 'var(--red)' : 'var(--text)' }}>
                    {p.qty} {p.unit} {p.low && <span style={{ fontSize:10, background:'var(--red-bg)', color:'var(--red)', borderRadius:10, padding:'1px 6px', marginLeft:4 }}>LOW</span>}
                  </td>
                  <td style={{ padding:'10px 12px' }}>{Number(p.min_qty) || '—'}</td>
                  <td style={{ padding:'10px 12px' }}>{AED(p.unit_cost)}</td>
                  <td style={{ padding:'10px 12px' }}>{AED(p.qty * Number(p.unit_cost || 0))}</td>
                  <td style={{ padding:'10px 12px', whiteSpace:'nowrap', textAlign:'right' }}>
                    {canEdit && <>
                      <button onClick={() => setMoveForm({ part:p, kind:'receive', qty:'', to:CENTRAL, from:CENTRAL, unit_cost:'', note:'' })} style={{ ...btn, marginRight:4 }}>+ Receive</button>
                      <button onClick={() => setMoveForm({ part:p, kind:'transfer', qty:'', from:CENTRAL, to:stores[0]?.id || CENTRAL, note:'' })} style={{ ...btn, marginRight:4 }}>Transfer</button>
                      <button onClick={() => setMoveForm({ part:p, kind:'adjust', qty:'', to:CENTRAL, note:'' })} style={{ ...btn, marginRight:4 }}>Count</button>
                    </>}
                    <button onClick={() => loadHistory(p)} style={{ ...btn, marginRight:4 }}>History</button>
                    {canEdit && <button onClick={() => setPartForm({ ...EMPTY_PART, ...p })} style={btn}>Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {partForm && (
        <Modal onClose={() => setPartForm(null)}>
          <h3 style={{ margin:'0 0 14px' }}>{partForm.id ? 'Edit part' : 'New part'}</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
            <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>NAME *</label><input value={partForm.name} onChange={e => setPartForm({ ...partForm, name:e.target.value })} placeholder="e.g. Run capacitor 45µF" style={inp}/></div>
            <div><label style={lbl}>PART NO.</label><input value={partForm.part_no || ''} onChange={e => setPartForm({ ...partForm, part_no:e.target.value })} style={inp}/></div>
            <div><label style={lbl}>CATEGORY</label><input value={partForm.category || ''} onChange={e => setPartForm({ ...partForm, category:e.target.value })} placeholder="HVAC, Electrical…" style={inp}/></div>
            <div><label style={lbl}>UNIT</label>
              <select value={partForm.unit} onChange={e => setPartForm({ ...partForm, unit:e.target.value })} style={inp}>
                {['pcs','set','m','kg','L','box','roll'].map(u => <option key={u}>{u}</option>)}
              </select></div>
            <div><label style={lbl}>UNIT COST (AED)</label><input type="number" min="0" step="0.01" value={partForm.unit_cost} onChange={e => setPartForm({ ...partForm, unit_cost:e.target.value })} style={inp}/></div>
            <div><label style={lbl}>ALERT WHEN STOCK ≤</label><input type="number" min="0" value={partForm.min_qty} onChange={e => setPartForm({ ...partForm, min_qty:e.target.value })} style={inp}/></div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginTop:18 }}>
              <input type="checkbox" checked={partForm.is_active !== false} onChange={e => setPartForm({ ...partForm, is_active:e.target.checked })} style={{ accentColor:'var(--green)' }}/> Active
            </label>
            <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>NOTES / SUPPLIER</label><input value={partForm.notes || ''} onChange={e => setPartForm({ ...partForm, notes:e.target.value })} style={inp}/></div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
            <button onClick={() => setPartForm(null)} style={{ ...btn, fontSize:13, padding:'9px 16px' }}>Cancel</button>
            <button onClick={savePart} disabled={saving} style={primary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {moveForm && (
        <Modal onClose={() => setMoveForm(null)}>
          <h3 style={{ margin:'0 0 4px' }}>{{ receive:'Receive stock', transfer:'Transfer stock', adjust:'Stock count' }[moveForm.kind]}</h3>
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:14 }}>{moveForm.part.name}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
            {moveForm.kind === 'transfer' && <div><label style={lbl}>FROM</label><LocSelect stores={stores} value={moveForm.from} onChange={v => setMoveForm({ ...moveForm, from:v })}/>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Available: {qtyAt(moveForm.part.id, moveForm.from === CENTRAL ? null : moveForm.from)}</div></div>}
            <div><label style={lbl}>{moveForm.kind === 'transfer' ? 'TO' : 'LOCATION'}</label><LocSelect stores={stores} value={moveForm.to} onChange={v => setMoveForm({ ...moveForm, to:v })}/>
              {moveForm.kind !== 'transfer' && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Now: {qtyAt(moveForm.part.id, moveForm.to === CENTRAL ? null : moveForm.to)} {moveForm.part.unit}</div>}</div>
            <div><label style={lbl}>{moveForm.kind === 'adjust' ? 'ACTUAL QUANTITY COUNTED' : 'QUANTITY'}</label>
              <input type="number" min="0" step="any" value={moveForm.qty} onChange={e => setMoveForm({ ...moveForm, qty:e.target.value })} style={inp} autoFocus/></div>
            {moveForm.kind === 'receive' && <div><label style={lbl}>UNIT COST (AED)</label>
              <input type="number" min="0" step="0.01" value={moveForm.unit_cost} placeholder={String(moveForm.part.unit_cost || '')} onChange={e => setMoveForm({ ...moveForm, unit_cost:e.target.value })} style={inp}/></div>}
            <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>NOTE (supplier, invoice no…)</label><input value={moveForm.note} onChange={e => setMoveForm({ ...moveForm, note:e.target.value })} style={inp}/></div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
            <button onClick={() => setMoveForm(null)} style={{ ...btn, fontSize:13, padding:'9px 16px' }}>Cancel</button>
            <button onClick={saveMove} disabled={saving} style={primary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {history && (
        <Modal onClose={() => setHistory(null)}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <h3 style={{ margin:0 }}>{history.name} — history</h3>
            <button onClick={() => setHistory(null)} style={btn}>Close</button>
          </div>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:10 }}>
            {[{ id:null }, ...stores].map(s => ({ s, q: qtyAt(history.id, s.id) })).filter(x => x.q !== 0).map(x => `${storeName(x.s.id)}: ${x.q}`).join(' · ') || 'No stock anywhere'}
          </div>
          {moves.length === 0 ? <div style={{ color:'var(--text3)', fontSize:13 }}>No movements yet.</div> : moves.map(m => (
            <div key={m.id} style={{ display:'flex', gap:10, padding:'8px 0', borderTop:'1px solid var(--border)', fontSize:13, flexWrap:'wrap' }}>
              <span style={{ fontWeight:700, width:60, color: m.qty_change > 0 ? 'var(--green)' : 'var(--red)' }}>{m.qty_change > 0 ? '+' : ''}{m.qty_change}</span>
              <span style={{ flex:1, minWidth:180 }}>
                {{ receive:'Received', use:'Used', adjust:'Count adjust', transfer_in:'Transfer in', transfer_out:'Transfer out' }[m.kind]} · {m.stores?.name || 'Central store'}
                {m.work_orders && <> · <Link to={`/work-orders/${m.work_orders.id}`} style={{ color:'var(--green)' }}>{m.work_orders.title}</Link></>}
                {m.note && <span style={{ color:'var(--text3)' }}> · {m.note}</span>}
              </span>
              <span style={{ color:'var(--text3)', fontSize:12 }}>{m.profiles?.full_name || ''} {new Date(m.created_at).toLocaleDateString('en-GB')}</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}
