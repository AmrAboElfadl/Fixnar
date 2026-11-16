import { supabase, fetchAllRows } from './supabase'

export const hasErr = (e) => e && Object.keys(e).length

// AED 1,234.50
export const money = (n, cur = 'AED') =>
  `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const num2 = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
export const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const daysBetween = (a, b) => Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
export const monthStart = (d = today()) => d.slice(0, 8) + '01'
export const yearStart = (d = today()) => d.slice(0, 4) + '-01-01'
export const monthEnd = (d = today()) => { const x = new Date(d.slice(0, 8) + '01T00:00:00'); x.setMonth(x.getMonth() + 1); x.setDate(0); return x.toISOString().slice(0, 10) }
// UAE VAT quarters by calendar quarter (adjust in the report if your FTA stagger differs)
export const quarterRange = (d = today()) => {
  const y = +d.slice(0, 4), q = Math.floor((+d.slice(5, 7) - 1) / 3)
  const from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`
  return { from, to: monthEnd(`${y}-${String(q * 3 + 3).padStart(2, '0')}-01`) }
}

// Same maths as the database (generated columns)
export function lineCalc(l) {
  const gross = round2((+l.qty || 0) * (+l.unit_price || 0))
  const net = round2((+l.qty || 0) * (+l.unit_price || 0) * (1 - (+l.discount_pct || 0) / 100))
  const vat = round2(net * (+l.vat_rate || 0) / 100)
  const cost = round2((+l.qty || 0) * (+l.unit_cost || 0))
  return { gross, net, vat, total: round2(net + vat), cost }
}
export function docTotals(lines) {
  return lines.reduce((t, l) => {
    const c = lineCalc(l)
    t.subtotal = round2(t.subtotal + c.gross); t.discount = round2(t.discount + c.gross - c.net)
    t.vat = round2(t.vat + c.vat); t.total = round2(t.total + c.total); t.cost = round2(t.cost + c.cost)
    return t
  }, { subtotal: 0, discount: 0, vat: 0, total: 0, cost: 0 })
}

export async function loadSettings() {
  const { data } = await supabase.from('fin_settings').select('*').eq('id', 1).maybeSingle()
  return data || {}
}
export async function loadAccounts() {
  const { data } = await supabase.from('fin_accounts').select('*').order('code')
  return data || []
}
export async function loadClients() {
  const { data } = await fetchAllRows(() => supabase.from('fin_clients').select('*').order('name'))
  return data || []
}
export async function signedUrl(path, secs = 600) {
  if (!path) return null
  const { data } = await supabase.storage.from('attachments').createSignedUrl(path, secs)
  return data?.signedUrl || null
}

// Excel-friendly CSV download
export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// Amount in words for invoices (AED / fils)
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function words999(n) {
  let s = ''
  if (n >= 100) { s += ONES[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) s += ' and ' }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += '-' + ONES[n % 10] } else if (n) s += ONES[n]
  return s
}
export function amountInWords(amount) {
  const a = round2(Math.abs(+amount || 0))
  let dh = Math.floor(a); const fils = Math.round((a - dh) * 100)
  if (dh === 0 && fils === 0) return 'Zero Dirhams Only'
  const parts = []
  for (const [v, w] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]) {
    if (dh >= v) { parts.push(words999(Math.floor(dh / v)) + ' ' + w); dh %= v }
  }
  if (dh) parts.push(words999(dh))
  let s = parts.length ? parts.join(' ') + ' Dirhams' : ''
  if (fils) s += (s ? ' and ' : '') + words999(fils) + ' Fils'
  return s + ' Only'
}

export const QUOTE_STATUS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', expired: 'Expired', invoiced: 'Invoiced' }
export const INVOICE_STATUS = { draft: 'Draft', issued: 'Unpaid', partially_paid: 'Part paid', paid: 'Paid', void: 'Void' }
export const BILL_STATUS = { draft: 'Draft', approved: 'Unpaid', partially_paid: 'Part paid', paid: 'Paid', void: 'Void' }
export const STATUS_COLOR = {
  draft: 'var(--text3)', sent: 'var(--blue)', accepted: 'var(--green)', rejected: 'var(--red)', expired: 'var(--amber)',
  invoiced: 'var(--purple)', issued: 'var(--amber)', approved: 'var(--amber)', partially_paid: 'var(--blue)', paid: 'var(--green)', void: 'var(--red)',
}
export const PAY_METHODS = [['bank', 'Bank transfer'], ['cheque', 'Cheque'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']]
export const UNITS = ['nos', 'job', 'lot', 'hrs', 'day', 'visit', 'month', 'm', 'm²', 'kg', 'ltr', 'set']
export const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']
