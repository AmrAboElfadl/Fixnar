import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, fetchAllRows } from '../../lib/supabase'
import {
  hasErr, money, num2, today, addDays, fmtDate, daysBetween, lineCalc, docTotals, loadSettings, loadAccounts, loadClients,
  downloadCsv, QUOTE_STATUS, INVOICE_STATUS, PAY_METHODS, UNITS, EMIRATES,
} from '../../lib/finance'
import { INP, BTN, PRIMARY, DANGER, CARD, TD, NUM, Field, Pill, Modal, Msg, Empty, Table, Toolbar, Stat } from './ui'

// ════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════════════════════════
const EMPTY_CLIENT = { name: '', legal_name: '', trn: '', address: '', emirate: 'Dubai', contact_name: '', phone: '', email: '', payment_terms_days: '', notes: '' }

function ClientForm({ initial, stores, onClose, onSaved }) {
  const [f, setF] = useState(initial)
  const [linked, setLinked] = useState(new Set(stores.filter(s => initial.id && s.client_id === initial.id).map(s => s.id)))
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!f.name.trim()) return setMsg({ text: 'Client name is required' })
    if (f.trn && !/^\d{15}$/.test(f.trn.trim())) return setMsg({ text: 'A UAE TRN has 15 digits' })
    setBusy(true); setMsg(null)
    const row = { ...f, name: f.name.trim(), trn: f.trn?.trim() || null, payment_terms_days: f.payment_terms_days === '' ? null : +f.payment_terms_days }
    delete row.id; delete row.created_at; delete row.balance
    let id = f.id, error
    if (id) ({ error } = await supabase.from('fin_clients').update(row).eq('id', id))
    else { const r = await supabase.from('fin_clients').insert(row).select('id').single(); error = r.error; id = r.data?.id }
    if (hasErr(error)) { setBusy(false); return setMsg({ text: error.message }) }
    // link / unlink stores
    const was = new Set(stores.filter(s => s.client_id === id).map(s => s.id))
    const add = [...linked].filter(x => !was.has(x)), rem = [...was].filter(x => !linked.has(x))
    if (add.length) await supabase.from('stores').update({ client_id: id }).in('id', add)
    if (rem.length) await supabase.from('stores').update({ client_id: null }).in('id', rem)
    setBusy(false); onSaved(id)
  }
  return (
    <Modal title={f.id ? 'Edit client' : 'New client'} onClose={onClose} busy={busy} width={680}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <Field label="Client name *" span><input value={f.name} onChange={e => set('name', e.target.value)} style={INP} placeholder="e.g. Almed Retail – JJ Chicken"/></Field>
        <Field label="Legal name (as on trade licence)"><input value={f.legal_name || ''} onChange={e => set('legal_name', e.target.value)} style={INP}/></Field>
        <Field label="TRN (15 digits)"><input value={f.trn || ''} onChange={e => set('trn', e.target.value.replace(/\D/g, '').slice(0, 15))} style={INP} inputMode="numeric"/></Field>
        <Field label="Address" span><input value={f.address || ''} onChange={e => set('address', e.target.value)} style={INP}/></Field>
        <Field label="Emirate"><select value={f.emirate || ''} onChange={e => set('emirate', e.target.value)} style={INP}>{EMIRATES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Payment terms (days)"><input type="number" min="0" value={f.payment_terms_days ?? ''} onChange={e => set('payment_terms_days', e.target.value)} style={INP} placeholder="default from settings"/></Field>
        <Field label="Contact person"><input value={f.contact_name || ''} onChange={e => set('contact_name', e.target.value)} style={INP}/></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} style={INP}/></Field>
        <Field label="Email (accounts)"><input type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} style={INP}/></Field>
        <Field label="Notes" span><input value={f.notes || ''} onChange={e => set('notes', e.target.value)} style={INP}/></Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Sites / branches of this client ({linked.size})</div>
        <div style={{ maxHeight: 180, overflowY: 'auto', ...CARD, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
          {stores.map(s => (
            <label key={s.id} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', opacity: s.client_id && s.client_id !== f.id ? 0.5 : 1 }}>
              <input type="checkbox" checked={linked.has(s.id)} style={{ accentColor: 'var(--green)' }}
                onChange={() => setLinked(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}/>
              {s.name}{s.client_id && s.client_id !== f.id ? ' (other client)' : ''}
            </label>
          ))}
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} disabled={busy} style={BTN}>Cancel</button>
        <button onClick={save} disabled={busy} style={PRIMARY}>{busy ? 'Saving…' : 'Save client'}</button>
      </div>
    </Modal>
  )
}

export function Clients() {
  const [clients, setClients] = useState([]); const [stores, setStores] = useState([]); const [bal, setBal] = useState({})
  const [form, setForm] = useState(null); const [q, setQ] = useState('')
  useEffect(() => { load() }, [])
  async function load() {
    const [c, s, i] = await Promise.all([
      loadClients(),
      fetchAllRows(() => supabase.from('stores').select('id,name,client_id').order('name')),
      fetchAllRows(() => supabase.from('fin_invoices').select('client_id,balance,doc_type,status').in('status', ['issued', 'partially_paid']).eq('doc_type', 'invoice')),
    ])
    const b = {}; (i.data || []).forEach(r => { b[r.client_id] = (b[r.client_id] || 0) + Number(r.balance) })
    setClients(c); setStores(s.data || []); setBal(b)
  }
  const rows = clients.filter(c => !q || `${c.name} ${c.legal_name || ''} ${c.trn || ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <Toolbar>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" style={{ ...INP, maxWidth: 260 }}/>
        <div style={{ flex: 1 }}/>
        <button onClick={() => setForm({ ...EMPTY_CLIENT })} style={PRIMARY}>+ New client</button>
      </Toolbar>
      <Table head={['Client', 'TRN', 'Contact', 'Sites', { label: 'Owes you', right: true }]}>
        {rows.map(c => (
          <tr key={c.id} onClick={() => setForm({ ...EMPTY_CLIENT, ...c })} style={{ cursor: 'pointer' }}>
            <td style={TD}><b>{c.name}</b>{c.legal_name && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.legal_name}</div>}</td>
            <td style={TD}>{c.trn || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
            <td style={TD}>{c.contact_name || '—'}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.phone || ''} {c.email || ''}</div></td>
            <td style={TD}>{stores.filter(s => s.client_id === c.id).length}</td>
            <td style={{ ...NUM, fontWeight: 700, color: bal[c.id] ? 'var(--amber)' : 'var(--text3)' }}>{money(bal[c.id] || 0)}</td>
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>No clients yet. Add the companies you work for, then link their branches.</Empty>}
      {form && <ClientForm initial={form} stores={stores} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }}/>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// LISTS: quotes & invoices
// ════════════════════════════════════════════════════════════════════════════
export function QuotesList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([]); const [status, setStatus] = useState('all'); const [q, setQ] = useState('')
  useEffect(() => {
    fetchAllRows(() => supabase.from('fin_quotes').select('*, fin_clients(name), stores(name)').order('created_at', { ascending: false }))
      .then(r => setRows(r.data || []))
  }, [])
  const list = rows.filter(r => (status === 'all' || r.status === status) &&
    (!q || `${r.number} ${r.subject || ''} ${r.fin_clients?.name || ''}`.toLowerCase().includes(q.toLowerCase())))
  const open = rows.filter(r => ['draft', 'sent'].includes(r.status))
  const won = rows.filter(r => ['accepted', 'invoiced'].includes(r.status)).length, decided = rows.filter(r => ['accepted', 'invoiced', 'rejected'].includes(r.status)).length
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Open quotes" value={open.length} sub={money(open.reduce((s, r) => s + +r.total, 0))}/>
        <Stat label="Win rate" value={decided ? `${Math.round(won / decided * 100)}%` : '—'} color="var(--green)" sub={`${won} won of ${decided} decided`}/>
      </div>
      <Toolbar>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search number, subject, client…" style={{ ...INP, maxWidth: 260 }}/>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...INP, width: 'auto' }}>
          <option value="all">All statuses</option>{Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`quotes-${today()}.csv`, list.map(r => ({ number: r.number, date: r.issue_date, client: r.fin_clients?.name, subject: r.subject, status: r.status, subtotal: r.subtotal, vat: r.vat_amount, total: r.total })))} style={BTN}>⬇ Excel</button>
        <button onClick={() => navigate('/finance/quotes/new')} style={PRIMARY}>+ New quotation</button>
      </Toolbar>
      <Table head={['Number', 'Date', 'Client / site', 'Subject', 'Status', { label: 'Total', right: true }]}>
        {list.map(r => (
          <tr key={r.id} onClick={() => navigate(`/finance/quotes/${r.id}`)} style={{ cursor: 'pointer' }}>
            <td style={{ ...TD, fontWeight: 700, fontFamily: 'monospace' }}>{r.number}</td>
            <td style={TD}>{fmtDate(r.issue_date)}</td>
            <td style={TD}>{r.fin_clients?.name}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.stores?.name || ''}</div></td>
            <td style={TD}>{r.subject || '—'}</td>
            <td style={TD}><Pill status={r.valid_until < today() && ['draft', 'sent'].includes(r.status) ? 'expired' : r.status} labels={QUOTE_STATUS}/></td>
            <td style={{ ...NUM, fontWeight: 700 }}>{money(r.total)}</td>
          </tr>
        ))}
      </Table>
      {list.length === 0 && <Empty>No quotations yet.</Empty>}
    </div>
  )
}

export function InvoicesList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([]); const [status, setStatus] = useState('open'); const [q, setQ] = useState(''); const [type, setType] = useState('all')
  useEffect(() => {
    fetchAllRows(() => supabase.from('fin_invoices').select('*, fin_clients(name), stores(name)').order('created_at', { ascending: false }))
      .then(r => setRows(r.data || []))
  }, [])
  const t = today()
  const list = rows.filter(r =>
    (type === 'all' || r.doc_type === type) &&
    (status === 'all' || (status === 'open' ? ['issued', 'partially_paid'].includes(r.status) : status === 'overdue' ? ['issued', 'partially_paid'].includes(r.status) && r.due_date < t : r.status === status)) &&
    (!q || `${r.number || ''} ${r.subject || ''} ${r.lpo_number || ''} ${r.fin_clients?.name || ''}`.toLowerCase().includes(q.toLowerCase())))
  const unpaid = rows.filter(r => r.doc_type === 'invoice' && ['issued', 'partially_paid'].includes(r.status))
  const overdue = unpaid.filter(r => r.due_date < t)
  const month = rows.filter(r => r.doc_type === 'invoice' && !['draft', 'void'].includes(r.status) && r.issue_date >= t.slice(0, 8) + '01')
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Unpaid" value={money(unpaid.reduce((s, r) => s + +r.balance, 0))} color="var(--amber)" sub={`${unpaid.length} invoices`} onClick={() => setStatus('open')}/>
        <Stat label="Overdue" value={money(overdue.reduce((s, r) => s + +r.balance, 0))} color="var(--red)" sub={`${overdue.length} invoices`} onClick={() => setStatus('overdue')}/>
        <Stat label="Invoiced this month (incl. VAT)" value={money(month.reduce((s, r) => s + +r.total, 0))} color="var(--green)" sub={`${month.length} invoices`}/>
      </div>
      <Toolbar>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search number, client, LPO…" style={{ ...INP, maxWidth: 240 }}/>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...INP, width: 'auto' }}>
          <option value="open">Unpaid</option><option value="overdue">Overdue</option><option value="all">All</option>
          {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} style={{ ...INP, width: 'auto' }}>
          <option value="all">Invoices & credit notes</option><option value="invoice">Invoices</option><option value="credit_note">Credit notes</option>
        </select>
        <div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`invoices-${t}.csv`, list.map(r => ({ type: r.doc_type, number: r.number || 'DRAFT', date: r.issue_date, due: r.due_date, client: r.fin_clients?.name, lpo: r.lpo_number, status: r.status, net: r.subtotal - r.discount, vat: r.vat_amount, total: r.total, paid: r.amount_paid, credited: r.amount_credited, balance: r.balance })))} style={BTN}>⬇ Excel</button>
        <button onClick={() => navigate('/finance/invoices/new')} style={PRIMARY}>+ New invoice</button>
      </Toolbar>
      <Table head={['Number', 'Date', 'Due', 'Client / site', 'Status', { label: 'Total', right: true }, { label: 'Balance', right: true }]}>
        {list.map(r => {
          const late = ['issued', 'partially_paid'].includes(r.status) && r.due_date < t
          return (
            <tr key={r.id} onClick={() => navigate(`/finance/${r.doc_type === 'credit_note' ? 'credit-notes' : 'invoices'}/${r.id}`)} style={{ cursor: 'pointer' }}>
              <td style={{ ...TD, fontWeight: 700, fontFamily: 'monospace' }}>{r.doc_type === 'credit_note' ? '↩ ' : ''}{r.number || 'DRAFT'}</td>
              <td style={TD}>{fmtDate(r.issue_date)}</td>
              <td style={{ ...TD, color: late ? 'var(--red)' : undefined, fontWeight: late ? 700 : 400 }}>{r.due_date ? fmtDate(r.due_date) : '—'}{late && <div style={{ fontSize: 11 }}>{daysBetween(r.due_date, t)} days late</div>}</td>
              <td style={TD}>{r.fin_clients?.name}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.stores?.name || r.subject || ''}</div></td>
              <td style={TD}><Pill status={r.status} labels={r.doc_type === 'credit_note' ? { ...INVOICE_STATUS, issued: 'Issued' } : INVOICE_STATUS}/></td>
              <td style={NUM}>{r.doc_type === 'credit_note' ? '−' : ''}{money(r.total)}</td>
              <td style={{ ...NUM, fontWeight: 700 }}>{r.doc_type === 'invoice' && r.status !== 'void' ? money(r.balance) : '—'}</td>
            </tr>
          )
        })}
      </Table>
      {list.length === 0 && <Empty>Nothing here.</Empty>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT EDITOR: quotation / tax invoice / credit note
// ════════════════════════════════════════════════════════════════════════════
const newLine = (vat = 5, acct = '') => ({ key: Math.random().toString(36).slice(2), description: '', qty: 1, unit: 'nos', unit_price: 0, discount_pct: 0, vat_rate: vat, unit_cost: 0, account_id: acct })

function LineRow({ l, i, n, editable, incomeAccounts, onChange, onRemove, onMove, showCost }) {
  const c = lineCalc(l)
  const cell = { padding: '4px 4px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
  const inp = { ...INP, padding: '6px 7px' }
  if (!editable) {
    return (
      <tr>
        <td style={cell}>{i + 1}</td>
        <td style={cell}><div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{l.description}</div></td>
        <td style={{ ...cell, textAlign: 'right' }}>{+l.qty} {l.unit}</td>
        <td style={{ ...cell, textAlign: 'right' }}>{num2(l.unit_price)}</td>
        <td style={{ ...cell, textAlign: 'right' }}>{+l.discount_pct ? `${+l.discount_pct}%` : '—'}</td>
        <td style={{ ...cell, textAlign: 'right' }}>{+l.vat_rate}%</td>
        {showCost && <td style={{ ...cell, textAlign: 'right', color: 'var(--text3)' }}>{num2(l.unit_cost)}</td>}
        <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{num2(c.net)}</td>
        <td style={cell}/>
      </tr>
    )
  }
  return (
    <tr>
      <td style={{ ...cell, color: 'var(--text3)', fontSize: 12, paddingTop: 10 }}>{i + 1}</td>
      <td style={{ ...cell, minWidth: 220 }}>
        <textarea rows={1} value={l.description} onChange={e => onChange({ description: e.target.value })} placeholder="Description of work / material" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}/>
        <select value={l.account_id || ''} onChange={e => onChange({ account_id: e.target.value })} style={{ ...inp, marginTop: 3, fontSize: 11, color: 'var(--text3)' }} title="Income account">
          {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </td>
      <td style={{ ...cell, width: 120 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          <input type="number" min="0" step="any" value={l.qty} onChange={e => onChange({ qty: e.target.value })} style={{ ...inp, width: 60, textAlign: 'right' }}/>
          <select value={l.unit} onChange={e => onChange({ unit: e.target.value })} style={{ ...inp, width: 64, padding: '6px 2px' }}>{[...new Set([...UNITS, l.unit])].map(u => <option key={u}>{u}</option>)}</select>
        </div>
      </td>
      <td style={{ ...cell, width: 100 }}><input type="number" min="0" step="any" value={l.unit_price} onChange={e => onChange({ unit_price: e.target.value })} style={{ ...inp, textAlign: 'right' }}/></td>
      <td style={{ ...cell, width: 64 }}><input type="number" min="0" max="100" step="any" value={l.discount_pct} onChange={e => onChange({ discount_pct: e.target.value })} style={{ ...inp, textAlign: 'right' }}/></td>
      <td style={{ ...cell, width: 72 }}>
        <select value={+l.vat_rate} onChange={e => onChange({ vat_rate: +e.target.value })} style={{ ...inp, padding: '6px 2px' }}>
          <option value={5}>5%</option><option value={0}>0%</option>
        </select>
      </td>
      {showCost && <td style={{ ...cell, width: 90 }}><input type="number" min="0" step="any" value={l.unit_cost} onChange={e => onChange({ unit_cost: e.target.value })} style={{ ...inp, textAlign: 'right', color: 'var(--text3)' }} title="Your cost per unit (internal, never printed)"/></td>}
      <td style={{ ...cell, textAlign: 'right', fontWeight: 700, paddingTop: 10, whiteSpace: 'nowrap' }}>{num2(c.net)}</td>
      <td style={{ ...cell, whiteSpace: 'nowrap', paddingTop: 6 }}>
        <button onClick={() => onMove(-1)} disabled={i === 0} style={{ ...BTN, padding: '3px 6px' }} title="Move up">↑</button>
        <button onClick={() => onMove(1)} disabled={i === n - 1} style={{ ...BTN, padding: '3px 6px', marginLeft: 2 }} title="Move down">↓</button>
        <button onClick={onRemove} style={{ ...BTN, padding: '3px 6px', marginLeft: 2, color: 'var(--red)' }} title="Remove">✕</button>
      </td>
    </tr>
  )
}

function PaymentModal({ invoice, accounts, onClose, onSaved }) {
  const deposit = accounts.filter(a => ['bank', 'cash'].includes(a.subtype) && a.is_active)
  const [f, setF] = useState({ pay_date: today(), amount: invoice.balance, method: 'bank', account_id: deposit.find(a => a.subtype === 'bank')?.id || deposit[0]?.id, reference: '', notes: '' })
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!(+f.amount > 0)) return setMsg({ text: 'Enter the amount received' })
    setBusy(true)
    const { error } = await supabase.from('fin_payments').insert({ ...f, amount: +f.amount, client_id: invoice.client_id, invoice_id: invoice.id })
    setBusy(false)
    if (hasErr(error)) return setMsg({ text: error.message })
    onSaved()
  }
  return (
    <Modal title={`Record payment — ${invoice.number}`} onClose={onClose} busy={busy} width={480}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Balance due: <b>{money(invoice.balance)}</b></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Amount received"><input type="number" min="0" step="any" value={f.amount} onChange={e => set('amount', e.target.value)} style={INP}/></Field>
        <Field label="Date"><input type="date" value={f.pay_date} onChange={e => set('pay_date', e.target.value)} style={INP}/></Field>
        <Field label="Method"><select value={f.method} onChange={e => set('method', e.target.value)} style={INP}>{PAY_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Received into"><select value={f.account_id} onChange={e => set('account_id', e.target.value)} style={INP}>{deposit.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
        <Field label="Reference (TT / cheque no.)" span><input value={f.reference} onChange={e => set('reference', e.target.value)} style={INP}/></Field>
      </div>
      <Msg msg={msg}/>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} disabled={busy} style={BTN}>Cancel</button>
        <button onClick={save} disabled={busy} style={PRIMARY}>{busy ? 'Saving…' : 'Save payment'}</button>
      </div>
    </Modal>
  )
}

export function DocEditor({ kind, id }) {
  // kind: 'quote' | 'invoice' | 'credit_note'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isQuote = kind === 'quote', isCN = kind === 'credit_note'
  const table = isQuote ? 'fin_quotes' : 'fin_invoices', lineTable = isQuote ? 'fin_quote_lines' : 'fin_invoice_lines', fk = isQuote ? 'quote_id' : 'invoice_id'
  const base = isQuote ? '/finance/quotes' : isCN ? '/finance/credit-notes' : '/finance/invoices'
  const [settings, setSettings] = useState(null); const [accounts, setAccounts] = useState([]); const [clients, setClients] = useState([]); const [stores, setStores] = useState([])
  const [doc, setDoc] = useState(null); const [lines, setLines] = useState([])
  const [payments, setPayments] = useState([]); const [credits, setCredits] = useState([]); const [original, setOriginal] = useState(null)
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(null)
  const [payOpen, setPayOpen] = useState(false); const [clientForm, setClientForm] = useState(null)
  const [showCost, setShowCost] = useState(true)

  const incomeAccounts = useMemo(() => accounts.filter(a => a.type === 'income' && a.is_active), [accounts])
  const revenueId = accounts.find(a => a.system_key === 'revenue')?.id || ''

  useEffect(() => { load() }, [kind, id])

  async function load() {
    setMsg(null)
    const [s, a, c, st] = await Promise.all([loadSettings(), loadAccounts(), loadClients(), fetchAllRows(() => supabase.from('stores').select('id,name,address,client_id').order('name'))])
    setSettings(s); setAccounts(a); setClients(c); setStores(st.data || [])
    const rev = a.find(x => x.system_key === 'revenue')?.id || ''
    if (id && id !== 'new') {
      const [d, l] = await Promise.all([
        supabase.from(table).select('*').eq('id', id).maybeSingle(),
        supabase.from(lineTable).select('*').eq(fk, id).order('sort'),
      ])
      if (!d.data) return setMsg({ text: 'Document not found' })
      setDoc(d.data); setLines((l.data || []).map(x => ({ ...x, key: x.id, account_id: x.account_id || rev })))
      if (!isQuote) {
        const [p, cr, o] = await Promise.all([
          supabase.from('fin_payments').select('*, fin_accounts(name)').eq('invoice_id', id).order('pay_date'),
          supabase.from('fin_invoices').select('id,number,total,status,issue_date').eq('credit_for', id).order('issue_date'),
          d.data.credit_for ? supabase.from('fin_invoices').select('id,number,total,balance,client_id').eq('id', d.data.credit_for).maybeSingle() : Promise.resolve({ data: null }),
        ])
        setPayments(p.data || []); setCredits(cr.data || []); setOriginal(o.data)
      }
      return
    }
    // new document
    const t = today()
    const d = { status: 'draft', client_id: params.get('client') || '', store_id: params.get('store') || '', subject: '', issue_date: t, notes: '', terms: isQuote ? s.quote_terms : s.invoice_terms }
    if (isQuote) d.valid_until = addDays(t, s.quote_valid_days || 30)
    else { d.doc_type = kind; d.lpo_number = ''; d.supply_date = t; d.due_date = '' }
    let ls = [newLine(+s.vat_rate || 5, rev)]
    // from a quotation
    const fromQuote = params.get('from_quote')
    if (fromQuote && !isQuote) {
      const [qq, ql] = await Promise.all([supabase.from('fin_quotes').select('*').eq('id', fromQuote).maybeSingle(), supabase.from('fin_quote_lines').select('*').eq('quote_id', fromQuote).order('sort')])
      if (qq.data) {
        Object.assign(d, { client_id: qq.data.client_id, store_id: qq.data.store_id || '', subject: qq.data.subject || '', quote_id: qq.data.id, work_order_id: qq.data.work_order_id, notes: qq.data.notes || '' })
        ls = (ql.data || []).map(x => ({ ...newLine(), ...x, id: undefined, quote_id: undefined, key: Math.random().toString(36).slice(2), account_id: x.account_id || rev }))
      }
    }
    // credit note for an invoice
    const creditFor = params.get('credit_for')
    if (creditFor && isCN) {
      const o = await supabase.from('fin_invoices').select('*').eq('id', creditFor).maybeSingle()
      if (o.data) {
        Object.assign(d, { client_id: o.data.client_id, store_id: o.data.store_id || '', credit_for: o.data.id, subject: `Credit against ${o.data.number}` })
        setOriginal(o.data)
        ls = [{ ...newLine(+s.vat_rate || 5, rev), description: `Credit against invoice ${o.data.number}` }]
      }
    }
    // from a work order: labour + parts used
    const wo = params.get('wo')
    if (wo) {
      const [w, parts] = await Promise.all([
        supabase.from('work_orders').select('id,title,store_id,cost,stores(client_id)').eq('id', wo).maybeSingle(),
        supabase.from('stock_movements').select('qty_change,unit_cost,parts(name,unit)').eq('work_order_id', wo).eq('kind', 'use'),
      ])
      if (w.data) {
        Object.assign(d, { work_order_id: w.data.id, store_id: w.data.store_id || '', client_id: d.client_id || w.data.stores?.client_id || '', subject: w.data.title })
        ls = [{ ...newLine(+s.vat_rate || 5, rev), description: `Maintenance work: ${w.data.title}`, unit: 'job', unit_cost: +w.data.cost || 0 }]
        ;(parts.data || []).forEach(p => ls.push({ ...newLine(+s.vat_rate || 5, a.find(x => x.code === '4200')?.id || rev), description: p.parts?.name || 'Spare part', qty: Math.abs(+p.qty_change), unit: p.parts?.unit || 'nos', unit_cost: +p.unit_cost || 0, unit_price: +p.unit_cost || 0 }))
      }
    }
    setDoc(d); setLines(ls); setPayments([]); setCredits([])
  }

  if (!doc || !settings) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>{msg?.text || 'Loading…'}</div>

  const editable = isQuote ? !['invoiced'].includes(doc.status) : doc.status === 'draft'
  const t = docTotals(lines)
  const profit = t.total - t.vat - t.cost, margin = (t.total - t.vat) ? Math.round(profit / (t.total - t.vat) * 100) : 0
  const set = (k, v) => setDoc(p => ({ ...p, [k]: v }))
  const setLine = (i, patch) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const client = clients.find(c => c.id === doc.client_id)
  const clientStores = stores.filter(s => !doc.client_id || s.client_id === doc.client_id || s.id === doc.store_id)
  const title = isQuote ? 'Quotation' : isCN ? 'Credit note' : 'Tax invoice'

  async function save(nextStatus) {
    if (!doc.client_id) return setMsg({ text: 'Choose the client' })
    const clean = lines.filter(l => l.description.trim())
    if (!clean.length) return setMsg({ text: 'Add at least one line with a description' })
    if (clean.some(l => +l.qty <= 0)) return setMsg({ text: 'Quantities must be more than zero' })
    setBusy('save'); setMsg(null)
    try {
      const head = {
        client_id: doc.client_id, store_id: doc.store_id || null, subject: doc.subject || null, issue_date: doc.issue_date,
        notes: doc.notes || null, terms: doc.terms || null, work_order_id: doc.work_order_id || null,
      }
      if (isQuote) head.valid_until = doc.valid_until || null
      else Object.assign(head, { doc_type: kind, lpo_number: doc.lpo_number || null, supply_date: doc.supply_date || null, due_date: doc.due_date || null, quote_id: doc.quote_id || null, credit_for: doc.credit_for || null })
      let docId = doc.id
      if (editable) {
        if (docId) { const { error } = await supabase.from(table).update(head).eq('id', docId); if (hasErr(error)) throw error }
        else { const r = await supabase.from(table).insert(head).select('id').single(); if (hasErr(r.error)) throw r.error; docId = r.data.id }
        const del = await supabase.from(lineTable).delete().eq(fk, docId); if (hasErr(del.error)) throw del.error
        const rows = clean.map((l, i) => ({ [fk]: docId, sort: i, description: l.description.trim(), qty: +l.qty, unit: l.unit, unit_price: +l.unit_price || 0,
          discount_pct: +l.discount_pct || 0, vat_rate: +l.vat_rate, unit_cost: +l.unit_cost || 0, account_id: l.account_id || revenueId || null }))
        const ins = await supabase.from(lineTable).insert(rows); if (hasErr(ins.error)) throw ins.error
      }
      if (nextStatus) {
        const { error } = await supabase.from(table).update({ status: nextStatus }).eq('id', docId); if (hasErr(error)) throw error
      }
      // a quotation turned into an invoice
      if (!isQuote && nextStatus === 'issued' && doc.quote_id) await supabase.from('fin_quotes').update({ status: 'invoiced' }).eq('id', doc.quote_id)
      if (!doc.id) navigate(`${base}/${docId}`, { replace: true })
      else await load()
      setMsg({ type: 'ok', text: nextStatus === 'issued' ? `✅ ${title} issued.` : '✅ Saved.' })
    } catch (e) { setMsg({ text: e.message || String(e) }) } finally { setBusy('') }
  }

  async function quoteStatus(s) {
    setBusy('status'); const { error } = await supabase.from('fin_quotes').update({ status: s }).eq('id', doc.id); setBusy('')
    if (hasErr(error)) setMsg({ text: error.message }); else load()
  }
  async function issue() {
    if (!window.confirm(`Issue this ${title.toLowerCase()}?\n\nIt gets the next number and is posted to the accounts. After that it can't be edited — mistakes are corrected with a credit note.`)) return
    await save('issued')
  }
  async function voidDoc() {
    const reason = window.prompt('Reason for voiding (kept in the audit trail):')
    if (reason === null) return
    setBusy('void')
    const { error } = await supabase.from('fin_invoices').update({ status: 'void', void_reason: reason || null }).eq('id', doc.id)
    setBusy('')
    if (hasErr(error)) setMsg({ text: error.message }); else { load(); setMsg({ type: 'ok', text: 'Voided. A reversing entry was posted.' }) }
  }
  async function removeDraft() {
    if (!window.confirm('Delete this draft?')) return
    const { error } = await supabase.from(table).delete().eq('id', doc.id)
    if (hasErr(error)) setMsg({ text: error.message }); else navigate(base)
  }
  async function deletePayment(p) {
    if (!window.confirm(`Delete payment of ${money(p.amount)}?`)) return
    const { error } = await supabase.from('fin_payments').delete().eq('id', p.id)
    if (hasErr(error)) setMsg({ text: error.message }); else load()
  }
  const print = () => window.open(`/finance/print/${kind}/${doc.id}`, '_blank')

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <button onClick={() => navigate(isQuote ? '/finance/quotes' : '/finance/invoices')} style={{ ...BTN, padding: '4px 10px', fontSize: 12 }}>← Back</button>
          <h2 style={{ margin: '8px 0 2px', fontSize: 21 }}>{title} {doc.number ? <span style={{ fontFamily: 'monospace' }}>{doc.number}</span> : <span style={{ color: 'var(--text3)' }}>(draft)</span>}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill status={doc.status} labels={isQuote ? QUOTE_STATUS : isCN ? { ...INVOICE_STATUS, issued: 'Issued' } : INVOICE_STATUS}/>
            {original && <span style={{ fontSize: 12, color: 'var(--text3)' }}>for invoice <a href={`/finance/invoices/${original.id}`} style={{ color: 'var(--blue)' }}>{original.number}</a></span>}
            {doc.void_reason && <span style={{ fontSize: 12, color: 'var(--red)' }}>Void: {doc.void_reason}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {doc.id && <button onClick={print} style={BTN}>🖨 Print / PDF</button>}
          {editable && <button onClick={() => save()} disabled={!!busy} style={BTN}>{busy === 'save' ? 'Saving…' : '💾 Save draft'}</button>}
          {isQuote && doc.id && doc.status === 'draft' && <button onClick={() => quoteStatus('sent')} disabled={!!busy} style={BTN}>📤 Mark sent</button>}
          {isQuote && doc.id && ['draft', 'sent'].includes(doc.status) && <><button onClick={() => quoteStatus('accepted')} style={{ ...BTN, color: 'var(--green)' }}>✓ Accepted</button><button onClick={() => quoteStatus('rejected')} style={{ ...BTN, color: 'var(--red)' }}>✕ Rejected</button></>}
          {isQuote && doc.id && ['sent', 'accepted', 'draft'].includes(doc.status) && <button onClick={() => navigate(`/finance/invoices/new?from_quote=${doc.id}`)} style={PRIMARY}>→ Convert to invoice</button>}
          {!isQuote && doc.status === 'draft' && <button onClick={issue} disabled={!!busy} style={PRIMARY}>✔ Issue {isCN ? 'credit note' : 'invoice'}</button>}
          {!isQuote && !isCN && ['issued', 'partially_paid'].includes(doc.status) && <button onClick={() => setPayOpen(true)} style={PRIMARY}>💵 Record payment</button>}
          {!isQuote && !isCN && ['issued', 'partially_paid', 'paid'].includes(doc.status) && +doc.balance > 0 && <button onClick={() => navigate(`/finance/credit-notes/new?credit_for=${doc.id}`)} style={BTN}>↩ Credit note</button>}
          {!isQuote && ['issued', 'partially_paid'].includes(doc.status) && !payments.length && <button onClick={voidDoc} disabled={!!busy} style={DANGER}>Void</button>}
          {doc.id && (isQuote ? doc.status === 'draft' : doc.status === 'draft') && <button onClick={removeDraft} style={DANGER}>Delete draft</button>}
        </div>
      </div>
      <Msg msg={msg}/>

      <div style={{ ...CARD, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <Field label="Client *">
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={doc.client_id} onChange={e => { set('client_id', e.target.value); set('store_id', '') }} disabled={!editable || isCN} style={INP}>
                <option value="">Select client…</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {editable && !isCN && <button onClick={() => setClientForm({ ...EMPTY_CLIENT })} style={{ ...BTN, padding: '6px 9px' }} title="New client">+</button>}
            </div>
            {client && <div style={{ fontSize: 11, color: client.trn ? 'var(--text3)' : 'var(--amber)', marginTop: 3 }}>{client.trn ? `TRN ${client.trn}` : 'No TRN saved for this client'}</div>}
          </Field>
          <Field label="Site / branch">
            <select value={doc.store_id || ''} onChange={e => set('store_id', e.target.value)} disabled={!editable} style={INP}>
              <option value="">—</option>{clientStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Subject"><input value={doc.subject || ''} onChange={e => set('subject', e.target.value)} disabled={!editable} style={INP} placeholder="e.g. Kitchen exhaust repair"/></Field>
          {!isQuote && !isCN && <Field label="Client LPO / PO no."><input value={doc.lpo_number || ''} onChange={e => set('lpo_number', e.target.value)} disabled={!editable} style={INP}/></Field>}
          <Field label={isQuote ? 'Quote date' : 'Issue date'}><input type="date" value={doc.issue_date} onChange={e => set('issue_date', e.target.value)} disabled={!editable} style={INP}/></Field>
          {isQuote && <Field label="Valid until"><input type="date" value={doc.valid_until || ''} onChange={e => set('valid_until', e.target.value)} disabled={!editable} style={INP}/></Field>}
          {!isQuote && <Field label="Date of supply"><input type="date" value={doc.supply_date || ''} onChange={e => set('supply_date', e.target.value)} disabled={!editable} style={INP}/></Field>}
          {!isQuote && !isCN && <Field label="Due date"><input type="date" value={doc.due_date || ''} onChange={e => set('due_date', e.target.value)} disabled={!editable} style={INP} title="Empty = from client / default payment terms"/></Field>}
        </div>
      </div>

      <div style={{ ...CARD, padding: 10, marginBottom: 12, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px 8px' }}>
          <b>Lines</b>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={showCost} onChange={e => setShowCost(e.target.checked)} style={{ accentColor: 'var(--green)' }}/> Show my cost (internal, not printed)
          </label>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr style={{ fontSize: 11, color: 'var(--text3)' }}>
            <th style={{ textAlign: 'left', padding: 4 }}>#</th><th style={{ textAlign: 'left', padding: 4 }}>Description</th><th style={{ textAlign: 'right', padding: 4 }}>Qty</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Rate</th><th style={{ textAlign: 'right', padding: 4 }}>Disc %</th><th style={{ textAlign: 'right', padding: 4 }}>VAT</th>
            {showCost && <th style={{ textAlign: 'right', padding: 4 }}>My cost/unit</th>}<th style={{ textAlign: 'right', padding: 4 }}>Amount</th><th/>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <LineRow key={l.key} l={l} i={i} n={lines.length} editable={editable} incomeAccounts={incomeAccounts} showCost={showCost}
                onChange={p => setLine(i, p)} onRemove={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [newLine(+settings.vat_rate || 5, revenueId)])}
                onMove={d => setLines(ls => { const a = [...ls]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); return a })}/>
            ))}
          </tbody>
        </table>
        {editable && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setLines(ls => [...ls, newLine(+settings.vat_rate || 5, revenueId)])} style={BTN}>+ Add line</button>
            {isCN && original && <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>Max you can credit: {money(original.balance)} (incl. VAT)</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 12, alignItems: 'start' }} className="fx-fin-bottom">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ ...CARD, padding: 12 }}>
            <Field label="Notes (printed)"><textarea rows={2} value={doc.notes || ''} onChange={e => set('notes', e.target.value)} disabled={!editable} style={{ ...INP, resize: 'vertical' }}/></Field>
            <div style={{ height: 8 }}/>
            <Field label="Terms & conditions (printed)"><textarea rows={3} value={doc.terms || ''} onChange={e => set('terms', e.target.value)} disabled={!editable} style={{ ...INP, resize: 'vertical' }}/></Field>
          </div>
          {!isQuote && !isCN && doc.id && (
            <div style={{ ...CARD, padding: 12 }}>
              <b>Payments</b>
              {payments.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>No payments yet.</div>}
              {payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <span>{fmtDate(p.pay_date)} · {PAY_METHODS.find(m => m[0] === p.method)?.[1]} {p.reference ? `· ${p.reference}` : ''} · {p.fin_accounts?.name}</span>
                  <span style={{ whiteSpace: 'nowrap' }}><b>{money(p.amount)}</b> <button onClick={() => deletePayment(p)} style={{ ...BTN, padding: '1px 6px', fontSize: 11, color: 'var(--red)' }}>✕</button></span>
                </div>
              ))}
              {credits.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <a href={`/finance/credit-notes/${c.id}`} style={{ color: 'var(--blue)' }}>↩ Credit note {c.number || '(draft)'}</a><span>{c.status === 'void' ? 'void' : `− ${money(c.total)}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ ...CARD, padding: 14, fontSize: 13 }}>
          {[['Subtotal', t.subtotal], t.discount ? ['Discount', -t.discount] : null, ['Net (excl. VAT)', t.subtotal - t.discount], [`VAT`, t.vat]].filter(Boolean).map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ color: 'var(--text3)' }}>{l}</span><span>{num2(v)}</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '2px solid var(--border)', marginTop: 4, fontSize: 16, fontWeight: 800 }}>
            <span>Total</span><span>{money(t.total)}</span>
          </div>
          {!isQuote && !isCN && doc.id && doc.status !== 'draft' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Paid</span><span>{num2(doc.amount_paid)}</span></div>
              {+doc.amount_credited > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Credited</span><span>{num2(doc.amount_credited)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 800, color: +doc.balance > 0 ? 'var(--amber)' : 'var(--green)' }}><span>Balance due</span><span>{money(doc.balance)}</span></div>
            </>
          )}
          {showCost && !isCN && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: profit >= 0 ? 'var(--green-bg)' : 'var(--red-bg)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>INTERNAL — NOT PRINTED</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>My cost</span><span>{num2(t.cost)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}><span>Profit</span><span>{money(profit)} ({margin}%)</span></div>
            </div>
          )}
        </div>
      </div>

      {payOpen && <PaymentModal invoice={doc} accounts={accounts} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); load(); setMsg({ type: 'ok', text: '✅ Payment recorded and posted.' }) }}/>}
      {clientForm && <ClientForm initial={clientForm} stores={stores} onClose={() => setClientForm(null)} onSaved={async cid => { setClientForm(null); setClients(await loadClients()); set('client_id', cid) }}/>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS RECEIVED
// ════════════════════════════════════════════════════════════════════════════
function ReceiveModal({ clients, accounts, onClose, onSaved }) {
  const deposit = accounts.filter(a => ['bank', 'cash'].includes(a.subtype) && a.is_active)
  const [f, setF] = useState({ client_id: '', invoice_id: '', pay_date: today(), amount: '', method: 'bank', account_id: deposit.find(a => a.subtype === 'bank')?.id || '', reference: '', notes: '' })
  const [open, setOpen] = useState([]); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  useEffect(() => {
    if (!f.client_id) return setOpen([])
    supabase.from('fin_invoices').select('id,number,balance,due_date').eq('client_id', f.client_id).eq('doc_type', 'invoice')
      .in('status', ['issued', 'partially_paid']).order('due_date').then(({ data }) => setOpen(data || []))
  }, [f.client_id])
  async function save() {
    if (!f.client_id || !(+f.amount > 0) || !f.account_id) return setMsg({ text: 'Client, amount and account are required' })
    setBusy(true)
    const { error } = await supabase.from('fin_payments').insert({ ...f, invoice_id: f.invoice_id || null, amount: +f.amount })
    setBusy(false)
    if (hasErr(error)) return setMsg({ text: error.message })
    onSaved()
  }
  return (
    <Modal title="Receive payment" onClose={onClose} busy={busy}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Client *" span><select value={f.client_id} onChange={e => { set('client_id', e.target.value); set('invoice_id', '') }} style={INP}><option value="">Select…</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="For invoice" span>
          <select value={f.invoice_id} onChange={e => { set('invoice_id', e.target.value); const i = open.find(x => x.id === e.target.value); if (i) set('amount', i.balance) }} style={INP}>
            <option value="">On account (no specific invoice)</option>
            {open.map(i => <option key={i.id} value={i.id}>{i.number} — balance {money(i.balance)} — due {fmtDate(i.due_date)}</option>)}
          </select>
        </Field>
        <Field label="Amount *"><input type="number" min="0" step="any" value={f.amount} onChange={e => set('amount', e.target.value)} style={INP}/></Field>
        <Field label="Date"><input type="date" value={f.pay_date} onChange={e => set('pay_date', e.target.value)} style={INP}/></Field>
        <Field label="Method"><select value={f.method} onChange={e => set('method', e.target.value)} style={INP}>{PAY_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Received into"><select value={f.account_id} onChange={e => set('account_id', e.target.value)} style={INP}>{deposit.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
        <Field label="Reference" span><input value={f.reference} onChange={e => set('reference', e.target.value)} style={INP}/></Field>
      </div>
      <Msg msg={msg}/>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={BTN}>Cancel</button><button onClick={save} disabled={busy} style={PRIMARY}>{busy ? 'Saving…' : 'Save payment'}</button>
      </div>
    </Modal>
  )
}

export function Payments() {
  const [rows, setRows] = useState([]); const [clients, setClients] = useState([]); const [accounts, setAccounts] = useState([])
  const [open, setOpen] = useState(false); const [msg, setMsg] = useState(null)
  useEffect(() => { load() }, [])
  async function load() {
    const [p, c, a] = await Promise.all([
      fetchAllRows(() => supabase.from('fin_payments').select('*, fin_clients(name), fin_invoices(number), fin_accounts(name)').order('pay_date', { ascending: false })),
      loadClients(), loadAccounts(),
    ])
    setRows(p.data || []); setClients(c); setAccounts(a)
  }
  async function del(p) {
    if (!window.confirm(`Delete payment ${money(p.amount)} from ${p.fin_clients?.name}?`)) return
    const { error } = await supabase.from('fin_payments').delete().eq('id', p.id)
    if (hasErr(error)) setMsg({ text: error.message }); else load()
  }
  return (
    <div>
      <Toolbar>
        <b>Money received</b><div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`payments-${today()}.csv`, rows.map(r => ({ date: r.pay_date, client: r.fin_clients?.name, invoice: r.fin_invoices?.number, method: r.method, reference: r.reference, account: r.fin_accounts?.name, amount: r.amount })))} style={BTN}>⬇ Excel</button>
        <button onClick={() => setOpen(true)} style={PRIMARY}>+ Receive payment</button>
      </Toolbar>
      <Msg msg={msg}/>
      <Table head={['Date', 'Client', 'Invoice', 'Method / ref', 'Into', { label: 'Amount', right: true }, '']}>
        {rows.map(r => (
          <tr key={r.id}>
            <td style={TD}>{fmtDate(r.pay_date)}</td><td style={TD}>{r.fin_clients?.name}</td>
            <td style={TD}>{r.invoice_id ? <a href={`/finance/invoices/${r.invoice_id}`} style={{ color: 'var(--blue)' }}>{r.fin_invoices?.number}</a> : <span style={{ color: 'var(--text3)' }}>on account</span>}</td>
            <td style={TD}>{PAY_METHODS.find(m => m[0] === r.method)?.[1]} {r.reference ? `· ${r.reference}` : ''}</td>
            <td style={TD}>{r.fin_accounts?.name}</td>
            <td style={{ ...NUM, fontWeight: 700 }}>{money(r.amount)}</td>
            <td style={TD}><button onClick={() => del(r)} style={{ ...BTN, padding: '2px 7px', color: 'var(--red)' }}>✕</button></td>
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>No payments recorded yet.</Empty>}
      {open && <ReceiveModal clients={clients} accounts={accounts} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }}/>}
    </div>
  )
}
