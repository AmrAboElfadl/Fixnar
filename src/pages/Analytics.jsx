import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid, LabelList
} from 'recharts'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const SLA_HOURS = { P1:4, P2:8, P3:12, P4:63 }
const STATUS_COLORS = {
  open:'#EF9F27', travelling:'#378ADD', arrived:'#7F77DD',
  in_progress:'#1D9E75', on_hold:'#E24B4A', completed:'#1D9E75', closed:'#6b7280'
}
const CAT_COLORS = ['#378ADD','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#E85D8A','#20B2AA','#FF8C00']

function exportCSV(filename, headers, rows) {
  const csv = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(c => '"' + String(c ?? '').replace(/"/g,'""') + '"').join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function getSLADeadline(priority, createdAt) {
  const hours = SLA_HOURS[priority] || 8
  let cursor = new Date(createdAt)
  let remaining = hours * 60
  while (remaining > 0) {
    const h = cursor.getHours()
    if (h < 9) cursor.setHours(9,0,0,0)
    else if (h >= 18) { cursor.setDate(cursor.getDate()+1); cursor.setHours(9,0,0,0) }
    const dayEnd = new Date(cursor); dayEnd.setHours(18,0,0,0)
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

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', fontSize:12, boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ color:'var(--text)', fontWeight:600, marginBottom:6, fontSize:13 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:p.color || p.fill }}/>
          <span style={{ color:'var(--text2)' }}>{p.name}:</span>
          <span style={{ color:'var(--text)', fontWeight:600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function FilterBar({ filters, onChange, options }) {
  const sel = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 9px', color:'var(--text)', fontSize:11, cursor:'pointer', outline:'none' }
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'10px 14px', background:'var(--bg3)', borderRadius:8, marginBottom:14, alignItems:'center' }}>
      <span style={{ color:'var(--text3)', fontSize:11, fontWeight:500 }}>🔍 Filter:</span>
      {options.map(opt => (
        <div key={opt.key} style={{ display:'flex', alignItems:'center', gap:4 }}>
          <label style={{ color:'var(--text3)', fontSize:11 }}>{opt.label}</label>
          <select value={filters[opt.key] || 'all'} onChange={e => onChange(opt.key, e.target.value)} style={sel}>
            <option value="all">All</option>
            {opt.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      ))}
      {Object.values(filters).some(v => v && v !== 'all') && (
        <button onClick={() => onChange('__reset__', null)}
          style={{ background:'transparent', color:'#E24B4A', border:'1px solid #E24B4A', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>
          ✕ Clear
        </button>
      )}
    </div>
  )
}

function Section({ title, subtitle, onExport, children }) {
  return (
    <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:14, padding:22, marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
        <div>
          <h2 style={{ color:'var(--text)', fontSize:15, fontWeight:600, margin:0 }}>{title}</h2>
          {subtitle && <p style={{ color:'var(--text3)', fontSize:12, margin:'3px 0 0' }}>{subtitle}</p>}
        </div>
        {onExport && (
          <button onClick={onExport}
            style={{ background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green)', borderRadius:7, padding:'5px 12px', fontSize:11, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
            📥 Export to Excel
          </button>
        )}
      </div>
      <div style={{ height:1, background:'var(--border)', margin:'12px 0' }}/>
      {children}
    </div>
  )
}

export default function Analytics() {
  const [wos,     setWos]     = useState([])
  const [techs,   setTechs]   = useState([])
  const [ppms,    setPpms]    = useState([])
  const [stores,  setStores]  = useState([])
  const [loading, setLoading] = useState(true)

  // Global period filter
  const [period, setPeriod] = useState('month')

  // Per-section filters
  const [catFilters,    setCatFilters]    = useState({})
  const [branchFilters, setBranchFilters] = useState({})
  const [techFilters,   setTechFilters]   = useState({})
  const [slaFilters,    setSlaFilters]    = useState({})
  const [trendFilters,  setTrendFilters]  = useState({})

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
      try {
        const ppmRes = await supabase.from('ppm_tasks').select('*').order('due_date')
        setPpms(ppmRes.data || [])
      } catch { setPpms([]) }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  // Period filter
  const periodStart = useMemo(() => {
    const now = new Date()
    if (period === 'week')  return new Date(now.getFullYear(), now.getMonth(), now.getDate()-7)
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (period === '3month') return new Date(now.getFullYear(), now.getMonth()-3, 1)
    return new Date(0)
  }, [period])

  const filtered = useMemo(() => wos.filter(w => new Date(w.created_at) >= periodStart), [wos, periodStart])

  // Derived lists for filter options
  const storeOptions = useMemo(() => stores.map(s => ({ value:s.id, label:s.name.split('-').pop().trim() })), [stores])
  const techOptions  = useMemo(() => techs.map(t => ({ value:t.id, label:t.full_name })), [techs])
  const catOptions   = useMemo(() => {
    const cats = [...new Set(filtered.map(w => w.title?.split('—')[0]?.trim()).filter(Boolean))]
    return cats.map(c => ({ value:c, label:c }))
  }, [filtered])

  function applyFilter(data, filters, storeFn, techFn, catFn) {
    return data.filter(w => {
      if (filters.store && filters.store !== 'all' && w.store_id !== filters.store) return false
      if (filters.tech  && filters.tech  !== 'all' && w.assigned_to !== filters.tech) return false
      if (filters.priority && filters.priority !== 'all' && w.priority !== filters.priority) return false
      if (filters.status && filters.status !== 'all' && w.status !== filters.status) return false
      if (filters.category && filters.category !== 'all') {
        const cat = w.title?.split('—')[0]?.trim()
        if (cat !== filters.category) return false
      }
      return true
    })
  }

  function handleFilter(section, key, value) {
    const setter = { cat:setCatFilters, branch:setBranchFilters, tech:setTechFilters, sla:setSlaFilters, trend:setTrendFilters }[section]
    if (key === '__reset__') { setter({}); return }
    setter(prev => ({ ...prev, [key]: value }))
  }

  // ── 1. CATEGORY DATA ──
  const catData = useMemo(() => {
    const d = applyFilter(filtered, catFilters)
    const map = {}
    d.forEach(w => {
      const cat = w.title?.split('—')[0]?.trim() || 'Unknown'
      if (!map[cat]) map[cat] = { name:cat, total:0, closed:0, open:0, breached:0, inProgress:0 }
      map[cat].total++
      if (w.status === 'closed' || w.status === 'completed') map[cat].closed++
      if (['open','travelling','arrived'].includes(w.status)) map[cat].open++
      if (w.status === 'in_progress') map[cat].inProgress++
      if (isSLABreached(w)) map[cat].breached++
    })
    return Object.values(map).sort((a,b) => b.total - a.total)
  }, [filtered, catFilters])

  // ── 2. BRANCH DATA ──
  const branchData = useMemo(() => {
    const d = applyFilter(filtered, branchFilters)
    const map = {}
    d.forEach(w => {
      const name = w.stores?.name || 'Unknown'
      const short = name.split('-').pop().trim()
      if (!map[name]) map[name] = { name:short, fullName:name, total:0, closed:0, open:0, breached:0 }
      map[name].total++
      if (['closed','completed'].includes(w.status)) map[name].closed++
      if (['open','travelling','arrived','in_progress'].includes(w.status)) map[name].open++
      if (isSLABreached(w)) map[name].breached++
    })
    return Object.values(map).sort((a,b) => b.total - a.total)
  }, [filtered, branchFilters])

  const topBranch = branchData[0]

  // ── 3. TECH PERFORMANCE DATA ──
  const techPerfData = useMemo(() => {
    const d = applyFilter(filtered, techFilters)
    const map = {}
    techs.forEach(t => { map[t.id] = { id:t.id, name:t.full_name, assigned:0, closed:0, breached:0, closedHrs:0 } })
    d.forEach(w => {
      if (!w.assigned_to || !map[w.assigned_to]) return
      const t = map[w.assigned_to]
      t.assigned++
      if (['closed','completed'].includes(w.status)) {
        t.closed++
        if (w.closed_at && w.created_at) t.closedHrs += (new Date(w.closed_at)-new Date(w.created_at))/3600000
      }
      if (isSLABreached(w)) t.breached++
    })
    return Object.values(map).map(t => ({
      ...t,
      slaRate: t.assigned > 0 ? Math.round(((t.assigned-t.breached)/t.assigned)*100) : 100,
      avgHrs:  t.closed > 0 ? Math.round(t.closedHrs/t.closed*10)/10 : 0,
      closureRate: t.assigned > 0 ? Math.round((t.closed/t.assigned)*100) : 0,
    })).filter(t => t.assigned > 0).sort((a,b) => b.slaRate-a.slaRate)
  }, [filtered, techFilters, techs])

  // ── 4. SLA BY PRIORITY ──
  const slaData = useMemo(() => {
    const d = applyFilter(filtered, slaFilters)
    return ['P1','P2','P3','P4'].map(p => {
      const pWOs = d.filter(w => w.priority === p)
      const breached = pWOs.filter(w => isSLABreached(w)).length
      return {
        name: p,
        label: `${p} (${SLA_HOURS[p]}h SLA)`,
        total: pWOs.length,
        onTime: pWOs.length - breached,
        breached,
        rate: pWOs.length > 0 ? Math.round(((pWOs.length-breached)/pWOs.length)*100) : 100,
      }
    }).filter(d => d.total > 0)
  }, [filtered, slaFilters])

  // ── 5. MONTHLY TREND ──
  const trendData = useMemo(() => {
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1)
      const mEnd   = new Date(d.getFullYear(), d.getMonth()+1, 1)
      const label  = d.toLocaleString('default', { month:'short', year:'2-digit' })
      let mWOs = wos.filter(w => {
        const c = new Date(w.created_at)
        return c >= mStart && c < mEnd
      })
      mWOs = applyFilter(mWOs, trendFilters)
      months.push({
        name:     label,
        total:    mWOs.length,
        closed:   mWOs.filter(w => ['closed','completed'].includes(w.status)).length,
        open:     mWOs.filter(w => ['open','travelling','arrived'].includes(w.status)).length,
        breached: mWOs.filter(w => isSLABreached(w)).length,
        P1:       mWOs.filter(w => w.priority==='P1').length,
        P2:       mWOs.filter(w => w.priority==='P2').length,
      })
    }
    return months
  }, [wos, trendFilters])

  // ── KPI SUMMARY ──
  const kpis = useMemo(() => {
    const total    = filtered.length
    const closed   = filtered.filter(w => ['closed','completed'].includes(w.status)).length
    const breached = filtered.filter(w => isSLABreached(w)).length
    const slaRate  = total > 0 ? Math.round(((total-breached)/total)*100) : 100
    const closedWOs = filtered.filter(w => ['closed','completed'].includes(w.status) && w.closed_at && w.created_at)
    const avgHrs = closedWOs.length > 0
      ? Math.round(closedWOs.reduce((s,w) => s+(new Date(w.closed_at)-new Date(w.created_at))/3600000, 0)/closedWOs.length)
      : 0
    const unassigned = filtered.filter(w => !w.assigned_to).length
    return { total, closed, breached, slaRate, avgHrs, unassigned }
  }, [filtered])

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:7, padding:'6px 10px', color:'var(--text)', fontSize:12, cursor:'pointer', outline:'none' }

  if (loading) return <div style={{ color:'var(--text3)', padding:48, textAlign:'center', fontFamily:"'DM Sans', sans-serif" }}>Loading analytics...</div>

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'var(--text)', fontSize:22, fontWeight:600, margin:0 }}>Analytics</h1>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>
            {kpis.total} work orders · {techs.length} technicians · {stores.length} branches
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ color:'var(--text3)', fontSize:12 }}>Show data for:</span>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...inp, fontWeight:500 }}>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="3month">Last 3 months</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total Work Orders', value:kpis.total,       sub:'in selected period',        color:'var(--blue)',  bg:'var(--blue-bg)' },
          { label:'Closed / Completed', value:kpis.closed,     sub:`${kpis.total>0?Math.round(kpis.closed/kpis.total*100):0}% closure rate`, color:'var(--green)', bg:'var(--green-bg)' },
          { label:'SLA Compliance',    value:kpis.slaRate+'%', sub:'of WOs within SLA target',  color:kpis.slaRate>=80?'var(--green)':kpis.slaRate>=60?'var(--amber)':'#E24B4A', bg:kpis.slaRate>=80?'var(--green-bg)':kpis.slaRate>=60?'var(--amber-bg)':'#fdeaea' },
          { label:'SLA Breached',      value:kpis.breached,    sub:'exceeded response time',    color:'#E24B4A',      bg:'#fdeaea' },
          { label:'Avg Close Time',    value:kpis.avgHrs+'h',  sub:'from open to closed',       color:'var(--purple)', bg:'#f3f0ff' },
          { label:'Unassigned WOs',    value:kpis.unassigned,  sub:'need technician assignment',color:kpis.unassigned>0?'var(--amber)':'var(--green)', bg:kpis.unassigned>0?'var(--amber-bg)':'var(--green-bg)' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.color}33`, borderRadius:12, padding:'14px 12px' }}>
            <div style={{ color:k.color, fontSize:26, fontWeight:700 }}>{k.value}</div>
            <div style={{ color:k.color, fontSize:12, fontWeight:500, marginTop:2 }}>{k.label}</div>
            <div style={{ color:k.color, fontSize:10, opacity:0.7, marginTop:3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 1. CATEGORY ── */}
      <Section
        title="Work Orders by Category"
        subtitle={`${catData.length} categories · most reported: ${catData[0]?.name || '—'} (${catData[0]?.total || 0} WOs)`}
        onExport={() => exportCSV('WO_Category', ['Category','Total','Closed','Open','In Progress','SLA Breached','SLA Rate %'],
          catData.map(d => [d.name, d.total, d.closed, d.open, d.inProgress, d.breached, d.total>0?Math.round(((d.total-d.breached)/d.total)*100)+'%':'N/A']))}>
        <FilterBar filters={catFilters} onChange={(k,v) => handleFilter('cat',k,v)}
          options={[
            { key:'priority', label:'Priority', choices:[{value:'P1',label:'P1 Critical'},{value:'P2',label:'P2 High'},{value:'P3',label:'P3 Medium'},{value:'P4',label:'P4 Low'}] },
            { key:'store',    label:'Branch',   choices:storeOptions },
            { key:'status',   label:'Status',   choices:[{value:'open',label:'Open'},{value:'in_progress',label:'In Progress'},{value:'closed',label:'Closed'},{value:'on_hold',label:'On Hold'}] },
          ]}/>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={catData} margin={{ left:-10, bottom:30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="name" tick={{ fontSize:10, fill:'var(--text3)' }} angle={-20} textAnchor="end" interval={0}/>
            <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} allowDecimals={false}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend wrapperStyle={{ fontSize:11, paddingTop:10 }}/>
            <Bar dataKey="total"      name="Total"       fill="#378ADD" radius={[4,4,0,0]}>
              {catData.map((_,i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]}/>)}
              <LabelList dataKey="total" position="top" style={{ fontSize:10, fill:'var(--text3)' }}/>
            </Bar>
            <Bar dataKey="closed"     name="Closed ✓"    fill="#1D9E75" radius={[4,4,0,0]}/>
            <Bar dataKey="breached"   name="SLA Breached" fill="#E24B4A" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── 2. BRANCH ── */}
      <Section
        title="Work Orders by Branch"
        subtitle={topBranch ? `🏆 Highest volume: ${topBranch.fullName} — ${topBranch.total} WOs this period` : 'No data yet'}
        onExport={() => exportCSV('WO_Branch', ['Branch','Total','Closed','Open','SLA Breached','Closure Rate %'],
          branchData.map(d => [d.fullName, d.total, d.closed, d.open, d.breached, d.total>0?Math.round(d.closed/d.total*100)+'%':'0%']))}>
        <FilterBar filters={branchFilters} onChange={(k,v) => handleFilter('branch',k,v)}
          options={[
            { key:'priority', label:'Priority', choices:[{value:'P1',label:'P1'},{value:'P2',label:'P2'},{value:'P3',label:'P3'},{value:'P4',label:'P4'}] },
            { key:'tech',     label:'Technician', choices:techOptions },
            { key:'status',   label:'Status', choices:[{value:'open',label:'Open'},{value:'closed',label:'Closed'},{value:'on_hold',label:'On Hold'}] },
          ]}/>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={branchData} margin={{ left:-10, bottom:50 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
            <XAxis type="number" tick={{ fontSize:10, fill:'var(--text3)' }} allowDecimals={false}/>
            <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:'var(--text3)' }} width={90}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend wrapperStyle={{ fontSize:11 }}/>
            <Bar dataKey="total"    name="Total"       fill="#7F77DD" radius={[0,4,4,0]}>
              <LabelList dataKey="total" position="right" style={{ fontSize:10, fill:'var(--text3)' }}/>
            </Bar>
            <Bar dataKey="closed"   name="Closed ✓"    fill="#1D9E75" radius={[0,4,4,0]}/>
            <Bar dataKey="breached" name="SLA Breached" fill="#E24B4A" radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── 3. TECHNICIAN PERFORMANCE ── */}
      <Section
        title="Technician Performance"
        subtitle="SLA compliance rate, closure rate, and average resolution time per technician"
        onExport={() => exportCSV('Technician_Performance',
          ['Technician','Assigned','Closed','SLA Breached','SLA Rate %','Closure Rate %','Avg Close Time (hrs)'],
          techPerfData.map(t => [t.name, t.assigned, t.closed, t.breached, t.slaRate+'%', t.closureRate+'%', t.avgHrs]))}>
        <FilterBar filters={techFilters} onChange={(k,v) => handleFilter('tech',k,v)}
          options={[
            { key:'priority', label:'Priority', choices:[{value:'P1',label:'P1'},{value:'P2',label:'P2'},{value:'P3',label:'P3'},{value:'P4',label:'P4'}] },
            { key:'store',    label:'Branch',   choices:storeOptions },
            { key:'category', label:'Category', choices:catOptions },
          ]}/>
        {techPerfData.length === 0 ? (
          <div style={{ color:'var(--text3)', fontSize:13, textAlign:'center', padding:32 }}>
            No technician data yet — assign work orders to technicians first
          </div>
        ) : (
          <>
            {/* Scorecards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:10, marginBottom:16 }}>
              {techPerfData.map(t => (
                <div key={t.id} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background:'#7F77DD', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, flexShrink:0 }}>
                      {t.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{t.name}</div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {[
                      { label:'Assigned',  value:t.assigned,         color:'var(--blue)' },
                      { label:'Closed',    value:t.closed,           color:'var(--green)' },
                      { label:'Breached',  value:t.breached,         color:'#E24B4A' },
                      { label:'Avg Time',  value:t.avgHrs+'h',       color:'var(--text2)' },
                    ].map(k => (
                      <div key={k.label} style={{ background:'var(--card-bg)', borderRadius:7, padding:'6px 8px' }}>
                        <div style={{ color:k.color, fontSize:15, fontWeight:700 }}>{k.value}</div>
                        <div style={{ color:'var(--text3)', fontSize:10 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* SLA bar */}
                  <div style={{ marginTop:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ color:'var(--text3)', fontSize:10 }}>SLA Rate</span>
                      <span style={{ color:t.slaRate>=80?'var(--green)':t.slaRate>=60?'var(--amber)':'#E24B4A', fontSize:11, fontWeight:600 }}>{t.slaRate}%</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                      <div style={{ width:t.slaRate+'%', height:'100%', background:t.slaRate>=80?'var(--green)':t.slaRate>=60?'var(--amber)':'#E24B4A', borderRadius:3, transition:'width 0.5s' }}/>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
                      <span style={{ color:'var(--text3)', fontSize:10 }}>Closure Rate</span>
                      <span style={{ color:'var(--text2)', fontSize:11, fontWeight:600 }}>{t.closureRate}%</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                      <div style={{ width:t.closureRate+'%', height:'100%', background:'var(--blue)', borderRadius:3, transition:'width 0.5s' }}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Chart */}
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={techPerfData} margin={{ left:-10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text3)' }} tickFormatter={v => v.split(' ')[0]}/>
                <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} allowDecimals={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="assigned" name="Assigned" fill="#7F77DD" radius={[4,4,0,0]}>
                  <LabelList dataKey="assigned" position="top" style={{ fontSize:10, fill:'var(--text3)' }}/>
                </Bar>
                <Bar dataKey="closed"   name="Closed"   fill="#1D9E75" radius={[4,4,0,0]}/>
                <Bar dataKey="breached" name="Breached"  fill="#E24B4A" radius={[4,4,0,0]}/>
                <Legend wrapperStyle={{ fontSize:11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Section>

      {/* ── 4. SLA BY PRIORITY ── */}
      <Section
        title="SLA Performance by Priority"
        subtitle="Each priority has a fixed SLA target — P1=4h, P2=8h, P3=12h, P4=7 days (working hours only)"
        onExport={() => exportCSV('SLA_Priority', ['Priority','SLA Target','Total WOs','On Time','Breached','SLA Rate %'],
          slaData.map(d => [d.name, SLA_HOURS[d.name]+'h', d.total, d.onTime, d.breached, d.rate+'%']))}>
        <FilterBar filters={slaFilters} onChange={(k,v) => handleFilter('sla',k,v)}
          options={[
            { key:'store', label:'Branch',     choices:storeOptions },
            { key:'tech',  label:'Technician', choices:techOptions },
            { key:'status',label:'Status',     choices:[{value:'open',label:'Open'},{value:'closed',label:'Closed'}] },
          ]}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={slaData} margin={{ left:-10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{ fontSize:10, fill:'var(--text3)' }}/>
              <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} allowDecimals={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="onTime"   name="On Time ✓"   radius={[4,4,0,0]}>
                {slaData.map((d,i) => <Cell key={i} fill={P_COLORS[d.name]+'aa'}/>)}
                <LabelList dataKey="onTime" position="top" style={{ fontSize:10, fill:'var(--text3)' }}/>
              </Bar>
              <Bar dataKey="breached" name="Breached ✗"  fill="#E24B4A" radius={[4,4,0,0]}/>
              <Legend wrapperStyle={{ fontSize:11 }}/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:10, justifyContent:'center' }}>
            {slaData.map(d => (
              <div key={d.name} style={{ background:'var(--bg3)', borderRadius:10, padding:'12px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div>
                    <span style={{ background:P_COLORS[d.name]+'22', color:P_COLORS[d.name], fontSize:12, padding:'2px 8px', borderRadius:6, fontWeight:700, marginRight:8 }}>{d.name}</span>
                    <span style={{ color:'var(--text3)', fontSize:11 }}>SLA: {SLA_HOURS[d.name] >= 24 ? Math.floor(SLA_HOURS[d.name]/9)+ ' days' : SLA_HOURS[d.name]+'h'}</span>
                  </div>
                  <span style={{ color:d.rate>=80?'var(--green)':d.rate>=60?'var(--amber)':'#E24B4A', fontSize:16, fontWeight:700 }}>{d.rate}%</span>
                </div>
                <div style={{ height:8, background:'var(--border)', borderRadius:4 }}>
                  <div style={{ width:d.rate+'%', height:'100%', background:d.rate>=80?'var(--green)':d.rate>=60?'var(--amber)':'#E24B4A', borderRadius:4, transition:'width 0.5s' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11, color:'var(--text3)' }}>
                  <span>✓ {d.onTime} on time</span>
                  <span>✗ {d.breached} breached</span>
                  <span>∑ {d.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 5. MONTHLY TREND ── */}
      <Section
        title="Monthly Trend — Last 12 Months"
        subtitle="Track total work orders, closures, and SLA breaches over time to spot patterns and improvements"
        onExport={() => exportCSV('Monthly_Trend', ['Month','Total','Closed','Open','SLA Breached','P1 Critical','P2 High'],
          trendData.map(m => [m.name, m.total, m.closed, m.open, m.breached, m.P1, m.P2]))}>
        <FilterBar filters={trendFilters} onChange={(k,v) => handleFilter('trend',k,v)}
          options={[
            { key:'store',    label:'Branch',     choices:storeOptions },
            { key:'tech',     label:'Technician', choices:techOptions },
            { key:'priority', label:'Priority',   choices:[{value:'P1',label:'P1'},{value:'P2',label:'P2'},{value:'P3',label:'P3'},{value:'P4',label:'P4'}] },
          ]}/>
        {/* Explain the chart */}
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          {[
            { color:'#378ADD', label:'Total WOs created that month' },
            { color:'#1D9E75', label:'Closed/completed that month' },
            { color:'#EF9F27', label:'Still open that month' },
            { color:'#E24B4A', label:'SLA breached (dashed)' },
          ].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--text3)' }}>
              <div style={{ width:24, height:3, background:l.color, borderRadius:2 }}/>
              {l.label}
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trendData} margin={{ left:-10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text3)' }}/>
            <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} allowDecimals={false}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Line type="monotone" dataKey="total"    name="Total"         stroke="#378ADD" strokeWidth={2.5} dot={{ r:4, fill:'#378ADD' }} activeDot={{ r:6 }}/>
            <Line type="monotone" dataKey="closed"   name="Closed"        stroke="#1D9E75" strokeWidth={2.5} dot={{ r:4, fill:'#1D9E75' }} activeDot={{ r:6 }}/>
            <Line type="monotone" dataKey="open"     name="Open"          stroke="#EF9F27" strokeWidth={2} dot={{ r:3 }}/>
            <Line type="monotone" dataKey="breached" name="SLA Breached"  stroke="#E24B4A" strokeWidth={2} dot={{ r:3 }} strokeDasharray="5 3"/>
            <Line type="monotone" dataKey="P1"       name="P1 Critical"   stroke="#E24B4A" strokeWidth={1.5} dot={{ r:3 }} strokeDasharray="2 4"/>
            <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }}/>
          </LineChart>
        </ResponsiveContainer>
        {/* Insight note */}
        <div style={{ marginTop:12, background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--blue)' }}>
          💡 <strong>How to read this:</strong> When "Total" is high but "Closed" is low, your team has a backlog. When "SLA Breached" rises, response times are slipping. A healthy month shows Total ≈ Closed and Breached near zero.
        </div>
      </Section>

    </div>
  )
}
