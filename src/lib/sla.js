// SLA working hours: 9:00 AM to 6:00 PM (9 working hours/day), Monday–Saturday
// P1: 4h, P2: 8h, P3: 12h, P4: 7 days (in working hours)
// PPM: 3 months (calendar)

const WORK_START = 9  // 9 AM
const WORK_END = 18   // 6 PM
const WORK_HOURS_PER_DAY = WORK_END - WORK_START // 9 hours
// Working week: Monday–Saturday. Sunday (0) is the only day off. Keep in sync with the database.
export const OFF_DAYS = [0]

export const SLA_CONFIG = {
  P1: { hours: 4,                    label: 'P1 — Critical',  color: '#E24B4A' },
  P2: { hours: 8,                    label: 'P2 — High',      color: '#EF9F27' },
  P3: { hours: 12,                   label: 'P3 — Medium',    color: '#378ADD' },
  P4: { hours: 7 * WORK_HOURS_PER_DAY, label: 'P4 — Low',    color: '#1D9E75' },
}

// All working-hours maths runs on Dubai wall-clock time, whatever time zone the
// phone or laptop is set to. Dubai has no daylight saving, so a fixed +4h shift is
// exact: we move the instant into a "Dubai-shaped" Date and use only UTC getters/
// setters on it. (Before: getHours()/setHours() used the device's own clock, so a
// device outside UAE time showed a different deadline from the server's sla_due_at.)
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000
const toDubai   = (d) => new Date(new Date(d).getTime() + DUBAI_OFFSET_MS)
const fromDubai = (d) => new Date(d.getTime() - DUBAI_OFFSET_MS)
const isOffD = (d) => OFF_DAYS.includes(d.getUTCDay())
const atHour = (d, h) => { const x = new Date(d); x.setUTCHours(h, 0, 0, 0); return x }
const nextDayAt = (d, h) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + 1); x.setUTCHours(h, 0, 0, 0); return x }

// Next working moment at or after d (Dubai-shaped in and out)
function moveToWorkingTimeD(d) {
  let x = new Date(d)
  for (let guard = 0; guard < 14; guard++) {
    if (isOffD(x)) { x = nextDayAt(x, WORK_START); continue }
    const h = x.getUTCHours()
    if (h < WORK_START) return atHour(x, WORK_START)
    if (h >= WORK_END) { x = nextDayAt(x, WORK_START); continue }
    return x
  }
  return x
}

// Add working minutes to a date, respecting the 9am-6pm Dubai window
export function addWorkingMinutes(startDate, minutes) {
  let current = moveToWorkingTimeD(toDubai(startDate))
  let remaining = minutes
  while (remaining > 0) {
    const minutesUntilEndOfDay = Math.max(0, (atHour(current, WORK_END) - current) / 60000)
    if (remaining <= minutesUntilEndOfDay) {
      current = new Date(current.getTime() + remaining * 60000)
      remaining = 0
    } else {
      remaining -= minutesUntilEndOfDay
      current = moveToWorkingTimeD(nextDayAt(current, WORK_START))
    }
  }
  return fromDubai(current)
}

// Calculate working minutes elapsed since a date (until `now`, default: the current time)
export function workingMinutesElapsed(startDate, now = new Date()) {
  const end = toDubai(now)
  let cursor = moveToWorkingTimeD(toDubai(startDate))
  let elapsed = 0
  for (let guard = 0; cursor < end && guard < 4000; guard++) {
    if (isOffD(cursor)) { cursor = nextDayAt(cursor, WORK_START); continue }
    const dayStart = atHour(cursor, WORK_START)
    const dayEnd   = atHour(cursor, WORK_END)
    const from = cursor < dayStart ? dayStart : cursor
    const to   = end < dayEnd ? end : dayEnd
    if (from < to) elapsed += (to - from) / 60000
    cursor = nextDayAt(cursor, WORK_START)
  }
  return elapsed
}

// dueAt (optional): the server's sla_due_at. When given it is the deadline, so the
// badge always agrees with the database and with the "SLA breached" notifications.
export function getSLAStatus(priority, createdAt, status, dueAt = null, now = new Date()) {
  if (status === 'closed' || status === 'completed' || status === 'done') return { status: 'completed', pct: 100, remaining: null }

  const config = SLA_CONFIG[priority]
  if (!config) return null

  let slaMinutes = config.hours * 60
  if (dueAt) {
    const fromServer = workingMinutesElapsed(createdAt, new Date(dueAt))
    if (fromServer > 0) slaMinutes = fromServer
  }
  const elapsed = workingMinutesElapsed(createdAt, now)
  let pct = Math.min(100, Math.round((elapsed / slaMinutes) * 100))
  let remainingMin = Math.max(0, slaMinutes - elapsed)
  if (dueAt && new Date(now) >= new Date(dueAt)) { pct = 100; remainingMin = 0 }

  let slaStatus = 'ok'
  if (pct >= 100) slaStatus = 'breached'
  else if (pct >= 75) slaStatus = 'warning'

  return { status: slaStatus, pct, remainingMin, config }
}

export function formatRemaining(minutes) {
  if (minutes <= 0) return 'Breached'
  if (minutes < 60) return `${Math.round(minutes)}m left`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`
}

export function getSLADeadline(priority, createdAt) {
  const config = SLA_CONFIG[priority]
  if (!config) return null
  return addWorkingMinutes(new Date(createdAt), config.hours * 60)
}
