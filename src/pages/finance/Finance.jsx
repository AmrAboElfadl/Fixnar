import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { hasErr, money, today, monthStart, yearStart, fmtDate, daysBetween, loadSettings, signedUrl, round2, EMIRATES } from '../../lib/finance'
import { INP, BTN, PRIMARY, CARD, TD, NUM, Field, Msg, Stat, Table, Empty } from './ui'
import { Clients, QuotesList, InvoicesList, DocEditor, Payments } from './Sales'
import { BillsList, BillEditor } from './Purchases'
import { Reports, Journal, ChartOfAccounts, BankRec } from './Accounting'

const TABS = [
  ['overview', '📊 Overview'], ['quotes', '📝 Quotations'], ['invoices', '🧾 Invoices'], ['payments', '💵 Payments in'],
  ['bills', '📥 Bills & expenses'], ['clients', '🏢 Clients'], ['reports', '📈 Reports'], ['journal', '📒 Journal'],
  ['accounts', '🗂 Chart of accounts'], ['bank', '🏦 Bank reconciliation'], ['settings', '⚙️ Settings'],
]

// ── Overview dashboard ──────────────────────────────────────────────────────
function Overview() {
  const navigate = useNavigate()
  const [d, setD] = useState(null); const [settings, setSettings] = useState(null)
  useEffect(() => {
    (async () => {
      const t = today(), ms = monthStart(t), ys = yearStart(t)
      const [s, tbM, tbY, tbAll, inv, bills, quotes] = await Promise.all([
        loadSettings(),
        supabase.rpc('fin_trial_balance', { p_from: ms, p_to: t }),
        supabase.rpc('fin_trial_balance', { p_from: ys, p_to: t }),
        supabase.rpc('fin_trial_balance', { p_from: '1900-01-01', p_to: t }),
        fetchAllRows(() => supabase.from('fin_invoices').select('id,number,due_date,balance,total,client_id,issue_date,fin_clients(name)').eq('doc_type', 'invoice').in('status', ['issued', 'partially_paid']).order('due_date')),
        fetchAllRows(() => supabase.from('fin_bills').select('id,number,due_date,balance,payee,vendors(name)').in('status', ['approved', 'partially_paid']).order('due_date')),
        fetchAllRows(() => supabase.from('fin_quotes').select('id,total,status').in('status', ['draft', 'sent'])),
      ])
      setSettings(s)
      const pl = rows => { let i = 0, e = 0; (rows || []).forEach(r => { if (r.type === 'income') i += +r.credit - +r.debit; if (r.type === 'expense') e += +r.debit - +r.credit }); return { i: round2(i), e: round2(e), p: round2(i - e) } }
      const all = tbAll.data || []
      const cash = round2(all.filter(r => ['bank', 'cash'].includes(r.subtype)).reduce((x, r) => x + +r.closing, 0))
      const vat = round2((+all.find(r => r.code === '2100')?.closing || 0) - (+all.find(r => r.code === '1300')?.closing || 0))
      setD({ m: pl(tbM.data), y: pl(tbY.data), cash, vat, inv: inv.data || [], bills: bills.data || [], quotes: quotes.data || [], t })
    })()
  }, [])
  if (!d) return <Empty>Loading…</Empty>
  const ar = round2(d.inv.reduce((s, r) => s + +r.balance, 0)), ap = round2(d.bills.reduce((s, r) => s + +r.balance, 0))
  const overdue = d.inv.filter(r => r.due_date < d.t)
  const setupMissing = settings && (!settings.trn || !settings.iban || settings.company_name === 'My Facility Company')
  return (
    <div>
      {setupMissing && (
        <div style={{ ...CARD, padding: 12, marginBottom: 12, borderColor: 'var(--amber)', background: 'var(--amber-bg)', fontSize: 13 }}>
          ⚠️ Finish your company details (name, TRN, address, bank IBAN) before issuing invoices — they are printed on every tax invoice.
          <button onClick={() => navigate('/finance/settings')} style={{ ...BTN, marginLeft: 10, padding: '4px 10px' }}>Open settings</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Cash & bank" value={money(d.cash)} color="var(--blue)" onClick={() => navigate('/finance/bank')}/>
        <Stat label="Clients owe you" value={money(ar)} color="var(--amber)" sub={`${overdue.length} overdue · ${money(overdue.reduce((s, r) => s + +r.balance, 0))}`} onClick={() => navigate('/finance/invoices')}/>
        <Stat label="You owe vendors" value={money(ap)} color="var(--red)" onClick={() => navigate('/finance/bills')}/>
        <Stat label="VAT to pay (net)" value={money(d.vat)} sub="output − input, to date" onClick={() => navigate('/finance/reports')}/>
        <Stat label="Profit this month" value={money(d.m.p)} color={d.m.p >= 0 ? 'var(--green)' : 'var(--red)'} sub={`revenue ${money(d.m.i)}`}/>
        <Stat label="Profit this year" value={money(d.y.p)} color={d.y.p >= 0 ? 'var(--green)' : 'var(--red)'} sub={`revenue ${money(d.y.i)}`}/>
        <Stat label="Open quotations" value={d.quotes.length} sub={money(d.quotes.reduce((s, r) => s + +r.total, 0))} onClick={() => navigate('/finance/quotes')}/>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => navigate('/finance/quotes/new')} style={PRIMARY}>+ Quotation</button>
        <button onClick={() => navigate('/finance/invoices/new')} style={PRIMARY}>+ Tax invoice</button>
        <button onClick={() => navigate('/finance/payments')} style={BTN}>💵 Receive payment</button>
        <button onClick={() => navigate('/finance/bills/new')} style={BTN}>📥 Add bill / expense</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Unpaid invoices (oldest due first)</div>
          <Table head={['Invoice', 'Client', 'Due', { label: 'Balance', right: true }]}>
            {d.inv.slice(0, 10).map(r => (
              <tr key={r.id} onClick={() => navigate(`/finance/invoices/${r.id}`)} style={{ cursor: 'pointer' }}>
                <td style={{ ...TD, fontFamily: 'monospace' }}>{r.number}</td><td style={TD}>{r.fin_clients?.name}</td>
                <td style={{ ...TD, color: r.due_date < d.t ? 'var(--red)' : undefined }}>{fmtDate(r.due_date)}{r.due_date < d.t ? ` · ${daysBetween(r.due_date, d.t)}d late` : ''}</td>
                <td style={{ ...NUM, fontWeight: 700 }}>{money(r.balance)}</td>
              </tr>
            ))}
          </Table>
          {d.inv.length === 0 && <Empty>No unpaid invoices.</Empty>}
        </div>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Bills to pay</div>
          <Table head={['Bill', 'Vendor', 'Due', { label: 'Balance', right: true }]}>
            {d.bills.slice(0, 10).map(r => (
              <tr key={r.id} onClick={() => navigate(`/finance/bills/${r.id}`)} style={{ cursor: 'pointer' }}>
                <td style={{ ...TD, fontFamily: 'monospace' }}>{r.number}</td><td style={TD}>{r.vendors?.name || r.payee}</td>
                <td style={{ ...TD, color: r.due_date < d.t ? 'var(--red)' : undefined }}>{fmtDate(r.due_date)}</td><td style={{ ...NUM, fontWeight: 700 }}>{money(r.balance)}</td>
              </tr>
            ))}
          </Table>
          {d.bills.length === 0 && <Empty>No unpaid bills.</Empty>}
        </div>
      </div>
    </div>
  )
}

// ── Company & document settings ─────────────────────────────────────────────
function FinSettings() {
  const [f, setF] = useState(null); const [logo, setLogo] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  useEffect(() => { loadSettings().then(async s => { setF(s); setLogo(await signedUrl(s.logo_path)) }) }, [])
  if (!f) return <Empty>Loading…</Empty>
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (f.trn && !/^\d{15}$/.test(f.trn)) return setMsg({ text: 'Your TRN must be 15 digits' })
    setBusy(true)
    const row = { ...f }; delete row.id; delete row.updated_at
    ;['payment_terms_days', 'quote_valid_days', 'vat_rate', 'fy_start_month'].forEach(k => { row[k] = +row[k] })
    row.lock_date = row.lock_date || null
    const { error } = await supabase.from('fin_settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    setMsg(hasErr(error) ? { text: error.message } : { type: 'ok', text: '✅ Settings saved.' })
  }
  async function upload(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const path = `finance/logo-${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`
    const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: true })
    if (hasErr(up.error)) return setMsg({ text: up.error.message })
    await supabase.from('fin_settings').update({ logo_path: path }).eq('id', 1)
    set('logo_path', path); setLogo(await signedUrl(path))
  }
  const box = (title, children) => <div style={{ ...CARD, padding: 14, marginBottom: 12 }}><div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>{children}</div></div>
  return (
    <div style={{ maxWidth: 900 }}>
      {box('Your company (printed on every quotation and tax invoice)', <>
        <Field label="Trading name"><input value={f.company_name || ''} onChange={e => set('company_name', e.target.value)} style={INP}/></Field>
        <Field label="Legal name (trade licence)"><input value={f.legal_name || ''} onChange={e => set('legal_name', e.target.value)} style={INP}/></Field>
        <Field label="TRN (15 digits)"><input value={f.trn || ''} onChange={e => set('trn', e.target.value.replace(/\D/g, '').slice(0, 15))} style={INP}/></Field>
        <Field label="Emirate"><select value={f.emirate || 'Dubai'} onChange={e => set('emirate', e.target.value)} style={INP}>{EMIRATES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Address" span><input value={f.address || ''} onChange={e => set('address', e.target.value)} style={INP}/></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} style={INP}/></Field>
        <Field label="Email"><input value={f.email || ''} onChange={e => set('email', e.target.value)} style={INP}/></Field>
        <Field label="Website"><input value={f.website || ''} onChange={e => set('website', e.target.value)} style={INP}/></Field>
        <Field label="Logo">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {logo && <img src={logo} alt="logo" style={{ height: 40, maxWidth: 140, objectFit: 'contain', background: '#fff', padding: 2, borderRadius: 4 }}/>}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={upload} style={{ fontSize: 12 }}/>
          </div>
        </Field>
      </>)}
      {box('Bank details (printed on invoices)', <>
        <Field label="Bank name"><input value={f.bank_name || ''} onChange={e => set('bank_name', e.target.value)} style={INP}/></Field>
        <Field label="Account name"><input value={f.account_name || ''} onChange={e => set('account_name', e.target.value)} style={INP}/></Field>
        <Field label="IBAN"><input value={f.iban || ''} onChange={e => set('iban', e.target.value.toUpperCase().replace(/\s/g, ''))} style={INP} placeholder="AE07 0331 2345 6789 0123 456"/></Field>
        <Field label="SWIFT"><input value={f.swift || ''} onChange={e => set('swift', e.target.value.toUpperCase())} style={INP}/></Field>
      </>)}
      {box('Documents', <>
        <Field label="Quotation prefix"><input value={f.quote_prefix} onChange={e => set('quote_prefix', e.target.value.toUpperCase())} style={INP}/></Field>
        <Field label="Invoice prefix"><input value={f.invoice_prefix} onChange={e => set('invoice_prefix', e.target.value.toUpperCase())} style={INP}/></Field>
        <Field label="Credit note prefix"><input value={f.credit_prefix} onChange={e => set('credit_prefix', e.target.value.toUpperCase())} style={INP}/></Field>
        <Field label="Default VAT %"><input type="number" value={f.vat_rate} onChange={e => set('vat_rate', e.target.value)} style={INP}/></Field>
        <Field label="Payment terms (days)"><input type="number" value={f.payment_terms_days} onChange={e => set('payment_terms_days', e.target.value)} style={INP}/></Field>
        <Field label="Quotation valid (days)"><input type="number" value={f.quote_valid_days} onChange={e => set('quote_valid_days', e.target.value)} style={INP}/></Field>
        <Field label="Default quotation terms" span><textarea rows={3} value={f.quote_terms || ''} onChange={e => set('quote_terms', e.target.value)} style={{ ...INP, resize: 'vertical' }}/></Field>
        <Field label="Default invoice terms" span><textarea rows={3} value={f.invoice_terms || ''} onChange={e => set('invoice_terms', e.target.value)} style={{ ...INP, resize: 'vertical' }}/></Field>
      </>)}
      {box('Closing the books', <>
        <Field label="Lock date — nothing can be added or changed on or before this date">
          <input type="date" value={f.lock_date || ''} onChange={e => set('lock_date', e.target.value)} style={INP}/>
        </Field>
        <div style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'end' }}>Set it after you file a VAT return or close a month, so filed figures can't change by accident.</div>
      </>)}
      <Msg msg={msg}/>
      <button onClick={save} disabled={busy} style={PRIMARY}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}

export default function Finance() {
  const { tab = 'overview', id } = useParams()
  const navigate = useNavigate()
  const editor =
    id && tab === 'quotes' ? <DocEditor kind="quote" id={id}/> :
    id && tab === 'invoices' ? <DocEditor kind="invoice" id={id}/> :
    id && tab === 'credit-notes' ? <DocEditor kind="credit_note" id={id}/> :
    id && tab === 'bills' ? <BillEditor id={id}/> : null
  const active = tab === 'credit-notes' ? 'invoices' : tab
  return (
    <div style={{ color: 'var(--text)' }}>
      <div className="fx-no-print" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Finance</h2>
        <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--text3)' }}>Quotations, UAE tax invoices, payments, bills and your accounts. Only admins can see this.</p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => navigate(k === 'overview' ? '/finance' : `/finance/${k}`)}
              style={{ ...BTN, padding: '6px 11px', fontSize: 12, ...(active === k ? { background: 'var(--green)', color: 'white', borderColor: 'var(--green)', fontWeight: 600 } : {}) }}>{l}</button>
          ))}
        </div>
      </div>
      {editor || (
        <>
          {tab === 'overview' && <Overview/>}
          {tab === 'quotes' && <QuotesList/>}
          {(tab === 'invoices' || tab === 'credit-notes') && <InvoicesList/>}
          {tab === 'payments' && <Payments/>}
          {tab === 'bills' && <BillsList/>}
          {tab === 'clients' && <Clients/>}
          {tab === 'reports' && <Reports/>}
          {tab === 'journal' && <Journal/>}
          {tab === 'accounts' && <ChartOfAccounts/>}
          {tab === 'bank' && <BankRec/>}
          {tab === 'settings' && <FinSettings/>}
        </>
      )}
    </div>
  )
}
