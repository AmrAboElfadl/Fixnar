import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROLES = ['admin', 'technician', 'operations', 'viewer']
const ROLE_COLORS = {
  admin:      { bg:'#E24B4A22', text:'#E24B4A', border:'#E24B4A' },
  technician: { bg:'#7F77DD22', text:'#7F77DD', border:'#7F77DD' },
  operations: { bg:'#EF9F2722', text:'#EF9F27', border:'#EF9F27' },
  viewer:     { bg:'#9e9e9e22', text:'#9e9e9e', border:'#9e9e9e' },
}

// ── Store picker component (multi-select checkboxes) ─────────────────────────
function StorePicker({ stores, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = stores.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
  const label = selected.length === 0
    ? 'All stores'
    : selected.length === stores.length
    ? 'All stores'
    : selected.length === 1
    ? stores.find(s => s.id === selected[0])?.name
    : `${selected.length} stores`

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  function toggleAll() {
    onChange(selected.length === stores.length ? [] : stores.map(s => s.id))
  }

  return (
    <div style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:'100%', padding:'8px 12px', borderRadius:9,
          border:'1px solid var(--border)', background:'var(--bg)',
          color:'var(--text)', fontSize:13, cursor:'pointer',
          display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
          textAlign:'left',
        }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {label}
        </span>
        <span style={{ flexShrink:0, color:'var(--text3)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:100 }}/>
          <div style={{
            position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:200,
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.2)',
            maxHeight:280, display:'flex', flexDirection:'column',
          }}>
            {/* Search */}
            <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search stores…" autoFocus
                style={{ width:'100%', padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:12, boxSizing:'border-box' }}
              />
            </div>
            {/* Select all */}
            <button onClick={toggleAll} style={{ padding:'8px 12px', textAlign:'left', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', fontSize:12, color:'var(--green)', fontWeight:600 }}>
              {selected.length === stores.length ? '☑ Deselect all' : '☐ Select all stores'}
            </button>
            {/* Store list */}
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.map(s => {
                const checked = selected.includes(s.id)
                return (
                  <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', background: checked ? 'var(--green)11' : 'transparent' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} style={{ accentColor:'var(--green)', width:15, height:15, flexShrink:0 }}/>
                    <span style={{ fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
                  </label>
                )
              })}
              {filtered.length === 0 && <div style={{ padding:'12px', color:'var(--text3)', fontSize:12 }}>No stores found</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Users() {
  const { profile: me } = useAuth()

  const [users,      setUsers]      = useState([])
  const [stores,     setStores]     = useState([])
  const [userStores, setUserStores] = useState({}) // { userId: [storeId, ...] }
  const [loading,    setLoading]    = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [editUser,   setEditUser]   = useState(null)
  const [editStores, setEditStores] = useState([])
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [msg,        setMsg]        = useState({ text:'', type:'' })
  const [sqlFallback,setSqlFallback]= useState('')

  // Invite form state
  const [form, setForm] = useState({ email:'', name:'', role:'technician', password:'Fixnar2024!' })
  const [inviteStores, setInviteStores] = useState([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const uRes = await supabase.from('profiles').select('*').order('full_name')
      const userData = uRes.data || []
      setUsers(userData)

      const sRes = await supabase.from('stores').select('id,name').order('name')
      setStores(sRes.data || [])

      const map = {}
      try {
        const usRes = await supabase.from('user_stores').select('user_id,store_id')
        if (usRes.data) {
          usRes.data.forEach(({ user_id, store_id }) => {
            if (!map[user_id]) map[user_id] = []
            map[user_id].push(store_id)
          })
        }
      } catch { /* user_stores not created yet */ }

      userData.forEach(u => {
        if (!map[u.id] && u.store_id) map[u.id] = [u.store_id]
      })
      setUserStores(map)
    } catch(e) {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const flashTimer = useRef(null)
  function flash(text, type='success') {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setMsg({ text, type })
    flashTimer.current = setTimeout(() => setMsg({ text:'', type:'' }), 5000)
  }

  async function saveUserStores(userId, storeIds) {
    try {
      // Delete existing
      await supabase.from('user_stores').delete().eq('user_id', userId)
      // Insert new
      if (storeIds.length > 0) {
        await supabase.from('user_stores').insert(storeIds.map(sid => ({ user_id: userId, store_id: sid })))
      }
      // Also update legacy store_id (first store or null)
      await supabase.from('profiles').update({ store_id: storeIds[0] || null }).eq('id', userId)
    } catch(e) {
      // user_stores table may not exist yet
    }
  }

  // ── Inline store change ───────────────────────────────────────────────────
  async function changeStores(userId, storeIds) {
    await saveUserStores(userId, storeIds)
    setUserStores(prev => ({ ...prev, [userId]: storeIds }))
  }

  // ── Inline role change ────────────────────────────────────────────────────
  async function changeRole(userId, role) {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    loadAll()
  }

  // ── Invite ────────────────────────────────────────────────────────────────
  async function inviteUser() {
    if (!form.email || !form.name) return flash('Name and email are required', 'error')
    setSaving(true)
    setSqlFallback('')

    // Try RPC first, fall back to SQL hint
    const { error } = await supabase.rpc('create_user_with_role', {
      p_email: form.email.trim().toLowerCase(),
      p_password: form.password,
      p_name: form.name.trim(),
      p_role: form.role,
      p_store_id: inviteStores[0] || null,
    }).catch(() => ({ error: { message: 'RPC not available' } }))

    if (error) {
      const storeUpdate = inviteStores.length > 0
        ? `\nUPDATE profiles SET role='${form.role}', full_name='${form.name.trim()}', store_id='${inviteStores[0]}' WHERE email='${form.email.trim()}';`
        : `\nUPDATE profiles SET role='${form.role}', full_name='${form.name.trim()}' WHERE email='${form.email.trim()}';`

      setSqlFallback(
        `-- Paste in Supabase SQL Editor:\nINSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, role, aud)\nVALUES (gen_random_uuid(), '${form.email.trim()}', crypt('${form.password}', gen_salt('bf')), now(), '{"full_name":"${form.name.trim()}"}', now(), now(), 'authenticated', 'authenticated');${storeUpdate}`
      )
      flash('⚠️ Copy the SQL below and run it in Supabase to create this user.', 'warn')
    } else {
      // Save multi-store assignments after user is created
      const { data: newUser } = await supabase.from('profiles').select('id').eq('email', form.email.trim()).single()
      if (newUser && inviteStores.length > 0) await saveUserStores(newUser.id, inviteStores)
      flash(`✅ ${form.name} created! Login: ${form.email} / ${form.password}`)
      setShowInvite(false)
      setForm({ email:'', name:'', role:'technician', password:'Fixnar2024!' })
      setInviteStores([])
      loadAll()
    }
    setSaving(false)
  }

  // ── Edit save ─────────────────────────────────────────────────────────────
  async function saveEdit() {
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: editUser.full_name,
      role:      editUser.role,
      phone:     editUser.phone,
    }).eq('id', editUser.id)
    await saveUserStores(editUser.id, editStores)
    flash('✅ User updated')
    setShowEdit(false); setEditUser(null)
    loadAll(); setSaving(false)
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteUser(user) {
    setSaving(true)
    await supabase.from('user_stores').delete().eq('user_id', user.id).catch(() => {})
    await supabase.from('profiles').delete().eq('id', user.id)
    flash(`✅ ${user.full_name} removed`)
    setConfirmDel(null); loadAll(); setSaving(false)
  }

  const getStoreNames = (userId) => {
    const ids = userStores[userId] || []
    if (ids.length === 0) return 'All stores'
    if (ids.length === stores.length) return 'All stores'
    return ids.map(id => stores.find(s => s.id === id)?.name?.split('-').pop().trim()).filter(Boolean).join(', ')
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'50vh', color:'var(--text3)' }}>
      Loading users…
    </div>
  )

  return (
    <div style={{ color:'var(--text)' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Users & Access</h2>
          <p style={{ margin:'4px 0 0', color:'var(--text3)', fontSize:13 }}>
            Manage team roles and restaurant access · {users.length} users
          </p>
        </div>
        <button onClick={() => { setShowInvite(true); setSqlFallback('') }}
          style={{ background:'var(--green)', color:'white', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, cursor:'pointer', fontWeight:600 }}>
          + Invite User
        </button>
      </div>

      {/* Flash */}
      {msg.text && (
        <div style={{ padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:13,
          background: msg.type==='error'?'#FBE9E7':msg.type==='warn'?'#FFF8E1':'#E8F5E9',
          color: msg.type==='error'?'#BF360C':msg.type==='warn'?'#7B5800':'#1B5E20',
          border:`1px solid ${msg.type==='error'?'#E24B4A':msg.type==='warn'?'#EF9F27':'#1D9E75'}` }}>
          {msg.text}
        </div>
      )}

      {/* SQL fallback */}
      {sqlFallback && (
        <div style={{ background:'#1a1a2e', borderRadius:10, padding:16, marginBottom:16, border:'1px solid var(--border)' }}>
          <div style={{ color:'#EF9F27', fontSize:12, fontWeight:600, marginBottom:8 }}>⚡ Run in Supabase SQL Editor:</div>
          <pre style={{ color:'#a8d8a8', fontSize:12, whiteSpace:'pre-wrap', margin:0, fontFamily:'monospace' }}>{sqlFallback}</pre>
          <button onClick={() => { navigator.clipboard.writeText(sqlFallback); flash('SQL copied!') }}
            style={{ marginTop:10, background:'var(--green)', color:'white', border:'none', borderRadius:7, padding:'6px 14px', fontSize:12, cursor:'pointer' }}>
            📋 Copy SQL
          </button>
        </div>
      )}

      {/* User list */}
      <div style={{ display:'grid', gap:10 }}>
        {users.map(u => {
          const rc  = ROLE_COLORS[u.role] || ROLE_COLORS.viewer
          const isMe = u.id === me?.id
          const storeIds = userStores[u.id] || []

          return (
            <div key={u.id} style={{ padding:'16px 20px', background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>

                {/* Avatar */}
                <div style={{ width:46, height:46, borderRadius:'50%', flexShrink:0, background:rc.bg, border:`2px solid ${rc.border}`, color:rc.text, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700 }}>
                  {(u.full_name||u.email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {u.full_name || '—'}
                    {isMe && <span style={{ fontSize:10, background:'var(--green)', color:'white', borderRadius:20, padding:'1px 8px' }}>You</span>}
                    <span style={{ fontSize:11, background:rc.bg, color:rc.text, border:`1px solid ${rc.border}`, borderRadius:20, padding:'1px 10px', fontWeight:600 }}>{u.role}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{u.email}</div>
                  {u.phone && <div style={{ fontSize:11, color:'var(--text3)' }}>📞 {u.phone}</div>}
                  {/* Store tags */}
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                    {storeIds.length === 0 || storeIds.length === stores.length
                      ? <span style={{ fontSize:11, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'2px 10px', color:'var(--text3)' }}>🌍 All stores</span>
                      : storeIds.map(sid => {
                          const sName = stores.find(s => s.id === sid)?.name
                          if (!sName) return null
                          const short = sName.includes('-') ? sName.split('-').pop().trim() : sName
                          return (
                            <span key={sid} style={{ fontSize:11, background:'var(--green)22', color:'var(--green)', border:'1px solid var(--green)44', borderRadius:20, padding:'2px 10px' }}>
                              🏪 {short}
                            </span>
                          )
                        })
                    }
                  </div>
                </div>

                {/* Role select */}
                <div style={{ minWidth:130 }}>
                  <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, marginBottom:4 }}>ROLE</div>
                  <select value={u.role||'viewer'} onChange={e=>changeRole(u.id,e.target.value)} disabled={isMe}
                    style={{ padding:'7px 10px', borderRadius:8, border:`1px solid ${rc.border}`, background:rc.bg, color:rc.text, fontSize:13, cursor:'pointer', fontWeight:600, opacity:isMe?0.6:1, width:'100%' }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {/* Store multi-picker */}
                <div style={{ minWidth:200 }}>
                  <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, marginBottom:4 }}>STORE ACCESS</div>
                  <StorePicker
                    stores={stores}
                    selected={storeIds}
                    onChange={ids => changeStores(u.id, ids)}
                  />
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => { setEditUser({...u}); setEditStores(storeIds); setShowEdit(true) }}
                    style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer', color:'var(--text)' }}>
                    ✏️ Edit
                  </button>
                  {!isMe && (
                    <button onClick={() => setConfirmDel(u)}
                      style={{ background:'#FBE9E7', border:'1px solid #E24B4A', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer', color:'#E24B4A' }}>
                      🗑️ Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── INVITE MODAL ── */}
      {showInvite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if(e.target===e.currentTarget) setShowInvite(false) }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:28, width:'100%', maxWidth:520, boxShadow:'0 8px 40px rgba(0,0,0,0.3)', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:18, fontWeight:700 }}>+ Invite New User</h3>
            <div style={{ display:'grid', gap:14 }}>
              {[['Full Name','name','text'],['Email Address','email','email'],['Temporary Password','password','text']].map(([label,key,type]) => (
                <div key={key}>
                  <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6, fontWeight:600 }}>{label.toUpperCase()}{key!=='password'?' *':''}</div>
                  <input type={type} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={key==='email'?'user@email.com':key==='name'?'Full name':''}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}/>
                </div>
              ))}
              <div>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6, fontWeight:600 }}>ROLE</div>
                <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6, fontWeight:600 }}>STORE ACCESS (select one or more)</div>
                <StorePicker stores={stores} selected={inviteStores} onChange={setInviteStores}/>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Leave empty = access to all stores</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
              <button onClick={() => setShowInvite(false)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 20px', fontSize:14, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={inviteUser} disabled={saving||!form.email||!form.name}
                style={{ background:'var(--green)', color:'white', border:'none', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', fontWeight:600, opacity:saving||!form.email||!form.name?0.6:1 }}>
                {saving?'Creating…':'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {showEdit && editUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if(e.target===e.currentTarget){ setShowEdit(false); setEditUser(null) } }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:28, width:'100%', maxWidth:480, boxShadow:'0 8px 40px rgba(0,0,0,0.3)', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:18, fontWeight:700 }}>Edit: {editUser.full_name}</h3>
            <div style={{ display:'grid', gap:14 }}>
              {[['Full Name','full_name'],['Phone','phone']].map(([label,key]) => (
                <div key={key}>
                  <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6, fontWeight:600 }}>{label.toUpperCase()}</div>
                  <input value={editUser[key]||''} onChange={e=>setEditUser({...editUser,[key]:e.target.value})}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}/>
                </div>
              ))}
              <div>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6, fontWeight:600 }}>ROLE</div>
                <select value={editUser.role||'viewer'} onChange={e=>setEditUser({...editUser,role:e.target.value})}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6, fontWeight:600 }}>STORE ACCESS</div>
                <StorePicker stores={stores} selected={editStores} onChange={setEditStores}/>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{editStores.length === 0 ? 'Access to all stores' : `${editStores.length} store${editStores.length>1?'s':''} selected`}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
              <button onClick={() => { setShowEdit(false); setEditUser(null) }} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 20px', fontSize:14, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', fontWeight:600, opacity:saving?0.6:1 }}>
                {saving?'Saving…':'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE ── */}
      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:28, width:'100%', maxWidth:380, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
            <h3 style={{ margin:'0 0 8px', fontSize:18 }}>Remove {confirmDel.full_name}?</h3>
            <p style={{ color:'var(--text3)', fontSize:14, margin:'0 0 20px' }}>They won't be able to log in anymore.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={() => deleteUser(confirmDel)} disabled={saving} style={{ background:'#E24B4A', color:'white', border:'none', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', fontWeight:600, opacity:saving?0.6:1 }}>
                {saving?'Removing…':'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
