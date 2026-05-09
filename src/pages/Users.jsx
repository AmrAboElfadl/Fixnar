import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLES = ['admin','technician','operations']
const ROLE_COLORS = { admin:'#1D9E75', technician:'#378ADD', operations:'#7F77DD' }
const EMPTY = { full_name:'', email:'', role:'operations', store_id:'', phone:'' }

export default function Users() {
  const [profiles, setProfiles] = useState([])
  const [stores, setStores]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [pRes, sRes] = await Promise.all([
      supabase.from('profiles').select('*,stores(name)').order('created_at'),
      supabase.from('stores').select('id,name'),
    ])
    setProfiles(pRes.data || [])
    setStores(sRes.data || [])
    setLoading(false)
  }

  async function handleInvite() {
    setSaving(true); setMsg('')
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(form.email)
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }
    setMsg('Invite sent! User will receive an email to set their password.')
    setShowForm(false); setForm(EMPTY)
    setSaving(false)
  }

  async function updateRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    fetchAll()
  }

  async function updateStore(id, store_id) {
    await supabase.from('profiles').update({ store_id }).eq('id', id)
    fetchAll()
  }

  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'9px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>Users & Access</h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>Manage team roles and restaurant access</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + Invite User
        </button>
      </div>

      {msg && (
        <div style={{ background:'#1d2f26', border:'1px solid #1D9E75', borderRadius:8, padding:'12px 16px', marginBottom:16, color:'#1D9E75', fontSize:13 }}>{msg}</div>
      )}

      {showForm && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
          <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 16px' }}>Invite New User</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Full Name *</label>
              <input style={inp} value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} placeholder="Full name"/>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Email *</label>
              <input type="email" style={inp} value={form.email} onChange={e => setForm({...form, email:e.target.value})} placeholder="user@company.com"/>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Role *</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                <option value="admin">Admin — full access</option>
                <option value="technician">Technician — schedule + map</option>
                <option value="operations">Operations — per restaurant</option>
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Assigned Store</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.store_id} onChange={e => setForm({...form, store_id:e.target.value})}>
                <option value="">All stores / Not assigned</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop:6, padding:'10px 14px', background:'#1a2b3c', borderRadius:8, color:'#378ADD', fontSize:12 }}>
            ℹ An email invitation will be sent. The user sets their own password on first login.
          </div>
          <div style={{ display:'flex', gap:10, marginTop:14 }}>
            <button onClick={handleInvite} disabled={saving||!form.email||!form.full_name} style={{ background:saving?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {saving ? 'Sending...' : 'Send Invitation'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY) }} style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>Loading users...</div>
        ) : profiles.map(p => {
          const initials = (p.full_name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
          const rc = ROLE_COLORS[p.role] || '#6b7280'
          return (
            <div key={p.id} style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background: rc, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:600, flexShrink:0 }}>
                {initials}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'#e6edf3', fontSize:14, fontWeight:500 }}>{p.full_name || 'Unnamed'}</div>
                <div style={{ color:'#6b7280', fontSize:12 }}>{p.email || '—'}</div>
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
                <select value={p.role || 'operations'} onChange={e => updateRole(p.id, e.target.value)}
                  style={{ background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'6px 10px', color: rc, fontSize:12, cursor:'pointer', fontWeight:500 }}>
                  {ROLES.map(r => <option key={r} value={r} style={{ color:'#e6edf3' }}>{r}</option>)}
                </select>
                <select value={p.store_id || ''} onChange={e => updateStore(p.id, e.target.value)}
                  style={{ background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'6px 10px', color:'#8b949e', fontSize:12, cursor:'pointer' }}>
                  <option value="">All stores</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
