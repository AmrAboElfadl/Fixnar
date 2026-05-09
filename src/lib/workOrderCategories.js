// Work Order Category Structure
// Category → Subcategory → Faults → Suggested Priority

export const CATEGORIES = {
  'HVAC': {
    icon: '❄️',
    subcategories: {
      'Air Conditioning': {
        faults: [
          { name: 'Not Cooling',         priority: 'P2' },
          { name: 'Water Leaking',        priority: 'P2' },
          { name: 'Strange Noise',        priority: 'P3' },
          { name: 'Unit Not Starting',    priority: 'P1' },
          { name: 'Filter Clogged',       priority: 'P3' },
          { name: 'Remote Not Working',   priority: 'P4' },
        ]
      },
      'Exhaust System': {
        faults: [
          { name: 'Fan Not Working',      priority: 'P1' },
          { name: 'Excessive Noise',      priority: 'P2' },
          { name: 'Weak Airflow',         priority: 'P2' },
          { name: 'Motor Fault',          priority: 'P1' },
          { name: 'Belt Broken',          priority: 'P2' },
        ]
      },
      'Ventilation': {
        faults: [
          { name: 'Duct Blocked',         priority: 'P2' },
          { name: 'Damper Stuck',         priority: 'P3' },
          { name: 'Grille Damaged',       priority: 'P4' },
        ]
      }
    }
  },
  'Plumbing': {
    icon: '🔧',
    subcategories: {
      'Drainage': {
        faults: [
          { name: 'Drain Blocked',        priority: 'P1' },
          { name: 'Slow Drainage',        priority: 'P2' },
          { name: 'Bad Odor',             priority: 'P2' },
          { name: 'Grease Trap Full',     priority: 'P1' },
          { name: 'Overflow',             priority: 'P1' },
        ]
      },
      'Water Supply': {
        faults: [
          { name: 'No Water',             priority: 'P1' },
          { name: 'Low Pressure',         priority: 'P2' },
          { name: 'Pipe Leaking',         priority: 'P1' },
          { name: 'Tap Dripping',         priority: 'P4' },
        ]
      },
      'Grease Trap': {
        faults: [
          { name: 'Needs Cleaning',       priority: 'P2' },
          { name: 'Overflow',             priority: 'P1' },
          { name: 'Bad Odor',             priority: 'P2' },
        ]
      }
    }
  },
  'Electrical': {
    icon: '⚡',
    subcategories: {
      'Lighting': {
        faults: [
          { name: 'Light Not Working',    priority: 'P3' },
          { name: 'Flickering',           priority: 'P3' },
          { name: 'Bulb Replacement',     priority: 'P4' },
          { name: 'Emergency Light Fault',priority: 'P1' },
        ]
      },
      'Power': {
        faults: [
          { name: 'No Power',             priority: 'P1' },
          { name: 'Tripping Breaker',     priority: 'P1' },
          { name: 'Socket Not Working',   priority: 'P3' },
          { name: 'Voltage Fluctuation',  priority: 'P2' },
        ]
      },
      'Generator': {
        faults: [
          { name: 'Not Starting',         priority: 'P1' },
          { name: 'Low Fuel',             priority: 'P2' },
          { name: 'Overheating',          priority: 'P1' },
          { name: 'Service Due',          priority: 'P3' },
        ]
      }
    }
  },
  'Kitchen Equipment': {
    icon: '🍳',
    subcategories: {
      'Cooking Equipment': {
        faults: [
          { name: 'Not Heating',          priority: 'P1' },
          { name: 'Gas Leak',             priority: 'P1' },
          { name: 'Temperature Issue',    priority: 'P2' },
          { name: 'Ignition Fault',       priority: 'P2' },
        ]
      },
      'Refrigeration': {
        faults: [
          { name: 'Not Cooling',          priority: 'P1' },
          { name: 'Temperature High',     priority: 'P1' },
          { name: 'Door Seal Broken',     priority: 'P3' },
          { name: 'Ice Build Up',         priority: 'P2' },
          { name: 'Compressor Noise',     priority: 'P2' },
        ]
      },
      'Dishwasher': {
        faults: [
          { name: 'Not Starting',         priority: 'P2' },
          { name: 'Not Draining',         priority: 'P2' },
          { name: 'Water Leaking',        priority: 'P1' },
          { name: 'Poor Cleaning',        priority: 'P3' },
        ]
      }
    }
  },
  'Fire & Safety': {
    icon: '🔥',
    subcategories: {
      'Fire Suppression': {
        faults: [
          { name: 'System Fault',         priority: 'P1' },
          { name: 'Nozzle Blocked',       priority: 'P1' },
          { name: 'Pressure Low',         priority: 'P1' },
          { name: 'Service Due',          priority: 'P2' },
        ]
      },
      'Fire Alarm': {
        faults: [
          { name: 'False Alarm',          priority: 'P2' },
          { name: 'Detector Fault',       priority: 'P1' },
          { name: 'Panel Error',          priority: 'P1' },
          { name: 'Battery Low',          priority: 'P2' },
        ]
      },
      'Emergency Exit': {
        faults: [
          { name: 'Door Blocked',         priority: 'P1' },
          { name: 'Sign Not Lit',         priority: 'P2' },
          { name: 'Lock Fault',           priority: 'P1' },
        ]
      }
    }
  },
  'Civil & Structure': {
    icon: '🏗️',
    subcategories: {
      'Flooring': {
        faults: [
          { name: 'Tile Broken',          priority: 'P3' },
          { name: 'Floor Slippery',       priority: 'P2' },
          { name: 'Water Seepage',        priority: 'P2' },
        ]
      },
      'Walls & Ceiling': {
        faults: [
          { name: 'Paint Peeling',        priority: 'P4' },
          { name: 'Crack in Wall',        priority: 'P3' },
          { name: 'Ceiling Damaged',      priority: 'P2' },
          { name: 'Water Stain',          priority: 'P3' },
        ]
      },
      'Doors & Windows': {
        faults: [
          { name: 'Door Not Closing',     priority: 'P3' },
          { name: 'Lock Broken',          priority: 'P2' },
          { name: 'Glass Cracked',        priority: 'P3' },
          { name: 'Hinge Broken',         priority: 'P3' },
        ]
      }
    }
  },
  'Pest Control': {
    icon: '🐛',
    subcategories: {
      'Infestation': {
        faults: [
          { name: 'Cockroach Sighting',   priority: 'P1' },
          { name: 'Rodent Activity',      priority: 'P1' },
          { name: 'Fly Infestation',      priority: 'P2' },
          { name: 'Ant Infestation',      priority: 'P3' },
        ]
      },
      'Preventive': {
        faults: [
          { name: 'Scheduled Treatment',  priority: 'P3' },
          { name: 'Bait Station Check',   priority: 'P4' },
        ]
      }
    }
  },
  'LPG & Gas': {
    icon: '⛽',
    subcategories: {
      'Gas System': {
        faults: [
          { name: 'Gas Leak',             priority: 'P1' },
          { name: 'Low Pressure',         priority: 'P1' },
          { name: 'Valve Fault',          priority: 'P1' },
          { name: 'Meter Issue',          priority: 'P2' },
          { name: 'Service Due',          priority: 'P3' },
        ]
      }
    }
  }
}

export const PRIORITY_COLORS = {
  P1: { bg:'#2d1b1b', text:'#f85149', label:'P1 — Critical (4h SLA)' },
  P2: { bg:'#2d2208', text:'#EF9F27', label:'P2 — High (8h SLA)' },
  P3: { bg:'#1a2b3c', text:'#378ADD', label:'P3 — Medium (12h SLA)' },
  P4: { bg:'#1d2f26', text:'#1D9E75', label:'P4 — Low (7 days SLA)' },
}
