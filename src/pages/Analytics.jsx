import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid
} from 'recharts'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const SLA_HOURS = { P1:4, P2:8, P3:12, P4:63 }

// ── EXPORT helper ──
function exportCSV(filename, headers, rows) {
  const csv = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(c => '"' + String(c ?? '').replace(/"/g,'""') + '"').join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── SLA DEADLINE ──
function getSLADeadline(priority, createdAt) {
  const hours = SLA_HOURS[priority] || 8
  const WORK_START = 9, WORK_END = 18
  let cursor = new Date(createdAt)
  let remaining = hours * 60
  while (remaining > 0) {
    const h = cursor.getHours()
    if (h < WORK_START) cursor.setHours(WORK_START,0,0,0)
    else if (h >= WORK_END) { cursor.setDate(cursor.getDate()+1); cursor.setHours(WORK_START,0,0,0) }
    const dayEnd = new Date(cursor); dayEnd.setHours(WORK_END,0,0,0)
    const minLeft = Math.min(remaining, (dayEnd - cursor)/60000)
    cursor = new Date(cursor.getTime() + minLeft*60000)
    remaining -= minLeft
  }
  return cursor
}

function isSLABreached(wo) {
  if (!wo.created_at || !wo.priority) return false
  const closeTime = wo.closed_at ? new Date(wo.closed_at) : new Date()
  return closeTime > getSLADeadline(wo.priority, wo.created_at)
}

// ── SECTION CARD ──
function Section({ title, onExport, children }) {
  return (
    <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ color:'var(--text)', fontSize:15, fontWeight:600, margin:0 }}>{title}</h2>
        {onExport && (
          <button onClick={onExport}
            style={{ background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green)', borderRadius:7, padding:'5px 12px', fontSize:11, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            📥 Export data
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ── CUSTOM TOOLTIP ──
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color:'var(--text)', fontWeight:500, marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text2)' }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const [wos,    setWos]    = useState([])
  const [techs,  setTechs]  = useState([])
  const [ppms,   setPpms]   = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState('month') // 'week' | 'month' | 'all'

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [woRes, techRes, storeRes] = await Promise.all([
        supabase.from('work_orders').select('*,stores(name)').order('created_at'),
        supabase.from('profiles').select('id,full_name').eq('role','technician'),
        supabase.from('stores').select('id,name').order('name'),
      ])
      setWos(woRes.data || [])
      setTechs(techRes.data || [])
      setStores(storeRes.data || [])

      // PPM is optional — don't let it block loading
      try {
        const ppmRes = await supabase.from('ppm_tasks').select('*').order('due_date')
        setPpms(ppmRes.data || [])
      } catch(e) {
        setPpms([])
      }
    } catch(e) {
      console.error('Analytics fetch error:', e)
    }
    setLoading(false)
  }

  if (loading) return <div style={{ color:'var(--text3)', padding:48, textAlign:'center' }}>Loading analytics...</div>

  // ── PERIOD FILTER ──
  const now = new Date()
  const periodStart = period === 'week'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    : period === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(0)

  const filtered = wos.filter(w => new Date(w.created_at) >= periodStart)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // ── 1. SUMMARY KPIs ──
  const total     = filtered.length
  const closed    = filtered.filter(w => w.status === 'closed').length
  const breached  = filtered.filter(w => isSLABreached(w)).length
  const slaRate   = total > 0 ? Math.round(((total - breached) / total) * 100) : 0
  const avgClose  = (() => {
    const closedWOs = filtered.filter(w => w.status === 'closed' && w.closed_at && w.created_at)
    if (!closedWOs.length) return 0
    const totalHrs = closedWOs.reduce((sum, w) => {
      return sum + (new Date(w.closed_at) - new Date(w.created_at)) / 3600000
    }, 0)
    return Math.round(totalHrs / closedWOs.length)
  })()

  // ── 2. BY CATEGORY ──
  const catMap = {}
  filtered.forEach(w => {
    const cat = w.title?.split('—')[0]?.trim() || 'Unknown'
    if (!catMap[cat]) catMap[cat] = { name:cat, total:0, closed:0, breached:0 }
    catMap[cat].total++
    if (w.status === 'closed') catMap[cat].closed++
    if (isSLABreached(w)) catMap[cat].breached++
  })
  const byCategory = Object.values(catMap).sort((a,b) => b.total - a.total)

  // ── 3. BY BRANCH ──
  const branchMap = {}
  filtered.forEach(w => {
    const name = w.stores?.name || 'Unknown'
    if (!branchMap[name]) branchMap[name] = { name, total:0, closed:0, open:0, breached:0 }
    branchMap[name].total++
    if (w.status === 'closed') branchMap[name].closed++
    if (['open','in_progress','on_hold'].includes(w.status)) branchMap[name].open++
    if (isSLABreached(w)) branchMap[name].breached++
  })
  const byBranch = Object.values(branchMap).sort((a,b) => b.total - a.total)

  // This month's top branch
  const thisMonthWOs = wos.filter(w => new Date(w.created_at) >= thisMonth)
  const topBranchThisMonth = (() => {
    const m = {}
    thisMonthWOs.forEach(w => {
      const n = w.stores?.name || 'Unknown'
      m[n] = (m[n]||0)+1
    })
    const sorted = Object.entries(m).sort((a,b)=>b[1]-a[1])
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : null
  })()

  // ── 4. TECHNICIAN PERFORMANCE ──
  const techMap = {}
  techs.forEach(t => {
    techMap[t.id] = {
      id:t.id, name:t.full_name,
      assigned:0, closed:0, breached:0, avgHrs:0, totalHrs:0, closedHrs:0
    }
  })
  filtered.forEach(w => {
    if (!w.assigned_to || !techMap[w.assigned_to]) return
    const t = techMap[w.assigned_to]
    t.assigned++
    if (w.status === 'closed') {
      t.closed++
      if (w.closed_at && w.created_at) t.closedHrs += (new Date(w.closed_at) - new Date(w.created_at))/3600000
    }
    if (isSLABreached(w)) t.breached++
  })
  const techPerf = Object.values(techMap).map(t => ({
    ...t,
    slaRate: t.assigned > 0 ? Math.round(((t.assigned - t.breached) / t.assigned) * 100) : 100,
    avgHrs:  t.closed > 0 ? Math.round(t.closedHrs / t.closed * 10) / 10 : 0,
  })).filter(t => t.assigned > 0).sort((a,b) => b.assigned - a.assigned)

  // ── 5. SLA BY PRIORITY ──
  const slaPriority = ['P1','P2','P3','P4'].map(p => {
    const pWOs     = filtered.filter(w => w.priority === p)
    const pBreached = pWOs.filter(w => isSLABreached(w)).length
    return {
      name: p,
      total:   pWOs.length,
      breached: pBreached,
      onTime:  pWOs.length - pBreached,
      rate:    pWOs.length > 0 ? Math.round(((pWOs.length - pBreached)/pWOs.length)*100) : 100,
    }
  }).filter(d => d.total > 0)

  // ── 6. PPM SLA ──
  const ppmTotal    = ppms.length
  const ppmOverdue  = ppms.filter(p => p.status !== 'done' && new Date(p.due_date) < now).length
  const ppmDone     = ppms.filter(p => p.status === 'done').length
  const ppmOnTime   = ppms.filter(p => p.status === 'done' && new Date(p.due_date) >= now).length
  const ppmSLARate  = ppmTotal > 0 ? Math.round((ppmDone / ppmTotal) * 100) : 0

  // ── 7. MONTHLY TREND ──
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const label = d.toLocaleString('default', { month:'short' })
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1)
    const mEnd   = new Date(d.getFullYear(), d.getMonth()+1, 1)
    const mWOs   = wos.filter(w => {
      const c = new Date(w.created_at)
      return c >= mStart && c < mEnd
    })
    months.push({
      name:    label,
      total:   mWOs.length,
      closed:  mWOs.filter(w => w.status==='closed').length,
      breached:mWOs.filter(w => isSLABreached(w)).length,
    })
  }

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 10px', color:'var(--text)', fontSize:12, cursor:'pointer', outline:'none' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'var(--text)', fontSize:22, fontWeight:600, margin:0 }}>Analytics</h1>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>{total} work orders in period · {techs.length} technicians</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ color:'var(--text3)', fontSize:12 }}>Period:</span>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={inp}>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total WOs',       value:total,             color:'var(--text)',  bg:'var(--card-bg)' },
          { label:'Closed',          value:closed,            color:'var(--green)', bg:'var(--green-bg)' },
          { label:'SLA Compliance',  value:slaRate+'%',       color: slaRate>=80?'var(--green)':slaRate>=60?'var(--amber)':'#E24B4A', bg:'var(--card-bg)' },
          { label:'SLA Breached',    value:breached,          color:'#E24B4A',     bg:'#fdeaea' },
          { label:'Avg Close Time',  value:avgClose+'h',      color:'var(--blue)',  bg:'var(--blue-bg)' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.color}33`, borderRadius:10, padding:'14px 12px', textAlign:'center' }}>
            <div style={{ color:k.color, fontSize:24, fontWeight:700 }}>{k.value}</div>
            <div style={{ color:k.color, fontSize:11, fontWeight:500, opacity:0.8, marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── ROW 1: CATEGORY + BRANCH ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

        {/* By Category */}
        <Section title="Work Orders by Category"
          onExport={() => exportCSV('WO_by_Category',
            ['Category','Total','Closed','Breached','SLA Rate %'],
            byCategory.map(d => [d.name, d.total, d.closed, d.breached, d.total>0?Math.round(((d.total-d.breached)/d.total)*100)+'%':'N/A'])
          )}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byCategory} margin={{ left:-10, bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="name" tick={{ fontSize:10, fill:'var(--text3)' }} angle={-25} textAnchor="end"/>
              <YAxis tick={{ fontSize:10, fill:'var(--text3)' }}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="total"   name="Total"   fill="#378ADD" radius={[4,4,0,0]}/>
              <Bar dataKey="closed"  name="Closed"  fill="#1D9E75" radius={[4,4,0,0]}/>
              <Bar dataKey="breached" name="Breached" fill="#E24B4A" radius={[4,4,0,0]}/>
              <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }}/>
            </BarChart>
          </ResponsiveContainer>
        </Section>

        {/* By Branch */}
        <Section title={`Work Orders by Branch${topBranchThisMonth ? ` · 🏆 This month: ${topBranchThisMonth.name.split('-').pop().trim()} (${topBranchThisMonth.count})` : ''}`}
          onExport={() => exportCSV('WO_by_Branch',
            ['Branch','Total','Closed','Open','Breached'],
            byBranch.map(d => [d.name, d.total, d.closed, d.open, d.breached])
          )}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byBranch.slice(0,10)} margin={{ left:-10, bottom:40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="name" tick={{ fontSize:9, fill:'var(--text3)' }} angle={-30} textAnchor="end" interval={0} tickFormatter={v => v.split('-').pop().trim()}/>
              <YAxis tick={{ fontSize:10, fill:'var(--text3)' }}/>
              <Tooltip content={<CustomTooltip/>} labelFormatter={v => v}/>
              <Bar dataKey="total"  name="Total"  fill="#7F77DD" radius={[4,4,0,0]}/>
              <Bar dataKey="closed" name="Closed" fill="#1D9E75" radius={[4,4,0,0]}/>
              <Bar dataKey="open"   name="Open"   fill="#EF9F27" radius={[4,4,0,0]}/>
              <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }}/>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── ROW 2: SLA BY PRIORITY + PPM SLA ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

        {/* SLA by Priority */}
        <Section title="SLA Performance by Priority"
          onExport={() => exportCSV('SLA_by_Priority',
            ['Priority','SLA Target','Total WOs','On Time','Breached','SLA Rate %'],
            slaPriority.map(d => [d.name, SLA_HOURS[d.name]+'h', d.total, d.onTime, d.breached, d.rate+'%'])
          )}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={slaPriority} margin={{ left:-10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="name" tick={{ fontSize:12, fill:'var(--text3)' }}/>
              <YAxis tick={{ fontSize:10, fill:'var(--text3)' }}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="onTime"   name="On Time"  fill="#1D9E75" radius={[4,4,0,0]}>
                {slaPriority.map((d,i) => <Cell key={i} fill={P_COLORS[d.name]+'99'}/>)}
              </Bar>
              <Bar dataKey="breached" name="Breached" fill="#E24B4A" radius={[4,4,0,0]}/>
              <Legend wrapperStyle={{ fontSize:11 }}/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
            {slaPriority.map(d => (
              <div key={d.name} style={{ flex:1, minWidth:80, background: d.rate>=80?'var(--green-bg)':d.rate>=60?'var(--amber-bg)':'#fdeaea', border:`1px solid ${d.rate>=80?'var(--green)':d.rate>=60?'var(--amber)':'#E24B4A'}33`, borderRadius:8, padding:'8px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{d.name} (SLA: {SLA_HOURS[d.name]}h)</div>
                <div style={{ fontSize:18, fontWeight:700, color: d.rate>=80?'var(--green)':d.rate>=60?'var(--amber)':'#E24B4A' }}>{d.rate}%</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PPM SLA */}
        <Section title="PPM Schedule SLA"
          onExport={() => exportCSV('PPM_SLA',
            ['Metric','Value'],
            [['Total PPM Tasks', ppmTotal],['Completed', ppmDone],['Overdue', ppmOverdue],['SLA Rate', ppmSLARate+'%']]
          )}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              { label:'Total PPM Tasks', value:ppmTotal,   color:'var(--text)',  bg:'var(--bg3)' },
              { label:'Completed',       value:ppmDone,    color:'var(--green)', bg:'var(--green-bg)' },
              { label:'Overdue',         value:ppmOverdue, color:'#E24B4A',      bg:'#fdeaea' },
              { label:'SLA Rate',        value:ppmSLARate+'%', color: ppmSLARate>=80?'var(--green)':ppmSLARate>=60?'var(--amber)':'#E24B4A', bg:'var(--blue-bg)' },
            ].map(k => (
              <div key={k.label} style={{ background:k.bg, borderRadius:8, padding:'12px', textAlign:'center', border:`1px solid ${k.color}22` }}>
                <div style={{ color:k.color, fontSize:22, fontWeight:700 }}>{k.value}</div>
                <div style={{ color:k.color, fontSize:11, opacity:0.8 }}>{k.label}</div>
              </div>
            ))}
          </div>
          {ppmTotal === 0 ? (
            <div style={{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:20 }}>No PPM tasks scheduled yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <PieChart>
                <Pie data={[{name:'Done',value:ppmDone},{name:'Overdue',value:ppmOverdue},{name:'Pending',value:ppmTotal-ppmDone-ppmOverdue}]}
                  cx="50%" cy="50%" innerRadius={28} outerRadius={45} dataKey="value">
                  <Cell fill="#1D9E75"/><Cell fill="#E24B4A"/><Cell fill="#EF9F27"/>
                </Pie>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{ fontSize:11 }}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* ── TECHNICIAN PERFORMANCE ── */}
      <Section title="Technician Performance"
        onExport={() => exportCSV('Technician_Performance',
          ['Technician','Assigned','Closed','Breached','SLA Rate %','Avg Close Time (hrs)'],
          techPerf.map(t => [t.name, t.assigned, t.closed, t.breached, t.slaRate+'%', t.avgHrs])
        )}>
        {techPerf.length === 0 ? (
          <div style={{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:24 }}>No technician data yet — assign work orders to technicians</div>
        ) : (
          <>
            {/* Table */}
            <div style={{ overflowX:'auto', marginBottom:16 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}>
                    {['Technician','Assigned','Closed','Breached','SLA Rate','Avg Close Time'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', color:'var(--text3)', fontSize:11, fontWeight:500, textAlign:'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {techPerf.map(t => (
                    <tr key={t.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'10px 12px', color:'var(--text)', fontWeight:500 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'#7F77DD', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, flexShrink:0 }}>
                            {t.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                          </div>
                          {t.name}
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', color:'var(--text2)' }}>{t.assigned}</td>
                      <td style={{ padding:'10px 12px', color:'var(--green)' }}>{t.closed}</td>
                      <td style={{ padding:'10px 12px', color:'#E24B4A' }}>{t.breached}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:6, background:'var(--bg3)', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ width:t.slaRate+'%', height:'100%', background: t.slaRate>=80?'var(--green)':t.slaRate>=60?'var(--amber)':'#E24B4A', borderRadius:3, transition:'width 0.5s' }}/>
                          </div>
                          <span style={{ color: t.slaRate>=80?'var(--green)':t.slaRate>=60?'var(--amber)':'#E24B4A', fontSize:12, fontWeight:600, minWidth:36 }}>{t.slaRate}%</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', color:'var(--blue)' }}>{t.avgHrs}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Chart */}
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={techPerf} margin={{ left:-10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text3)' }} tickFormatter={v => v.split(' ')[0]}/>
                <YAxis tick={{ fontSize:10, fill:'var(--text3)' }}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="assigned" name="Assigned" fill="#7F77DD" radius={[4,4,0,0]}/>
                <Bar dataKey="closed"   name="Closed"   fill="#1D9E75" radius={[4,4,0,0]}/>
                <Bar dataKey="breached" name="Breached"  fill="#E24B4A" radius={[4,4,0,0]}/>
                <Legend wrapperStyle={{ fontSize:11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Section>

      {/* ── MONTHLY TREND ── */}
      <Section title="Monthly Trend (last 6 months)"
        onExport={() => exportCSV('Monthly_Trend',
          ['Month','Total','Closed','Breached'],
          months.map(m => [m.name, m.total, m.closed, m.breached])
        )}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={months} margin={{ left:-10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
            <XAxis dataKey="name" tick={{ fontSize:12, fill:'var(--text3)' }}/>
            <YAxis tick={{ fontSize:10, fill:'var(--text3)' }}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Line type="monotone" dataKey="total"    name="Total"    stroke="#378ADD" strokeWidth={2} dot={{ r:4 }}/>
            <Line type="monotone" dataKey="closed"   name="Closed"   stroke="#1D9E75" strokeWidth={2} dot={{ r:4 }}/>
            <Line type="monotone" dataKey="breached" name="Breached" stroke="#E24B4A" strokeWidth={2} dot={{ r:4 }} strokeDasharray="4 2"/>
            <Legend wrapperStyle={{ fontSize:11 }}/>
          </LineChart>
        </ResponsiveContainer>
      </Section>

    </div>
  )
}
