import { WORKSPACES, CURRENT, signedInWorkspaces, switchWorkspace } from '../lib/workspaces'
import { useAuth } from '../context/AuthContext'

const DEV_EMAIL = 'amrmorsy93@gmail.com'

// Shown when this device is signed in to more than one company, or for the developer account.
// Choosing a company you're not signed in to yet opens its login once; after that switching is instant.
export default function WorkspaceSwitcher() {
  const { profile } = useAuth()
  const signed = signedInWorkspaces().map(w => w.id)
  const isDev = (profile?.email || '').toLowerCase() === DEV_EMAIL
  if (signed.length < 2 && !isDev) return null
  const list = isDev ? WORKSPACES : WORKSPACES.filter(w => signed.includes(w.id))
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', letterSpacing:'.05em', marginBottom:4 }}>COMPANY</div>
      <select value={CURRENT.id} aria-label="Company workspace"
        onChange={e => {
          const id = e.target.value
          if (signed.includes(id)) switchWorkspace(id, '/')
          else switchWorkspace(id, `/login?ws=${id}`)
        }}
        style={{ width:'100%', background:'var(--input-bg)', border:`1px solid ${CURRENT.color}`, borderRadius:8, padding:'7px 8px', color:'var(--text)', fontSize:13, fontWeight:600 }}>
        {list.map(w => <option key={w.id} value={w.id}>{w.name}{signed.includes(w.id) ? '' : ' (sign in)'}</option>)}
      </select>
    </div>
  )
}
