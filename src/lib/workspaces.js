// Every company that uses this site, each with its own separate database.
// One link (fixnar.vercel.app): a user signs in and lands in the workspace(s) where their email exists.
// Anon keys are public by design (they ship in every Supabase web app); security is the database's RLS.
const ALL_MODULES = null // null = every module

export const WORKSPACES = [
  {
    id: 'fixnar',
    name: 'Fixnar',
    url: 'https://haielakcqbsvtpkcszud.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhaWVsYWtjcWJzdnRwa2NzenVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTQyMDMsImV4cCI6MjA5Mzg5MDIwM30.3-6aSZsEpHLjCEtB1i-HE5F-il6P8A2audE4lnaG6QY',
    tag: 'Maintenance Management System',
    logo: null, banner: null, color: '#1D9E75',
    modules: ALL_MODULES,
  },
  {
    id: 'wahat',
    name: 'Wahat Al Hayah',
    url: 'https://xtmcnyjulsuywjtuwgxr.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0bWNueWp1bHN1eXdqdHV3Z3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MzYwMjMsImV4cCI6MjExMDQxMjAyM30.rhUXYw4W3VllZuNwZey5kY7wKPjo0yAFNSuJRVH5Vjc',
    tag: 'Technical Services L.L.C · Maintenance portal',
    logo: '/brands/wahat-icon.png', banner: '/brands/wahat-letterhead.png', color: '#C8102E',
    modules: ['work-orders', 'ppm', 'schedule', 'stores', 'finance', 'analytics', 'users'],
  },
]

const STORE_KEY = 'fixnar_workspace'
const byId = (id) => WORKSPACES.find(w => w.id === id)
export const refOf = (ws) => ws.url.replace('https://', '').split('.')[0]
export const sessionKey = (ws) => `sb-${refOf(ws)}-auth-token`

function safeGet(k) { try { return localStorage.getItem(k) } catch { return null } }
function safeSet(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

// Which workspace this tab is using: ?ws= in the link (e.g. password-reset emails) > last chosen > Fixnar.
function resolve() {
  let id = null
  try { id = new URLSearchParams(window.location.search).get('ws') } catch { /* no window */ }
  if (id && byId(id)) { safeSet(STORE_KEY, id); return byId(id) }
  return byId(safeGet(STORE_KEY)) || WORKSPACES[0]
}
export const CURRENT = resolve()

// Workspaces this browser is signed in to
export function signedInWorkspaces() {
  return WORKSPACES.filter(ws => { const v = safeGet(sessionKey(ws)); return v && v.includes('access_token') })
}

// Switch = remember the choice and reload, so every screen uses the other database
export function switchWorkspace(id, path = '/') {
  safeSet(STORE_KEY, id)
  window.location.href = path
}
