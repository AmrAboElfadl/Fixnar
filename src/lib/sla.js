// SLA working hours: 9:00 AM to 6:00 PM (9 working hours/day)
// P1: 4h, P2: 8h, P3: 12h, P4: 7 days (in working hours)
// PPM: 3 months (calendar)

const WORK_START = 9  // 9 AM
const WORK_END = 18   // 6 PM
const WORK_HOURS_PER_DAY = WORK_END - WORK_START // 9 hours

export const SLA_CONFIG = {
  P1: { hours: 4,                    label: 'P1 — Critical',  color: '#E24B4A' },
  P2: { hours: 8,                    label: 'P2 — High',      color: '#EF9F27' },
  P3: { hours: 12,                   label: 'P3 — Medium',    color: '#378ADD' },
  P4: { hours: 7 * WORK_HOURS_PER_DAY, label: 'P4 — Low',    color: '#1D9E75' },
}

// Add working minutes to a date, respecting 9am-6pm window
export function addWorkingMinutes(startDate, minutes) {
  let current = new Date(startDate)
  let remaining = minutes

  // Move to next working time if outside hours
  current = moveToWorkingTime(current)

  while (remaining > 0) {
    const endOfDay = new Date(current)
    endOfDay.setHours(WORK_END, 0, 0, 0)

    const minutesUntilEndOfDay = Math.max(0, (endOfDay - current) / 60000)

    if (remaining <= minutesUntilEndOfDay) {
      current = new Date(current.getTime() + remaining * 60000)
      remaining = 0
    } else {
      remaining -= minutesUntilEndOfDay
      // Jump to next working day 9am
      current.setDate(current.getDate() + 1)
      current.setHours(WORK_START, 0, 0, 0)
      // Skip weekends
      while (current.getDay() === 0 || current.getDay() === 6) {
        current.setDate(current.getDate() + 1)
      }
    }
  }
  return current
}

function moveToWorkingTime(date) {
  const d = new Date(date)
  const day = d.getDay()
  const hour = d.getHours()

  // Skip weekend
  if (day === 6) { d.setDate(d.getDate() + 2); d.setHours(WORK_START, 0, 0, 0); return d }
  if (day === 0) { d.setDate(d.getDate() + 1); d.setHours(WORK_START, 0, 0, 0); return d }

  if (hour < WORK_START) { d.setHours(WORK_START, 0, 0, 0); return d }
  if (hour >= WORK_END) {
    d.setDate(d.getDate() + 1)
    d.setHours(WORK_START, 0, 0, 0)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    return d
  }
  return d
}

// Calculate working minutes elapsed since a date
export function workingMinutesElapsed(startDate) {
  let current = new Date(startDate)
  const now = new Date()
  let elapsed = 0

  current = moveToWorkingTime(current)
  if (current >= now) return 0

  let cursor = new Date(current)
  while (cursor < now) {
    const day = cursor.getDay()
    if (day === 0 || day === 6) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(WORK_START, 0, 0, 0); continue }

    const dayStart = new Date(cursor); dayStart.setHours(WORK_START, 0, 0, 0)
    const dayEnd   = new Date(cursor); dayEnd.setHours(WORK_END,   0, 0, 0)

    const from = cursor < dayStart ? dayStart : cursor
    const to   = now   < dayEnd   ? now      : dayEnd

    if (from < to) elapsed += (to - from) / 60000
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(WORK_START, 0, 0, 0)
  }
  return elapsed
}

export function getSLAStatus(priority, createdAt, status) {
  if (status === 'closed' || status === 'done') return { status: 'completed', pct: 100, remaining: null }

  const config = SLA_CONFIG[priority]
  if (!config) return null

  const slaMinutes = config.hours * 60
  const elapsed = workingMinutesElapsed(createdAt)
  const pct = Math.min(100, Math.round((elapsed / slaMinutes) * 100))
  const remainingMin = Math.max(0, slaMinutes - elapsed)

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
