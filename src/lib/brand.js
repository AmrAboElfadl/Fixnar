// Name, logo, colour and allowed modules of the workspace this tab is using (see workspaces.js).
import { CURRENT } from './workspaces'

const ALL = ['dashboard', 'stores', 'assets', 'work-orders', 'ppm', 'schedule', 'vendors', 'inventory', 'budgets', 'analytics', 'users', 'finance', 'audit', 'dev']
const modules = new Set(CURRENT.modules ? ['dashboard', ...CURRENT.modules] : ALL)

export const BRAND = {
  id: CURRENT.id,
  name: CURRENT.name,
  tag: CURRENT.tag,
  logo: CURRENT.logo,
  banner: CURRENT.banner,
  color: CURRENT.color,
  isClient: CURRENT.id !== 'fixnar',
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
