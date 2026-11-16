import { supabase } from './supabase'

// Calls the "asset-ai" Supabase edge function (Claude): identify a photo, get specs, get market price.
export async function assetAi(action, payload) {
  const { data, error } = await supabase.functions.invoke('asset-ai', { body: { action, ...payload } })
  if (error && Object.keys(error).length) {
    // Edge function errors carry the JSON body in error.context
    let msg = error.message || 'AI request failed'
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch { /* keep message */ }
    throw new Error(msg)
  }
  if (!data?.ok) throw new Error(data?.error || 'AI request failed')
  return data
}

export const SPEC_FIELDS = [
  ['power_kw', 'Power (kW)'], ['voltage_v', 'Voltage (V)'], ['current_a', 'Current (A)'], ['phase', 'Phase'],
  ['frequency_hz', 'Frequency (Hz)'], ['fuel', 'Fuel / energy'], ['gas_consumption', 'Gas consumption'],
  ['refrigerant', 'Refrigerant'], ['capacity', 'Capacity'], ['dimensions_mm', 'Dimensions W×D×H (mm)'], ['weight_kg', 'Weight (kg)'],
]

export const ASSET_CATEGORIES = ['Kitchen Equipment', 'Refrigeration', 'HVAC', 'Electrical', 'Plumbing', 'Office Equipment',
  'Furniture & Fittings', 'Operational Equipment', 'Fire & Safety', 'IT & POS', 'Vehicles', 'Other']
