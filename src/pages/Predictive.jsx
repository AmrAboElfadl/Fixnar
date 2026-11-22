import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../lib/useLive'
import { assetAi } from '../lib/assetAi'
import { METRICS, metricLabel, prettyTitle, KIND_LABEL, SEVERITY } from '../lib/predictive'
import ReadingForm from '../components/ReadingForm'

// Predictive maintenance (fx19): alerts raised by predictive_scan() before a machine breaks down.
const hasErr = (e) => e && Object.keys(e).length
const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:12 }
const btn  = (bg, color = 'white') => ({ background:bg, color, border: bg === 'transparent' ? '1px solid var(--border)' : 'none', borderRadius:8, padding:'7px 12px', fontSize:12, cursor:'pointer' })
const inp  = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:13 }

// Small trend line of one machine's readings (last 30 days) with the safe limit
function Sparkline({ points, hi }) {
  if (!points || points.length < 2) return null
  const w = 180, h = 44, vals = points.map(p => Number(p.value)).concat(hi != null ? [Number(hi)] : [])
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1
  const t0 = new Date(points[0].recorded_at).getTime(), t1 = new Date(points[points.length - 1].recorded_at).getTime(), ts = (t1 - t0) || 1
  const x = (p) => 4 + ((new Date(p.recorded_at).getTime() - t0) / ts) * (w - 8)
  const y = (v) => h - 4 - ((v - min) / span) * (h - 8)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(Number(p.value)).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} role="img" aria-label="Recent readings" style={{ display:'block' }}>
      {hi != null && <line x1="0" x2={w} y1={y(Number(hi))} y2={y(Number(hi))} stroke="var(--red)" strokeDasharray="4 3" strokeWidth="1"/>}
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth="2"/>
      <circle cx={x(points[points.length - 1])} cy={y(Number(points[points.length - 1].value))} r="3" fill="var(--blue)"/>
    </svg>
  )
}

function AlertCard({ a, readings, isStaff, onChanged, profile }) {
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState(null)
  const [aiErr, setAiErr] = useState('')
  const sev = SEVERITY[a.severity] || SEVERITY.watch
  const d = a.details || {}
  const snoozed = a.snoozed_until && new Date(a.snoozed_until) > new Date()

  async function setStatus(patch, note) {
    setBusy(true)
    const { error } = await supabase.from('asset_alerts').update({ ...patch, handled_by: profile?.id, updated_at: new Date().toISOString(), ...(note ? { resolved_note: note } : {}) }).eq('id', a.id)
    setBusy(false)
    if (hasErr(error)) return alert('Error: ' + error.message)
    onChanged()
  }
  async function createWO() {
    setBusy(true)
    const { data, error } = await supabase.from('work_orders').insert({
      title: '⚠ Predicted: ' + (a.assets?.name || 'machine') + ' — ' + prettyTitle(a.title),
      description: 'From predictive maintenance. ' + (d.explain || ''), priority: a.severity === 'critical' ? 'P2' : 'P3',
      status: 'open', store_id: a.store_id, asset_id: a.asset_id, category: a.assets?.category || 'Predictive', wo_type: 'predictive', created_by: profile?.id,
    }).select('id').single()
    if (hasErr(error) || !data) { setBusy(false); return alert('Error: ' + (error?.message || 'could not create the work order')) }
    await supabase.from('asset_alerts').update({ work_order_id: data.id, status: 'acknowledged', handled_by: profile?.id }).eq('id', a.id)
    setBusy(false); onChanged()
  }
  async function askAi() {
    setAiErr(''); setAi('…')
    try {
      const r = await assetAi('advise', {
        asset: { name: a.assets?.name, brand: a.assets?.brand, model: a.assets?.model, category: a.assets?.category, specs: a.assets?.specs },
        alert: { kind: a.kind, severity: a.severity, title: a.title, details: d },
        readings: (readings || []).slice(-12).map(p => ({ metric: p.metric, value: Number(p.value), at: p.recorded_at })),
      })
      setAi(r.data)
    } catch (e) {
      setAi(null)
      setAiErr(/Unknown action|404|not found|Failed to send/i.test(e.message) ? 'AI advice is not switched on yet (the AI function needs its update deployed).' : e.message)
    }
  }

  return (
    <div style={{ ...card, borderLeft:`4px solid ${sev.color}` }} data-alert={a.id}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:240 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ background:sev.bg, color:sev.color, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{sev.icon} {sev.label}</span>
            <span style={{ fontSize:11, color:'var(--text3)' }}>{KIND_LABEL[a.kind] || a.kind}</span>
            {a.status === 'acknowledged' && <span style={{ fontSize:11, color:'var(--text3)' }}>· acknowledged</span>}
            {snoozed && <span style={{ fontSize:11, color:'var(--text3)' }}>· snoozed until {new Date(a.snoozed_until).toLocaleDateString('en-GB')}</span>}
          </div>
          <div style={{ fontSize:15, fontWeight:600 }}>
            <Link to={`/a/${a.asset_id}`} style={{ color:'var(--text)' }}>{a.assets?.name || 'Machine'}</Link>
            <span style={{ color:'var(--text3)', fontWeight:400 }}> · {a.stores?.name || ''}</span>
          </div>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>{prettyTitle(a.title)}</div>
          {d.explain && <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>{d.explain}</div>}
        </div>
        {d.metric && (
          <div style={{ textAlign:'right' }}>
            <Sparkline points={readings} hi={d.hi}/>
            <div style={{ fontSize:10, color:'var(--text3)' }}>{metricLabel(d.metric)}{d.hi != null ? ` · limit ${d.hi}` : ''}</div>
          </div>
        )}
      </div>
      {ai && ai !== '…' && (
        <div style={{ marginTop:10, padding:'10px 12px', background:'var(--bg)', borderRadius:8, fontSize:13 }} data-ai>
          <div style={{ fontWeight:600, marginBottom:4 }}>🤖 {ai.summary}</div>
          {Array.isArray(ai.likely_causes) && ai.likely_causes.length > 0 && <div><b>Likely causes:</b> {ai.likely_causes.join(' · ')}</div>}
          {Array.isArray(ai.checks) && ai.checks.length > 0 && <ol style={{ margin:'6px 0 0 18px' }}>{ai.checks.map((c, i) => <li key={i}>{c}</li>)}</ol>}
          {ai.urgency && <div style={{ marginTop:6, color:'var(--text3)' }}>Act: {String(ai.urgency).replace('_', ' ')}</div>}
        </div>
      )}
      {ai === '…' && <div style={{ marginTop:8, fontSize:12, color:'var(--text3)' }}>🤖 Thinking…</div>}
      {aiErr && <div style={{ marginTop:8, fontSize:12, color:'var(--amber)' }}>{aiErr}</div>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
        {a.work_order_id
          ? <Link to={`/work-orders/${a.work_order_id}`} style={{ ...btn('var(--green)'), textDecoration:'none' }}>Open work order →</Link>
          : isStaff && <button disabled={busy} onClick={createWO} style={btn('var(--green)')}>+ Create work order</button>}
        <button onClick={askAi} disabled={ai === '…'} style={btn('transparent', 'var(--text)')}>🤖 What should we check?</button>
        {isStaff && a.status === 'open' && <button disabled={busy} onClick={() => setStatus({ status:'acknowledged' })} style={btn('transparent', 'var(--text)')}>Acknowledge</button>}
        {isStaff && <button disabled={busy} onClick={() => setStatus({ snoozed_until: new Date(Date.now() + 7 * 864e5).toISOString() })} style={btn('transparent', 'var(--text)')}>Snooze 7 days</button>}
        {isStaff && <button disabled={busy} onClick={() => setStatus({ status:'false_alarm' }, 'Marked as a false alarm')} style={btn('transparent', 'var(--text)')}>False alarm</button>}
        {isStaff && <button disabled={busy} onClick={() => setStatus({ status:'resolved' }, 'Resolved by hand')} style={btn('transparent', 'var(--text)')}>Resolved</button>}
      </div>
    </div>
  )
}

// Pick a store, then a machine (used by "Add a reading" and the test data panel)
function MachinePicker({ stores, storeId, setStoreId, assetId, setAssetId }) {
  const [assets, setAssets] = useState([])
  useEffect(() => {
    if (!storeId) { setAssets([]); return }
    supabase.from('assets').select('id,name').eq('store_id', storeId).order('name').limit(500).then(({ data }) => setAssets(data || []))
  }, [storeId])
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
      <select aria-label="Store" value={storeId} onChange={e => { setStoreId(e.target.value); setAssetId('') }} style={inp}>
        <option value="">Store…</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select aria-label="Machine" value={assetId} onChange={e => setAssetId(e.target.value)} style={{ ...inp, minWidth:200 }} disabled={!storeId}>
        <option value="">Machine…</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  )
}

function TestPanel({ stores, onDone }) {
  const [storeId, setStoreId] = useState(''), [assetId, setAssetId] = useState('')
  const [metric, setMetric] = useState('temp_c'), [pattern, setPattern] = useState('drift'), [msg, setMsg] = useState('')
  async function run(fn) {
    if (!assetId) return setMsg('Choose a machine first')
    const { data, error } = fn === 'sim'
      ? await supabase.rpc('simulate_readings', { p_asset: assetId, p_metric: metric, p_pattern: pattern })
      : await supabase.rpc('clear_simulated_readings', { p_asset: assetId })
    if (hasErr(error)) return setMsg('Error: ' + error.message)
    setMsg(fn === 'sim' ? `✅ ${data} test readings added — press Run scan now` : `🧹 ${data} test readings removed`)
    onDone()
  }
  return (
    <div style={{ ...card, borderStyle:'dashed' }}>
      <div style={{ fontWeight:600, marginBottom:8 }}>🧪 Test data (admin) — try the alarms without sensors</div>
      <MachinePicker stores={stores} storeId={storeId} setStoreId={setStoreId} assetId={assetId} setAssetId={setAssetId}/>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
        <select aria-label="Test measurement" value={metric} onChange={e => setMetric(e.target.value)} style={inp}>{METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <select aria-label="Pattern" value={pattern} onChange={e => setPattern(e.target.value)} style={inp}>
          <option value="normal">Normal</option><option value="drift">Slowly getting worse</option><option value="breach">Failing now</option>
        </select>
        <button onClick={() => run('sim')} style={btn('var(--blue)')}>Add test readings</button>
        <button onClick={() => run('clear')} style={btn('transparent', 'var(--text)')}>Remove test readings</button>
      </div>
      {msg && <div style={{ fontSize:12, marginTop:6, color:'var(--text2)' }}>{msg}</div>}
    </div>
  )
}

export default function Predictive() {
  const { profile } = useAuth()
  const role = profile?.role
  const isAdmin = role === 'admin', isStaff = role === 'admin' || role === 'operations'
  const [settings, setSettings] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [history, setHistory] = useState([])
  const [readings, setReadings] = useState({})
  const [stores, setStores] = useState([])
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('active')
  const [scanMsg, setScanMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [rStore, setRStore] = useState(''), [rAsset, setRAsset] = useState('')

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    const sel = '*,assets(id,name,brand,model,category,subcategory,specs),stores(name)'
    const [s, a, h, st] = await Promise.all([
      supabase.from('predictive_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('asset_alerts').select(sel).in('status', ['open','acknowledged']).order('score', { ascending:false }),
      supabase.from('asset_alerts').select(sel).in('status', ['resolved','false_alarm']).gte('updated_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('updated_at', { ascending:false }).limit(100),
      supabase.from('stores').select('id,name').order('name'),
    ])
    // A workspace whose database has no fx19 yet: say so instead of failing
    if (hasErr(s.error) && /predictive_settings|does not exist|schema cache/i.test(s.error.message || '')) { setMissing(true); setLoading(false); return }
    setSettings(s.data || null); setAlerts(a.data || []); setHistory(h.data || []); setStores(st.data || [])
    const ids = [...new Set((a.data || []).filter(x => x.details?.metric).map(x => x.asset_id))]
    if (ids.length) {
      const { data } = await supabase.from('asset_readings').select('asset_id,metric,value,recorded_at').in('asset_id', ids)
        .gte('recorded_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('recorded_at')
      const by = {}; (data || []).forEach(r => { (by[r.asset_id + '|' + r.metric] = by[r.asset_id + '|' + r.metric] || []).push(r) })
      setReadings(by)
    } else setReadings({})
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useLive('asset_alerts', () => load(true))

  async function saveSetting(patch) {
    const { error } = await supabase.from('predictive_settings').update({ ...patch, updated_by: profile?.id, updated_at: new Date().toISOString() }).eq('id', 1)
    if (hasErr(error)) return alert('Error: ' + error.message)
    load(true)
  }
  async function runScan() {
    setScanMsg('Scanning…')
    const { data, error } = await supabase.rpc('run_predictive_scan')
    if (hasErr(error)) return setScanMsg('❌ ' + error.message)
    setScanMsg(settings?.enabled ? `✅ Scan done — ${data} finding${data === 1 ? '' : 's'}` : 'Predictive maintenance is switched off — nothing was scanned')
    load(true); setTimeout(() => setScanMsg(''), 6000)
  }

  if (missing) return <div style={{ ...card, maxWidth:700 }}><h2 style={{ fontSize:18, margin:'0 0 6px' }}>Predictive maintenance</h2><p style={{ color:'var(--text2)', fontSize:13 }}>Not set up for this workspace yet (database update fx19 needed).</p></div>

  const shown = (tab === 'active' ? alerts : history).filter(a => filter === 'all' || a.severity === filter)
  const count = (sev) => alerts.filter(a => a.severity === sev).length

  return (
    <div style={{ maxWidth:1000, color:'var(--text)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Predictive maintenance</h1>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:4 }}>Warnings before a machine breaks down — from readings, sensors, repeat faults and technician notes.</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {isStaff && <button onClick={runScan} style={btn('var(--green)')}>⟳ Run scan now</button>}
        </div>
      </div>

      {settings && (
        <div style={{ ...card, display:'flex', gap:16, alignItems:'center', flexWrap:'wrap', background: settings.enabled ? 'var(--surface)' : 'var(--amber-bg)' }} data-settings>
          <b style={{ fontSize:13 }}>{settings.enabled ? '🟢 Switched on — scans every hour' : '⏸ Switched off — no scans, alarms or work orders'}</b>
          {isAdmin && <button onClick={() => saveSetting({ enabled: !settings.enabled })} style={btn(settings.enabled ? 'transparent' : 'var(--green)', settings.enabled ? 'var(--text)' : 'white')}>{settings.enabled ? 'Switch off' : 'Switch on'}</button>}
          {isAdmin && <label style={{ fontSize:13, display:'flex', gap:6, alignItems:'center' }}>
            <input type="checkbox" checked={!!settings.auto_work_orders} onChange={e => saveSetting({ auto_work_orders: e.target.checked })}/> Critical alarms open a work order automatically
          </label>}
          {scanMsg && <span style={{ fontSize:12, color:'var(--text2)' }}>{scanMsg}</span>}
        </div>
      )}

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
        {[['active', `Active (${alerts.length})`], ['history', `Last 30 days (${history.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={btn(tab === k ? 'var(--text)' : 'transparent', tab === k ? 'var(--bg2)' : 'var(--text)')}>{l}</button>
        ))}
        <span style={{ width:8 }}/>
        {['all', 'critical', 'warn', 'watch'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={btn(filter === s ? 'var(--blue-bg)' : 'transparent', filter === s ? 'var(--blue)' : 'var(--text)')}>
            {s === 'all' ? 'All' : `${SEVERITY[s].icon} ${SEVERITY[s].label} (${count(s)})`}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color:'var(--text3)', fontSize:13 }}>Loading…</div>
        : shown.length === 0 ? <div style={{ ...card, color:'var(--text3)', fontSize:13 }}>{tab === 'active' ? 'No warnings. Every machine looks normal.' : 'Nothing in the last 30 days.'}</div>
        : shown.map(a => (
          <AlertCard key={a.id} a={a} profile={profile} isStaff={isStaff && tab === 'active'} onChanged={() => load(true)}
            readings={a.details?.metric ? readings[a.asset_id + '|' + a.details.metric] : null}/>
        ))}

      <div style={card}>
        <div style={{ fontWeight:600, marginBottom:8 }}>📈 Add a reading</div>
        <MachinePicker stores={stores} storeId={rStore} setStoreId={setRStore} assetId={rAsset} setAssetId={setRAsset}/>
        <div style={{ marginTop:8 }}><ReadingForm assetId={rAsset} onSaved={() => load(true)}/></div>
      </div>

      {isAdmin && <TestPanel stores={stores} onDone={() => load(true)}/>}
    </div>
  )
}
