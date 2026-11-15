// Ready-made checklist templates for PPM plans and work orders.
// Each item becomes one tick-box on the work order.

export const CHECKLIST_TEMPLATES = {
  'AC / Split unit service': [
    'Clean / wash air filters',
    'Clean evaporator coil',
    'Flush condensate drain line',
    'Check refrigerant pressure',
    'Measure supply air temperature (°C)',
    'Check fan motor and capacitor',
    'Check thermostat / remote operation',
  ],
  'Kitchen exhaust hood': [
    'Clean hood baffle filters',
    'Inspect exhaust fan belt and bearings',
    'Check fan motor amps',
    'Inspect duct access panels for grease build-up',
    'Check make-up air / fresh air fan',
  ],
  'Fire suppression (Ansul)': [
    'Check cylinder pressure gauge',
    'Inspect fusible links and nozzles caps',
    'Check pull station is accessible and sealed',
    'Verify gas shut-off valve linkage',
    'Update inspection tag',
  ],
  'Fire alarm & emergency': [
    'Test fire alarm panel (no faults)',
    'Test smoke / heat detectors (sample)',
    'Test emergency lights (90 min)',
    'Check exit signs illuminated',
    'Check fire extinguishers pressure and tags',
  ],
  'Refrigeration (chiller / freezer)': [
    'Record chiller temperature (0–5 °C)',
    'Record freezer temperature (≤ -18 °C)',
    'Clean condenser coil',
    'Check door gaskets and hinges',
    'Check defrost cycle and drain',
  ],
  'Cooking equipment (fryer / grill / oven)': [
    'Check thermostat accuracy',
    'Inspect gas hoses, valves and connections (leak test)',
    'Check pilot / igniter',
    'Inspect electrical cables and plugs',
    'Clean and check burners',
  ],
  'Electrical (DB / lighting)': [
    'Thermal check of DB breakers',
    'Tighten DB terminals',
    'Test RCD / ELCB trip',
    'Replace failed lamps',
    'Check earthing',
  ],
  'Plumbing & grease trap': [
    'Empty and clean grease trap',
    'Check sinks and taps for leaks',
    'Check floor drains flow',
    'Check water heater operation and temperature',
    'Inspect water filter cartridges',
  ],
  'Store HSE / safety audit': [
    'Walkways and exits clear',
    'First aid kit complete',
    'Chemicals stored and labelled correctly',
    'No exposed wiring',
    'Floors dry / anti-slip mats in place',
    'Pest control log up to date',
  ],
  'Job completion (any repair)': [
    'Fault root cause identified',
    'Repair tested in front of store manager',
    'Area cleaned after work',
    'Before / after photos uploaded',
  ],
}

export const PPM_FREQUENCIES = [
  { label: 'Weekly',      days: 7 },
  { label: 'Every 2 weeks', days: 14 },
  { label: 'Monthly',     months: 1 },
  { label: 'Every 2 months', months: 2 },
  { label: 'Quarterly',   months: 3 },
  { label: 'Every 6 months', months: 6 },
  { label: 'Yearly',      months: 12 },
]

export function frequencyLabel(t) {
  if (t?.frequency_days) {
    const f = PPM_FREQUENCIES.find(x => x.days === t.frequency_days)
    return f ? f.label : `Every ${t.frequency_days} days`
  }
  const m = t?.frequency_months || 3
  const f = PPM_FREQUENCIES.find(x => x.months === m)
  return f ? f.label : `Every ${m} months`
}
