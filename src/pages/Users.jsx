import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROLES = ['admin', 'technician', 'operations', 'viewer']
const ROLE_COLORS = {
  admin:      { bg:'#E24B4A22', text:'#E24B4A', border:'#E24B4A' },
  technician: { bg:'#7F77DD22', text:'#7F77DD', border:'#7F77DD' },
  operations: { bg:'#EF9F2722', text:'#EF9F27', border:'#EF9F27' },
  viewer:     { bg:'#9e9e9e22', text:'#9e9e9e', border:'#9e9e9e' },
}

export default function Users() {
  const { profile: me } = useAuth()

  const [users,       setUsers]       = useState([])
  const [stores,      setStores]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showInvite,  setShowInvite]  = useState(false)
  const [showEdit,    setShowEdit]    = useState(false)
  const [editUser,    setEditUser]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState({ text:'', type:'' })
  const [confirmDel,  setConfirmDel]  = useState(null)

  // Invite form
  const [inviteEmail,    setInviteEmail]    = useState('')
  const [inviteName,     setInviteName]     = useState('')
  const [inviteRole,     setInviteRole]     = useState('technician')
  const [inviteStore,    setInviteStore]    = useState('')
  const [invitePassword, setInvitePassword] = useState('Fixnar2024!')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [uRes, sRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('stores').select('id,name').order('name'),
    ])
    setUsers(uRes.data  || [])
    setStores(sRes.data || [])
    setLoading(false)
  }

  function flash(text, type='success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text:'', type:'' }), 4000)
  }

  // ── Invite new user ────────────────────────────────────────────────────────
  async function inviteUser() {
    if (!inviteEmail || !inviteName) return flash('Name and email are required', 'error')
    setSaving(true)
    try {
      // Create auth user via SQL (Supabase admin API not available from frontend)
      const { data, error } = await supabase.rpc('create_user_with_role', {
        p_email:    inviteEmail.trim().toLowerCase(),
        p_password: invitePassword,
        p_name:     inviteName.trim(),
        p_role:     inviteRole,
        p_store_id: inviteStore || null,
      })

      if (error) throw error
      flash(`✅ User ${inviteName} created! They can log in with password: ${invitePassword}`)
      setShowInvite(false)
      resetInviteForm()
      loadAll()
    } catch(err) {
      // Fallback: if RPC doesn't exist, create profile directly and show SQL
      flash(`⚠️ Auto-create failed. Run the SQL below in Supabase to create this user.`, 'warn')
      setSqlFallback(`-- Run in Supabase SQL Editor:\nINSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, role, aud)\nVALUES (gen_random_uuid(), '${inviteEmail.trim()}', crypt('${invitePassword}', gen_salt('bf')), now(), '{"full_name":"${inviteName.trim()}"}', now(), now(), 'authenticated', 'authenticated');\n\n-- Then set their role:\nUPDATE profiles SET role='${inviteRole}', full_name='${inviteName.trim()}'${inviteStore?`, store_id='${inviteStore}'`:''} WHERE email='${inviteEmail.trim()}';`)
    }
    setSaving(false)
  }

  const [sqlFallback, setSqlFallback] = useState('')

  function resetInviteForm() {
    setInviteEmail(''); setInviteName(''); setInviteRole('technician')
    setInviteStore(''); setInvitePassword('Fixnar2024!'); setSqlFallback('')
  }

  // ── Edit user ──────────────────────────────────────────────────────────────
  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: editUser.full_name,
      role:      editUser.role,
      phone:     editUser.phone,
      store_id:  editUser.store_id || null,
    }).eq('id', editUser.id)
    if (error) flash('❌ ' + error.message, 'error')
    else { flash('✅ User updated'); setShowEdit(false); setEditUser(null); loadAll() }
    setSaving(false)
  }

  // ── Delete user ────────────────────────────────────────────────────────────
  async function deleteUser(user) {
    setSaving(true)
    const { error } = await supabase.from('profiles').delete().eq('id', user.id)
    if (error) flash('❌ ' + error.message, 'error')
    else flash(`✅ ${user.full_name} removed`)
    setConfirmDel(null)
    loadAll()
    setSaving(false)
  }

  // ── Quick role change ──────────────────────────────────────────────────────
  async function changeRole(userId, newRole) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    loadAll()
  }

  // ── Change store ───────────────────────────────────────────────────────────
  async function changeStore(userId, storeId) {
    await supabase.from('profiles').update({ store_id: storeId || null }).eq('id', userId)
    loadAll()
  }

  const storeName = id => stores.find(s => s.id === id)?.name || 'All stores'

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'50vh',color:'var(--text3)'}}>
      Loading users…
    </div>
  )

  return (
    <div style={{color:'var(--text)'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:22,fontWeight:700}}>Users & Access</h2>
          <p style={{margin:'4px 0 0',color:'var(--text3)',fontSize:13}}>
            Manage team roles and restaurant access · {users.length} users
          </p>
        </div>
        <button onClick={()=>{ setShowInvite(true); setSqlFallback('') }}
          style={{background:'var(--green)',color:'white',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
          + Invite User
        </button>
      </div>

      {/* Flash message */}
      {msg.text && (
        <div style={{
          padding:'12px 16px',borderRadius:10,marginBottom:16,fontSize:13,
          background: msg.type==='error' ? '#FBE9E7' : msg.type==='warn' ? '#FFF8E1' : '#E8F5E9',
          color:      msg.type==='error' ? '#BF360C' : msg.type==='warn' ? '#F57F17' : '#1B5E20',
          border:`1px solid ${msg.type==='error'?'#E24B4A':msg.type==='warn'?'#EF9F27':'#1D9E75'}`,
        }}>{msg.text}</div>
      )}

      {/* SQL Fallback box */}
      {sqlFallback && (
        <div style={{background:'#1a1a2e',borderRadius:10,padding:16,marginBottom:16,border:'1px solid var(--border)'}}>
          <div style={{color:'#EF9F27',fontSize:12,fontWeight:600,marginBottom:8}}>⚡ Run this SQL in Supabase to create the user:</div>
          <pre style={{color:'#a8d8a8',fontSize:12,whiteSpace:'pre-wrap',margin:0,fontFamily:'monospace'}}>{sqlFallback}</pre>
          <button onClick={()=>navigator.clipboard.writeText(sqlFallback)}
            style={{marginTop:10,background:'var(--green)',color:'white',border:'none',borderRadius:7,padding:'6px 14px',fontSize:12,cursor:'pointer'}}>
            Copy SQL
          </button>
        </div>
      )}

      {/* User list */}
      <div style={{display:'grid',gap:10}}>
        {users.map(u => {
          const rc = ROLE_COLORS[u.role] || ROLE_COLORS.viewer
          const isMe = u.id === me?.id
          return (
            <div key={u.id} style={{
              display:'flex',alignItems:'center',gap:14,
              padding:'14px 18px',
              background:'var(--surface)',
              borderRadius:12,
              border:'1px solid var(--border)',
              flexWrap:'wrap',
            }}>
              {/* Avatar */}
              <div style={{
                width:44,height:44,borderRadius:'50%',flexShrink:0,
                background:rc.bg, border:`2px solid ${rc.border}`,
                color:rc.text, display:'flex',alignItems:'center',
                justifyContent:'center',fontSize:14,fontWeight:700,
              }}>
                {(u.full_name||u.email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14,display:'flex',alignItems:'center',gap:8}}>
                  {u.full_name||'—'}
                  {isMe && <span style={{fontSize:10,background:'var(--green)',color:'white',borderRadius:20,padding:'1px 8px'}}>You</span>}
                </div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{u.email}</div>
                {u.phone && <div style={{fontSize:11,color:'var(--text3)'}}>📞 {u.phone}</div>}
              </div>

              {/* Role dropdown */}
              <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:130}}>
                <div style={{fontSize:10,color:'var(--text3)',fontWeight:600,letterSpacing:'0.05em'}}>ROLE</div>
                <select
                  value={u.role||'viewer'}
                  onChange={e => changeRole(u.id, e.target.value)}
                  disabled={isMe}
                  style={{
                    padding:'6px 10px',borderRadius:8,fontSize:13,cursor:'pointer',
                    background:rc.bg, color:rc.text,
                    border:`1px solid ${rc.border}`,fontWeight:600,
                    opacity: isMe ? 0.6 : 1,
                  }}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Store dropdown */}
              <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:180}}>
                <div style={{fontSize:10,color:'var(--text3)',fontWeight:600,letterSpacing:'0.05em'}}>STORE ACCESS</div>
                <select
                  value={u.store_id||''}
                  onChange={e => changeStore(u.id, e.target.value)}
                  style={{padding:'6px 10px',borderRadius:8,fontSize:13,cursor:'pointer',background:'var(--bg)',color:'var(--text)',border:'1px solid var(--border)'}}
                >
                  <option value=''>All stores</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Actions */}
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button
                  onClick={()=>{ setEditUser({...u}); setShowEdit(true) }}
                  style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 14px',fontSize:12,cursor:'pointer',color:'var(--text)',fontWeight:500}}
                >
                  ✏️ Edit
                </button>
                {!isMe && (
                  <button
                    onClick={()=>setConfirmDel(u)}
                    style={{background:'#FBE9E7',border:'1px solid #E24B4A',borderRadius:8,padding:'7px 14px',fontSize:12,cursor:'pointer',color:'#E24B4A',fontWeight:500}}
                  >
                    🗑️ Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── INVITE MODAL ── */}
      {showInvite && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget){setShowInvite(false);resetInviteForm()}}}>
          <div style={{background:'var(--surface)',borderRadius:16,padding:28,width:'100%',maxWidth:480,boxShadow:'0 8px 40px rgba(0,0,0,0.3)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:18,fontWeight:700}}>+ Invite New User</h3>

            <div style={{display:'grid',gap:14}}>
              <div>
                <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>FULL NAME *</div>
                <input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="e.g. John Smith"
                  style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14,boxSizing:'border-box'}}/>
              </div>
              <div>
                <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>EMAIL ADDRESS *</div>
                <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="user@email.com" type="email"
                  style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14,boxSizing:'border-box'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>ROLE</div>
                  <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}
                    style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14}}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>STORE ACCESS</div>
                  <select value={inviteStore} onChange={e=>setInviteStore(e.target.value)}
                    style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14}}>
                    <option value=''>All stores</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>TEMPORARY PASSWORD</div>
                <input value={invitePassword} onChange={e=>setInvitePassword(e.target.value)}
                  style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14,boxSizing:'border-box'}}/>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Share this with the user — they can change it after logging in</div>
              </div>
            </div>

            <div style={{background:'#FFF8E1',border:'1px solid #EF9F27',borderRadius:9,padding:'10px 14px',marginTop:16,fontSize:12,color:'#7B5800'}}>
              ⚠️ If auto-create fails, a SQL snippet will appear to run in Supabase manually.
            </div>

            <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowInvite(false);resetInviteForm()}}
                style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 20px',fontSize:14,cursor:'pointer',color:'var(--text)'}}>
                Cancel
              </button>
              <button onClick={inviteUser} disabled={saving||!inviteEmail||!inviteName}
                style={{background:'var(--green)',color:'white',border:'none',borderRadius:9,padding:'10px 24px',fontSize:14,cursor:'pointer',fontWeight:600,opacity:saving||!inviteEmail||!inviteName?0.6:1}}>
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {showEdit && editUser && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={e=>{if(e.target===e.currentTarget){setShowEdit(false);setEditUser(null)}}}>
          <div style={{background:'var(--surface)',borderRadius:16,padding:28,width:'100%',maxWidth:440,boxShadow:'0 8px 40px rgba(0,0,0,0.3)'}}>
            <h3 style={{margin:'0 0 20px',fontSize:18,fontWeight:700}}>Edit User</h3>

            <div style={{display:'grid',gap:14}}>
              {[['Full Name','full_name','text'],['Phone','phone','tel']].map(([label,key,type]) => (
                <div key={key}>
                  <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>{label.toUpperCase()}</div>
                  <input type={type} value={editUser[key]||''} onChange={e=>setEditUser({...editUser,[key]:e.target.value})}
                    style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14,boxSizing:'border-box'}}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>ROLE</div>
                <select value={editUser.role||'viewer'} onChange={e=>setEditUser({...editUser,role:e.target.value})}
                  style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14}}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,fontWeight:600}}>STORE ACCESS</div>
                <select value={editUser.store_id||''} onChange={e=>setEditUser({...editUser,store_id:e.target.value})}
                  style={{width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:14}}>
                  <option value=''>All stores</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowEdit(false);setEditUser(null)}}
                style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 20px',fontSize:14,cursor:'pointer',color:'var(--text)'}}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving}
                style={{background:'var(--green)',color:'white',border:'none',borderRadius:9,padding:'10px 24px',fontSize:14,cursor:'pointer',fontWeight:600,opacity:saving?0.6:1}}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE MODAL ── */}
      {confirmDel && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--surface)',borderRadius:16,padding:28,width:'100%',maxWidth:380,boxShadow:'0 8px 40px rgba(0,0,0,0.3)',textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>⚠️</div>
            <h3 style={{margin:'0 0 8px',fontSize:18}}>Remove User?</h3>
            <p style={{color:'var(--text3)',fontSize:14,margin:'0 0 20px'}}>
              This will remove <b>{confirmDel.full_name}</b> from Fixnar.<br/>
              They won't be able to log in anymore.
            </p>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button onClick={()=>setConfirmDel(null)}
                style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 24px',fontSize:14,cursor:'pointer',color:'var(--text)'}}>
                Cancel
              </button>
              <button onClick={()=>deleteUser(confirmDel)} disabled={saving}
                style={{background:'#E24B4A',color:'white',border:'none',borderRadius:9,padding:'10px 24px',fontSize:14,cursor:'pointer',fontWeight:600,opacity:saving?0.6:1}}>
                {saving ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
