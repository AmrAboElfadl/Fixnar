import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'
import { useSearchParams, useNavigate } from 'react-router-dom'

const STATUSES = ['open','travelling','arrived','in_progress','on_hold','completed','closed']
const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const STATUS_LABELS = {
  open:'Open', travelling:'On the Way', arrived:'Arrived',
  in_progress:'In Progress', on_hold:'On Hold', completed:'Completed', closed:'Closed'
}
const PRIORITY_COLORS = {
  P1:{ bg:'#fdeaea', text:'#E24B4A' },
  P2:{ bg:'#FFF3E0', text:'#EF9F27' },
  P3:{ bg:'#E3F2FD', text:'#378ADD' },
  P4:{ bg:'#E8F5E9', text:'#1D9E75' },
}

// ── CATEGORIES (embedded) ──
const CATEGORIES = {
  'HVAC': { icon:'❄️', subcategories: {
    'Air Conditioning': { faults:[{name:'Not Cooling',priority:'P2'},{name:'Water Leaking',priority:'P2'},{name:'Strange Noise',priority:'P3'},{name:'Unit Not Starting',priority:'P1'},{name:'Filter Clogged',priority:'P3'},{name:'Remote Not Working',priority:'P4'}]},
    'Exhaust System':   { faults:[{name:'Fan Not Working',priority:'P1'},{name:'Excessive Noise',priority:'P2'},{name:'Weak Airflow',priority:'P2'},{name:'Motor Fault',priority:'P1'},{name:'Belt Broken',priority:'P2'}]},
    'Ventilation':      { faults:[{name:'Duct Blocked',priority:'P2'},{name:'Damper Stuck',priority:'P3'},{name:'Grille Damaged',priority:'P4'}]},
  }},
  'Plumbing': { icon:'🔧', subcategories: {
    'Drainage':     { faults:[{name:'Drain Blocked',priority:'P1'},{name:'Slow Drainage',priority:'P2'},{name:'Bad Odor',priority:'P2'},{name:'Grease Trap Full',priority:'P1'},{name:'Overflow',priority:'P1'}]},
    'Water Supply': { faults:[{name:'No Water',priority:'P1'},{name:'Low Pressure',priority:'P2'},{name:'Pipe Leaking',priority:'P1'},{name:'Tap Dripping',priority:'P4'}]},
    'Grease Trap':  { faults:[{name:'Needs Cleaning',priority:'P2'},{name:'Overflow',priority:'P1'},{name:'Bad Odor',priority:'P2'}]},
  }},
  'Electrical': { icon:'⚡', subcategories: {
    'Lighting':   { faults:[{name:'Light Not Working',priority:'P3'},{name:'Flickering',priority:'P3'},{name:'Bulb Replacement',priority:'P4'},{name:'Emergency Light Fault',priority:'P1'}]},
    'Power':      { faults:[{name:'No Power',priority:'P1'},{name:'Tripping Breaker',priority:'P1'},{name:'Socket Not Working',priority:'P3'},{name:'Voltage Fluctuation',priority:'P2'}]},
    'Generator':  { faults:[{name:'Not Starting',priority:'P1'},{name:'Low Fuel',priority:'P2'},{name:'Overheating',priority:'P1'},{name:'Service Due',priority:'P3'}]},
  }},
  'Kitchen Equipment': { icon:'🍳', subcategories: {
    'Cooking Equipment': { faults:[{name:'Not Heating',priority:'P1'},{name:'Gas Leak',priority:'P1'},{name:'Temperature Issue',priority:'P2'},{name:'Ignition Fault',priority:'P2'}]},
    'Refrigeration':     { faults:[{name:'Not Cooling',priority:'P1'},{name:'Temperature High',priority:'P1'},{name:'Door Seal Broken',priority:'P3'},{name:'Ice Build Up',priority:'P2'},{name:'Compressor Noise',priority:'P2'}]},
    'Dishwasher':        { faults:[{name:'Not Starting',priority:'P2'},{name:'Not Draining',priority:'P2'},{name:'Water Leaking',priority:'P1'},{name:'Poor Cleaning',priority:'P3'}]},
  }},
  'Fire & Safety': { icon:'🔥', subcategories: {
    'Fire Suppression': { faults:[{name:'System Fault',priority:'P1'},{name:'Nozzle Blocked',priority:'P1'},{name:'Pressure Low',priority:'P1'},{name:'Service Due',priority:'P2'}]},
    'Fire Alarm':       { faults:[{name:'False Alarm',priority:'P2'},{name:'Detector Fault',priority:'P1'},{name:'Panel Error',priority:'P1'},{name:'Battery Low',priority:'P2'}]},
    'Emergency Exit':   { faults:[{name:'Door Blocked',priority:'P1'},{name:'Sign Not Lit',priority:'P2'},{name:'Lock Fault',priority:'P1'}]},
  }},
  'Civil & Structure': { icon:'🏗️', subcategories: {
    'Flooring':        { faults:[{name:'Tile Broken',priority:'P3'},{name:'Floor Slippery',priority:'P2'},{name:'Water Seepage',priority:'P2'}]},
    'Walls & Ceiling': { faults:[{name:'Paint Peeling',priority:'P4'},{name:'Crack in Wall',priority:'P3'},{name:'Ceiling Damaged',priority:'P2'},{name:'Water Stain',priority:'P3'}]},
    'Doors & Windows': { faults:[{name:'Door Not Closing',priority:'P3'},{name:'Lock Broken',priority:'P2'},{name:'Glass Cracked',priority:'P3'},{name:'Hinge Broken',priority:'P3'}]},
  }},
  'Pest Control': { icon:'🐛', subcategories: {
    'Infestation': { faults:[{name:'Cockroach Sighting',priority:'P1'},{name:'Rodent Activity',priority:'P1'},{name:'Fly Infestation',priority:'P2'},{name:'Ant Infestation',priority:'P3'}]},
    'Preventive':  { faults:[{name:'Scheduled Treatment',priority:'P3'},{name:'Bait Station Check',priority:'P4'}]},
  }},
  'LPG & Gas': { icon:'⛽', subcategories: {
    'Gas System': { faults:[{name:'Gas Leak',priority:'P1'},{name:'Low Pressure',priority:'P1'},{name:'Valve Fault',priority:'P1'},{name:'Meter Issue',priority:'P2'},{name:'Service Due',priority:'P3'}]},
  }},
}

function getCity(storeName) {
  if (!storeName) return ''
  const name = storeName.toLowerCase()
  if (name.includes('abu dhabi') || name.includes('auh') || name.includes('raha') || name.includes('reem') || name.includes('shmkha') || name.includes('adnoc')) return 'Abu Dhabi'
  if (name.includes('al ain') || name.includes('jimi') || name.includes('hili')) return 'Al Ain'
  return 'Dubai'
}

function getSLADeadline(priority, createdAt) {
  const SLA_HOURS = { P1:4, P2:8, P3:12, P4:63 }
  const hours = SLA_HOURS[priority] || 8
  const WORK_START = 9, WORK_END = 18
  let cursor = new Date(createdAt)
  let remaining = hours * 60
  while (remaining > 0) {
    const h = cursor.getHours()
    if (h < WORK_START) { cursor.setHours(WORK_START,0,0,0) }
    else if (h >= WORK_END) { cursor.setDate(cursor.getDate()+1); cursor.setHours(WORK_START,0,0,0) }
    const dayEnd = new Date(cursor); dayEnd.setHours(WORK_END,0,0,0)
    const minLeft = Math.min(remaining, (dayEnd - cursor) / 60000)
    cursor = new Date(cursor.getTime() + minLeft * 60000)
    remaining -= minLeft
  }
  return cursor
}

function getTimeToExpire(priority, createdAt, status) {
  if (['closed','completed'].includes(status)) return 'Completed'
  const deadline = getSLADeadline(priority, createdAt)
  const now = new Date()
  const diff = deadline - now
  if (diff <= 0) return 'BREACHED'
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs >= 24) return Math.floor(hrs/24) + ' day(s) left'
  return hrs + 'h ' + mins + 'm left'
}

function parseTitleParts(title) {
  if (!title) return { category:'', subcategory:'', fault:'' }
  const parts = title.split(' - ').join('—').split('—').map(p => p.trim())
  return {
    category:    parts[0] || '',
    subcategory: parts[1] || '',
    fault:       parts[2] || '',
  }
}

function exportToExcel(data) {
  const headers = [
    'WO No.',
    'Brand',
    'Store Name',
    'Priority',
    'Work Order Status',
    'Category',
    'Sub Category',
    'Fault',
    'SLA (hours)',
    'City',
    'Work Description',
    'Assigned To',
    'Time to Expire',
    'Created Date',
  ]

  const SLA_MAP = { P1:'4 hours', P2:'8 hours', P3:'12 hours', P4:'7 days' }
  const BRAND_MAP = {
    'JJ Chicken': 'JJ Chicken',
    'JJ Derawandi': 'JJ Derawandi',
    'JV ': 'Juan Valdez',
    'Solidare': 'Solidare',
    'Derwandi': 'JJ Derawandi',
  }

  function getBrand(storeName) {
    if (!storeName) return ''
    for (const [key, val] of Object.entries(BRAND_MAP)) {
      if (storeName.includes(key)) return val
    }
    return storeName.split(' ')[0]
  }

  const rows = data.map((wo, i) => {
    const parts = parseTitleParts(wo.title)
    const storeName = wo.stores?.name || ''
    return [
      String(i + 1).padStart(4, '0'),
      getBrand(storeName),
      storeName,
      wo.priority || '',
      (wo.status || '').replace(/_/g,' ').replace(/\w/g, c => c.toUpperCase()),
      parts.category,
      parts.subcategory,
      parts.fault,
      SLA_MAP[wo.priority] || '',
      getCity(storeName),
      wo.description || parts.fault,
      wo.tech_name || 'Unassigned',
      getTimeToExpire(wo.priority, wo.created_at, wo.status),
      wo.created_at ? new Date(wo.created_at).toLocaleDateString('en-GB') : '',
    ]
  })

  // Build CSV with BOM for Excel UTF-8
  const csvContent = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(cell => {
      const clean = String(cell)
        .replace(/—/g, '-')  // em dash to hyphen
        .replace(/–/g, '-')  // en dash
        .replace(/â€"/g, '-')     // corrupted dash
        .replace(/[^
