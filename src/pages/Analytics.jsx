import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

const COLORS = { P1:'#f85149', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }

export default function Analytics() {
  const [wos, setWos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('work_orders').select('*,stores(name)').then(({ data }) => {
      setWos(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ color:'#6b7280', padding:40, textAlign:'center' }}>Loading analytics...</div>

  // By priority
  const byPriority = ['P1','P2','P3','P4'].map(p => ({
    name: p,
    total: wos.filter(w => w.priority === p).length,
    open:  wos.filter(w => w.priority === p && w.status === 'open').length,
    done:  wos.filter(w => w.priority === p && w.status === 'closed').length,
  }))

  // By status
  const byStatus = ['open','in_progress','on_hold','closed'].map(s => ({
    name: s.replace('_',' '),
    value: wos.filter(w => w.status === s).length,
  })).filter(d => d.value > 0)

  // By store
  const storeMap = {}
  wos.forEach(w => {
    const name = w.stores?.name || 'Unknown'
    storeMap[name] = (storeMap[name] || 0) + 1
  })
  const byStore = Object.entries(storeMap).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count)

  // SLA compliance
  const totalClosed = wos.filter(w => w.status === 'closed').length
  const slaCompliance = totalClosed > 0 ? Math.round((totalClosed / wos.length) * 100) : 0

  // Monthly trend (last 6 months)
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const label = d.toLocaleString('default', { month:'short' })
    const year = d.getFullYear(); const month = d.getMonth()
    months.push({
      name: label,
      created: wos.filter(w => { const c = new Date(w.created_at); return c.getMonth()===month && c.getFullYear()===year }).length,
    })
  }

  const chartTooltip = { contentStyle:{ background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:12 }, labelStyle:{ color:'#e6edf3' }, itemStyle:{ color:'#8b949e' } }

  const Card = ({ title, children }) => (
    <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:20 }}>
      <h3 style={{ color:'#e6edf3', fontSize:14, fontWeight:500, margin:'0 0 16px' }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>Analytics</h1>
        <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>Performance overview and SLA compliance</p>
      </div>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total WOs', value: wos.length, color:'#e6edf3' },
          { label:'SLA Compliance', value: `${slaCompliance}%`, color:'#1D9E75' },
          { label:'Open P1/P2', value: wos.filter(w=>['P1','P2'].includes(w.priority)&&w.status==='open').length, color:'#f85149' },
          { label:'Avg Resolution', value: `—`, color:'#EF9F27' },
        ].map(k => (
          <div key={k.label} style={{ background:'#0d1117', border:'1px solid #21262d', borderRadius:12, padding:'16px' }}>
            <div style={{ color:'#6b7280', fontSize:12, marginBottom:6 }}>{k.label}</div>
            <div style={{ color: k.color, fontSize:26, fontWeight:600 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Card title="Work orders by priority">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byPriority} barSize={32}>
              <XAxis dataKey="name" tick={{ fill:'#8b949e', fontSize:12 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#8b949e', fontSize:12 }} axisLine={false} tickLine={false}/>
              <Tooltip {...chartTooltip}/>
              <Bar dataKey="total" fill="#378ADD" radius={[4,4,0,0]}>
                {byPriority.map(d => <Cell key={d.name} fill={COLORS[d.name]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Work orders by status">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                {byStatus.map((_, i) => <Cell key={i} fill={['#EF9F27','#378ADD','#6b7280','#1D9E75'][i % 4]}/>)}
              </Pie>
              <Tooltip {...chartTooltip}/>
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
        <Card title="Monthly work order trend">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={months}>
              <XAxis dataKey="name" tick={{ fill:'#8b949e', fontSize:12 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#8b949e', fontSize:12 }} axisLine={false} tickLine={false}/>
              <Tooltip {...chartTooltip}/>
              <Line type="monotone" dataKey="created" stroke="#1D9E75" strokeWidth={2} dot={{ fill:'#1D9E75', r:4 }}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Work orders by store">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {byStore.slice(0,6).map(s => (
              <div key={s.name}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ color:'#8b949e', fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{s.name}</span>
                  <span style={{ color:'#e6edf3', fontSize:12, fontWeight:500 }}>{s.count}</span>
                </div>
                <div style={{ height:4, background:'#21262d', borderRadius:2 }}>
                  <div style={{ height:'100%', width:`${(s.count / (byStore[0]?.count||1)) * 100}%`, background:'#1D9E75', borderRadius:2 }}/>
                </div>
              </div>
            ))}
            {byStore.length === 0 && <div style={{ color:'#6b7280', fontSize:13 }}>No data yet</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
