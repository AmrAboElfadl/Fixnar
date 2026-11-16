// Per-client portal settings, set at build time with Vercel environment variables.
// The Fixnar site sets none of these and keeps every module.
//   REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY  – the client's own database
//   REACT_APP_BRAND        – name shown in the app ("Wahat Al Hayah")
//   REACT_APP_BRAND_TAG    – line under the name on the login page
//   REACT_APP_BRAND_LOGO   – square logo in /public (e.g. /brands/wahat-icon.png)
//   REACT_APP_BRAND_BANNER – wide letterhead in /public for the login page
//   REACT_APP_BRAND_COLOR  – accent colour for logo tile and printed documents
//   REACT_APP_MODULES      – comma list of modules this client can use (empty = all)
const env = process.env
const ALL = ['dashboard', 'stores', 'assets', 'work-orders', 'ppm', 'schedule', 'vendors', 'inventory', 'budgets', 'analytics', 'users', 'finance', 'audit', 'dev']

const list = (env.REACT_APP_MODULES || '').split(',').map(s => s.trim()).filter(Boolean)
const modules = new Set(list.length ? ['dashboard', ...list] : ALL)

export const BRAND = {
  name: env.REACT_APP_BRAND || 'Fixnar',
  tag: env.REACT_APP_BRAND_TAG || 'Maintenance Management System',
  logo: env.REACT_APP_BRAND_LOGO || null,
  banner: env.REACT_APP_BRAND_BANNER || null,
  color: env.REACT_APP_BRAND_COLOR || '#1D9E75',
  isClient: !!env.REACT_APP_BRAND,
}

export const hasModule = (m) => modules.has(m)

// which module a page path belongs to
export function moduleOfPath(path) {
  const p = (path || '/').split('?')[0]
  if (p === '/') return 'dashboard'
  if (p.startsWith('/a/') || p.startsWith('/assets')) return 'assets'
  if (p.startsWith('/work-orders')) return 'work-orders'
  if (p.startsWith('/my-schedule') || p.startsWith('/schedule')) return 'schedule'
  const seg = p.split('/')[1]
  return ALL.includes(seg) ? seg : null
}
