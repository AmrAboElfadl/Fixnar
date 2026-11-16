import { addWorkingMinutes, workingMinutesElapsed, getSLAStatus, getSLADeadline } from './sla'

// Instants are written in UTC; Dubai = UTC+4. 2026-11-16 is a Monday, 2026-11-22 a Sunday.
const U = (s) => new Date(s + 'Z')

test('P1 raised 10:00 Dubai Monday is due 14:00 Dubai the same day', () => {
  expect(getSLADeadline('P1', U('2026-11-16T06:00:00')).toISOString()).toBe('2026-11-16T10:00:00.000Z')
})

test('rolls over 18:00 into the next working day at 09:00', () => {
  // 16:00 Dubai + 4h = 2h today + 2h tomorrow -> Tue 11:00 Dubai
  expect(addWorkingMinutes(U('2026-11-16T12:00:00'), 240).toISOString()).toBe('2026-11-17T07:00:00.000Z')
})

test('Sunday is skipped (Sat 17:00 + 2h -> Mon 10:00)', () => {
  expect(addWorkingMinutes(U('2026-11-21T13:00:00'), 120).toISOString()).toBe('2026-11-23T06:00:00.000Z')
})

test('before 09:00 starts at 09:00; after 18:00 starts next day', () => {
  expect(addWorkingMinutes(U('2026-11-16T03:00:00'), 60).toISOString()).toBe('2026-11-16T06:00:00.000Z') // 07:00 Dubai -> 10:00
  expect(addWorkingMinutes(U('2026-11-16T15:00:00'), 60).toISOString()).toBe('2026-11-17T06:00:00.000Z') // 19:00 Dubai -> Tue 10:00
})

test('P4 = 7 working days (63 working hours), matches the database sla_deadline', () => {
  // Mon 09:00 Dubai + 63h -> Mon 18:00 the following week (Sunday off)
  expect(getSLADeadline('P4', U('2026-11-16T05:00:00')).toISOString()).toBe('2026-11-23T14:00:00.000Z')
})

test('elapsed counts only working hours', () => {
  expect(workingMinutesElapsed(U('2026-11-16T12:00:00'), U('2026-11-17T06:00:00'))).toBe(180) // Mon 16:00-18:00 + Tue 09:00-10:00
  expect(workingMinutesElapsed(U('2026-11-21T14:00:00'), U('2026-11-23T05:00:00'))).toBe(0)   // Sat 18:00 -> Mon 09:00
})

test('result does not depend on the device time zone', () => {
  // the maths uses only UTC getters; TZ is set to something far from Dubai in the npm script
  expect(getSLADeadline('P2', U('2026-11-16T05:00:00')).toISOString()).toBe('2026-11-16T13:00:00.000Z')
})

test('server deadline wins: badge is breached once now >= sla_due_at', () => {
  const s = getSLAStatus('P1', U('2026-11-16T06:00:00'), 'open', U('2026-11-16T10:00:00'), U('2026-11-16T10:00:01'))
  expect(s.status).toBe('breached'); expect(s.remainingMin).toBe(0)
  const ok = getSLAStatus('P1', U('2026-11-16T06:00:00'), 'open', U('2026-11-16T10:00:00'), U('2026-11-16T07:00:00'))
  expect(ok.status).toBe('ok'); expect(ok.remainingMin).toBe(180)
})

test('completed jobs show done', () => {
  expect(getSLAStatus('P1', U('2026-11-16T06:00:00'), 'completed').status).toBe('completed')
})
