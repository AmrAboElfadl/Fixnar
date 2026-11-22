import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { METRICS } from '../lib/predictive'

// Record one measurement on a machine (predictive maintenance, fx19).
// Module-level component so its inputs keep focus. store_id and recorded_by are set by the database.
export default function ReadingForm({ assetId, workOrderId, onSaved, compact }) {
  const [metric, setMetric] = useState('temp_c')
  const [value, setValue]   = useState('')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState(null)
  const m = METRICS.find(x => x.id === metric)
  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:13, boxSizing:'border-box' }

  async function save() {
    const v = Number(value)
    if (!assetId) return setMsg({ t:'Choose the machine first', err:true })
    if (value === '' || !Number.isFinite(v)) return setMsg({ t:'Enter a number', err:true })
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('asset_readings').insert({ asset_id: assetId, metric, value: v, note: note.trim() || null, work_order_id: workOrderId || null })
    setSaving(false)
    if (error && Object.keys(error).length) return setMsg({ t: error.message, err:true })
    setValue(''); setNote(''); setMsg({ t:'✅ Reading saved' }); onSaved && onSaved()
    setTimeout(() => setMsg(null), 3000)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <select aria-label="Measurement" value={metric} onChange={e => setMetric(e.target.value)} style={inp}>
          {METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <input aria-label="Value" type="number" step={m?.step || 'any'} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
          placeholder="Value" style={{ ...inp, width:110 }}/>
        {!compact && <input aria-label="Note" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inp, flex:1, minWidth:140 }}/>}
        <button onClick={save} disabled={saving} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer' }}>
          {saving ? 'Saving…' : 'Save reading'}
        </button>
      </div>
      <div style={{ fontSize:11, color: msg?.err ? 'var(--red)' : 'var(--text3)', marginTop:6 }}>{msg ? msg.t : m?.hint}</div>
    </div>
  )
}
