// Predictive maintenance (fx19): what can be measured, how alerts look.
export const METRICS = [
  { id: 'temp_c',       label: 'Temperature (°C)',   hint: 'Chiller / freezer / cold room probe', step: '0.1' },
  { id: 'amps',         label: 'Current (A)',        hint: 'Clamp meter on the compressor or motor', step: '0.1' },
  { id: 'oil_temp_c',   label: 'Fryer oil (°C)',     hint: 'Probe in the oil at set point',        step: '1' },
  { id: 'supply_air_c', label: 'AC supply air (°C)', hint: 'Probe at the supply grille',           step: '0.1' },
  { id: 'vibration',    label: 'Vibration (mm/s)',   hint: 'Vibration meter on the motor housing', step: '0.1' },
  { id: 'humidity',     label: 'Humidity (%)',       hint: 'Room humidity',                         step: '1' },
]
export const metricLabel = (id) => (METRICS.find(m => m.id === id) || {}).label || id
// Alert titles come from the database with metric ids ('temp_c 9.2 — …'): show the readable names instead
export const prettyTitle = (t) => METRICS.reduce((s, m) => s.replace(new RegExp('\\b' + m.id + '\\b', 'g'), m.label), String(t || ''))

export const KIND_LABEL = {
  limit: 'Outside the safe range', drift: 'Trend — will fail soon', repeat_faults: 'Repeated breakdowns',
  keyword: 'Warning signs in notes', ppm_overdue: 'PPM overdue',
}
export const SEVERITY = {
  critical: { label: 'Critical', color: 'var(--red)',   bg: 'var(--red-bg)',   icon: '🔴' },
  warn:     { label: 'Warning',  color: 'var(--amber)', bg: 'var(--amber-bg)', icon: '🟠' },
  watch:    { label: 'Watch',    color: 'var(--blue)',  bg: 'var(--blue-bg)',  icon: '🟡' },
}
