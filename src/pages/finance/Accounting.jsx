import { useEffect, useMemo, useState } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { hasErr, money, num2, today, fmtDate, daysBetween, round2, monthStart, yearStart, quarterRange, loadAccounts, downloadCsv } from '../../lib/finance'
import { INP, BTN, PRIMARY, CARD, TD, NUM, TH, Field, Modal, Msg, Empty, Table, Toolbar, Stat } from './ui'

const TYPE_LABEL = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' }

async function trialBalance(from, to) {
  const { data, error } = await supabase.rpc('fin_trial_balance', { p_from: from, p_to: to })
  if (hasErr(error)) throw error
  return (data || []).map(r => ({ ...r, opening: +r.opening, debit: +r.debit, credit: +r.credit, closing: +r.closing }))
}

function PeriodPicker({ from, to, setFrom, setTo, single }) {
  const t = today(), q = quarterRange(t)
  const presets = single ? [['Today', t], ['End of last month', new Date(new Date(t.slice(0, 8) + '01T00:00:00') - 86400000).toISOString().slice(0, 10)]]
    : [['This month', monthStart(t), t], ['This quarter', q.from, q.to], ['This year', yearStart(t), t], ['Last year', `${+t.slice(0, 4) - 1}-01-01`, `${+t.slice(0, 4) - 1}-12-31`]]
  return (
    <>
      {!single && <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...INP, width: 'auto' }}/>}
      {!single && <span style={{ color: 'var(--text3)' }}>to</span>}
      <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...INP, width: 'auto' }}/>
      {presets.map(p => <button key={p[0]} onClick={() => single ? setTo(p[1]) : (setFrom(p[1]), setTo(p[2]))} style={{ ...BTN, padding: '6px 10px', fontSize: 12 }}>{p[0]}</button>)}
    </>
  )
}

function Section({ title, rows, total, totalLabel, sign = 1, strong }) {
  return (
    <>
      <tr><td colSpan={2} style={{ ...TD, fontWeight: 800, background: 'var(--bg3)', paddingTop: 10 }}>{title}</td></tr>
      {rows.map(r => <tr key={r.code}><td style={{ ...TD, paddingLeft: 22 }}>{r.code} {r.name}</td><td style={NUM}>{num2(sign * r.v)}</td></tr>)}
      {rows.length === 0 && <tr><td style={{ ...TD, paddingLeft: 22, color: 'var(--text3)' }} colSpan={2}>—</td></tr>}
      <tr><td style={{ ...TD, fontWeight: 700 }}>{totalLabel || `Total ${title.toLowerCase()}`}</td><td style={{ ...NUM, fontWeight: 800, fontSize: strong ? 15 : 13 }}>{num2(sign * total)}</td></tr>
    </>
  )
}

// ── Profit & loss ────────────────────────────────────────────────────────────
export function ProfitLoss() {
  const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(today()); const [tb, setTb] = useState([]); const [err, setErr] = useState(null)
  useEffect(() => { trialBalance(from, to).then(setTb, e => setErr(e.message)) }, [from, to])
  const mv = r => r.type === 'income' ? r.credit - r.debit : r.debit - r.credit
  const pick = f => tb.filter(f).map(r => ({ ...r, v: round2(mv(r)) })).filter(r => r.v !== 0)
  const income = pick(r => r.type === 'income'), cogs = pick(r => r.type === 'expense' && r.subtype === 'cogs'), opex = pick(r => r.type === 'expense' && r.subtype !== 'cogs')
  const sum = a => round2(a.reduce((s, r) => s + r.v, 0))
  const I = sum(income), C = sum(cogs), O = sum(opex), GP = round2(I - C), NP = round2(GP - O)
  return (
    <div>
      <Toolbar><PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}/><div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`profit-loss-${from}-${to}.csv`, [...income, ...cogs, ...opex].map(r => ({ code: r.code, account: r.name, type: r.type, amount: r.v })))} style={BTN}>⬇ Excel</button>
        <button onClick={() => window.print()} style={BTN}>🖨 Print</button></Toolbar>
      {err && <Msg msg={{ text: err }}/>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Revenue" value={money(I)} color="var(--green)"/><Stat label="Gross profit" value={money(GP)} sub={I ? `${Math.round(GP / I * 100)}% margin` : ''}/>
        <Stat label="Net profit" value={money(NP)} color={NP >= 0 ? 'var(--green)' : 'var(--red)'} sub={I ? `${Math.round(NP / I * 100)}% of revenue` : ''}/>
      </div>
      <div style={{ ...CARD, maxWidth: 720 }}>
        <div style={{ padding: '12px 14px', fontWeight: 800 }}>Profit & Loss · {fmtDate(from)} – {fmtDate(to)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          <Section title="Revenue" rows={income} total={I}/>
          <Section title="Cost of sales" rows={cogs} total={C}/>
          <tr><td style={{ ...TD, fontWeight: 800 }}>Gross profit</td><td style={{ ...NUM, fontWeight: 800 }}>{num2(GP)}</td></tr>
          <Section title="Operating expenses" rows={opex} total={O}/>
          <tr><td style={{ ...TD, fontWeight: 900, fontSize: 15 }}>Net profit</td><td style={{ ...NUM, fontWeight: 900, fontSize: 15, color: NP >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(NP)}</td></tr>
        </tbody></table>
      </div>
    </div>
  )
}

// ── Balance sheet ────────────────────────────────────────────────────────────
export function BalanceSheet() {
  const [to, setTo] = useState(today()); const [tb, setTb] = useState([]); const [err, setErr] = useState(null)
  useEffect(() => { trialBalance('1900-01-01', to).then(setTb, e => setErr(e.message)) }, [to])
  const pick = type => tb.filter(r => r.type === type && r.closing !== 0).map(r => ({ ...r, v: r.closing }))
  const sum = a => round2(a.reduce((s, r) => s + r.v, 0))
  const A = pick('asset'), L = pick('liability'), E = pick('equity')
  const earnings = round2(sum(pick('income')) - sum(pick('expense')))
  const TA = sum(A), TL = sum(L), TE = round2(sum(E) + earnings), diff = round2(TA - TL - TE)
  return (
    <div>
      <Toolbar><span style={{ fontSize: 13 }}>As of</span><PeriodPicker to={to} setTo={setTo} single/><div style={{ flex: 1 }}/>
        <button onClick={() => window.print()} style={BTN}>🖨 Print</button></Toolbar>
      {err && <Msg msg={{ text: err }}/>}
      <div style={{ ...CARD, maxWidth: 720 }}>
        <div style={{ padding: '12px 14px', fontWeight: 800 }}>Balance sheet · as of {fmtDate(to)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          <Section title="Assets" rows={A} total={TA} strong/>
          <Section title="Liabilities" rows={L} total={TL}/>
          <Section title="Equity" rows={[...E, { code: '', name: 'Profit to date (not yet closed)', v: earnings }]} total={TE}/>
          <tr><td style={{ ...TD, fontWeight: 800 }}>Liabilities + equity</td><td style={{ ...NUM, fontWeight: 800, fontSize: 15 }}>{num2(TL + TE)}</td></tr>
        </tbody></table>
        <div style={{ padding: 12, fontSize: 12, color: Math.abs(diff) < 0.01 ? 'var(--green)' : 'var(--red)' }}>{Math.abs(diff) < 0.01 ? '✓ Balanced' : `⚠ Out of balance by ${num2(diff)}`}</div>
      </div>
    </div>
  )
}

// ── Trial balance ────────────────────────────────────────────────────────────
export function TrialBalance() {
  const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(today()); const [tb, setTb] = useState([])
  useEffect(() => { trialBalance(from, to).then(setTb, () => {}) }, [from, to])
  const rows = tb.filter(r => r.opening || r.debit || r.credit || r.closing)
  const nat = r => ['asset', 'expense'].includes(r.type) ? 1 : -1   // closing as debit(+)/credit(-)
  const dr = round2(rows.reduce((s, r) => s + Math.max(nat(r) * r.closing, 0), 0)), cr = round2(rows.reduce((s, r) => s + Math.max(-nat(r) * r.closing, 0), 0))
  return (
    <div>
      <Toolbar><PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}/><div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`trial-balance-${to}.csv`, rows.map(r => ({ code: r.code, account: r.name, type: r.type, opening: r.opening, debit: r.debit, credit: r.credit, closing: r.closing })))} style={BTN}>⬇ Excel</button></Toolbar>
      <Table head={['Account', { label: 'Opening', right: true }, { label: 'Debit', right: true }, { label: 'Credit', right: true }, { label: 'Closing Dr', right: true }, { label: 'Closing Cr', right: true }]}
        foot={<tr><td style={{ ...TD, fontWeight: 800 }}>Totals</td><td style={TD}/><td style={{ ...NUM, fontWeight: 700 }}>{num2(rows.reduce((s, r) => s + r.debit, 0))}</td><td style={{ ...NUM, fontWeight: 700 }}>{num2(rows.reduce((s, r) => s + r.credit, 0))}</td><td style={{ ...NUM, fontWeight: 800 }}>{num2(dr)}</td><td style={{ ...NUM, fontWeight: 800 }}>{num2(cr)}</td></tr>}>
        {rows.map(r => (
          <tr key={r.account_id}><td style={TD}>{r.code} {r.name}</td><td style={NUM}>{num2(r.opening)}</td><td style={NUM}>{num2(r.debit)}</td><td style={NUM}>{num2(r.credit)}</td>
            <td style={NUM}>{nat(r) * r.closing > 0 ? num2(nat(r) * r.closing) : ''}</td><td style={NUM}>{nat(r) * r.closing < 0 ? num2(-nat(r) * r.closing) : ''}</td></tr>
        ))}
      </Table>
      <div style={{ fontSize: 12, marginTop: 8, color: Math.abs(dr - cr) < 0.01 ? 'var(--green)' : 'var(--red)' }}>{Math.abs(dr - cr) < 0.01 ? '✓ Debits equal credits' : `⚠ Difference ${num2(dr - cr)}`}</div>
    </div>
  )
}

// ── VAT return (FTA VAT 201 summary) ─────────────────────────────────────────
export function VatReturn() {
  const q = quarterRange(); const [from, setFrom] = useState(q.from); const [to, setTo] = useState(q.to)
  const [d, setD] = useState(null); const [err, setErr] = useState(null)
  useEffect(() => {
    setErr(null); setD(null)
    ;(async () => {
      const [inv, bl, tb] = await Promise.all([
        fetchAllRows(() => supabase.from('fin_invoice_lines').select('net_amount,vat_amount,vat_rate,fin_invoices!inner(doc_type,status,issue_date,fin_clients(emirate))')
          .gte('fin_invoices.issue_date', from).lte('fin_invoices.issue_date', to).not('fin_invoices.status', 'in', '(draft,void)')),
        fetchAllRows(() => supabase.from('fin_bill_lines').select('amount,vat_amount,vat_rate,fin_bills!inner(status,bill_date,vendor_trn)')
          .gte('fin_bills.bill_date', from).lte('fin_bills.bill_date', to).not('fin_bills.status', 'in', '(draft,void)')),
        trialBalance(from, to),
      ])
      if (hasErr(inv.error)) throw inv.error
      if (hasErr(bl.error)) throw bl.error
      const box = { std: {}, zero: 0, cn: 0, cnVat: 0 }
      ;(inv.data || []).forEach(l => {
        const s = l.fin_invoices.doc_type === 'credit_note' ? -1 : 1, em = l.fin_invoices.fin_clients?.emirate || 'Dubai'
        if (+l.vat_rate > 0) { box.std[em] = box.std[em] || { net: 0, vat: 0 }; box.std[em].net += s * +l.net_amount; box.std[em].vat += s * +l.vat_amount }
        else box.zero += s * +l.net_amount
      })
      let expNet = 0, expVat = 0, noTrnVat = 0
      ;(bl.data || []).forEach(l => { if (+l.vat_rate > 0) { expNet += +l.amount; expVat += +l.vat_amount; if (!l.fin_bills.vendor_trn) noTrnVat += +l.vat_amount } })
      const led = k => tb.find(r => r.code === k) || { debit: 0, credit: 0 }
      setD({ box, expNet, expVat, noTrnVat, ledOut: round2(led('2100').credit - led('2100').debit), ledIn: round2(led('1300').debit - led('1300').credit) })
    })().catch(e => setErr(e.message || String(e)))
  }, [from, to])
  if (!d) return <div><Toolbar><PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}/></Toolbar>{err ? <Msg msg={{ text: `Could not build the VAT report: ${err}` }}/> : <Empty>Loading…</Empty>}</div>
  const outVat = round2(Object.values(d.box.std).reduce((s, x) => s + x.vat, 0)), outNet = round2(Object.values(d.box.std).reduce((s, x) => s + x.net, 0))
  const due = round2(outVat - d.expVat)
  const row = (n, l, net, vat, hint) => <tr><td style={{ ...TD, width: 40, color: 'var(--text3)' }}>{n}</td><td style={TD}>{l}{hint && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{hint}</div>}</td><td style={NUM}>{net == null ? '' : num2(net)}</td><td style={NUM}>{vat == null ? '' : num2(vat)}</td></tr>
  return (
    <div>
      <Toolbar><PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}/><div style={{ flex: 1 }}/><button onClick={() => window.print()} style={BTN}>🖨 Print</button></Toolbar>
      <div style={{ ...CARD, maxWidth: 820 }}>
        <div style={{ padding: '12px 14px', fontWeight: 800 }}>VAT return summary (VAT 201) · {fmtDate(from)} – {fmtDate(to)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Box</th><th style={TH}>Description</th><th style={{ ...TH, textAlign: 'right' }}>Amount (AED)</th><th style={{ ...TH, textAlign: 'right' }}>VAT (AED)</th></tr></thead>
          <tbody>
            {['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'].map((em, i) => row(`1${'abcdefg'[i]}`, `Standard rated supplies in ${em}`, round2(d.box.std[em]?.net || 0), round2(d.box.std[em]?.vat || 0)))}
            {row(4, 'Zero rated supplies', round2(d.box.zero), null)}
            {row(8, 'Totals (sales)', round2(outNet + d.box.zero), outVat)}
            {row(9, 'Standard rated expenses', round2(d.expNet), round2(d.expVat), d.noTrnVat ? `⚠ ${num2(d.noTrnVat)} VAT is on bills without a vendor TRN — check it is recoverable` : null)}
            {row(11, 'Totals (expenses)', round2(d.expNet), round2(d.expVat))}
            <tr><td style={TD}>12–14</td><td style={{ ...TD, fontWeight: 800 }}>{due >= 0 ? 'Net VAT payable to FTA' : 'Net VAT refundable'}</td><td style={TD}/><td style={{ ...NUM, fontWeight: 900, fontSize: 15, color: due >= 0 ? 'var(--red)' : 'var(--green)' }}>{num2(Math.abs(due))}</td></tr>
          </tbody>
        </table>
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text3)' }}>
          Credit notes are already deducted in box 1. Check with the ledger: output VAT {num2(d.ledOut)} / input VAT {num2(d.ledIn)}
          {(Math.abs(d.ledOut - outVat) > 0.01 || Math.abs(d.ledIn - d.expVat) > 0.01) && <span style={{ color: 'var(--amber)' }}> — differs from the documents (manual journals or voids in this period). Review before filing.</span>}
          <br/>File the return on the FTA EmaraTax portal; this page is your working paper. Reverse charge, imports and other adjustments are not covered here.
        </div>
      </div>
    </div>
  )
}

// ── Ageing (receivables / payables) ─────────────────────────────────────────
export function Ageing({ kind }) {
  const [rows, setRows] = useState([]); const [asOf, setAsOf] = useState(today())
  useEffect(() => {
    const p = kind === 'ar'
      ? fetchAllRows(() => supabase.from('fin_invoices').select('id,number,due_date,balance,client_id,fin_clients(name)').eq('doc_type', 'invoice').in('status', ['issued', 'partially_paid']))
      : fetchAllRows(() => supabase.from('fin_bills').select('id,number,due_date,balance,vendor_id,payee,vendors(name)').in('status', ['approved', 'partially_paid']))
    p.then(r => setRows(r.data || []))
  }, [kind])
  const B = ['Not due', '1–30', '31–60', '61–90', '90+']
  const bucket = d => { const n = daysBetween(d, asOf); return n <= 0 ? 0 : n <= 30 ? 1 : n <= 60 ? 2 : n <= 90 ? 3 : 4 }
  const by = {}
  rows.forEach(r => {
    const name = kind === 'ar' ? r.fin_clients?.name : (r.vendors?.name || r.payee)
    by[name] = by[name] || [0, 0, 0, 0, 0]; by[name][bucket(r.due_date)] += +r.balance
  })
  const tot = [0, 0, 0, 0, 0]; Object.values(by).forEach(a => a.forEach((v, i) => { tot[i] += v }))
  return (
    <div>
      <Toolbar><span style={{ fontSize: 13 }}>As of</span><input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={{ ...INP, width: 'auto' }}/><div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`${kind === 'ar' ? 'receivables' : 'payables'}-ageing-${asOf}.csv`, Object.entries(by).map(([n, a]) => ({ name: n, not_due: a[0], d1_30: a[1], d31_60: a[2], d61_90: a[3], d90_plus: a[4], total: a.reduce((s, v) => s + v, 0) })))} style={BTN}>⬇ Excel</button></Toolbar>
      <Table head={[kind === 'ar' ? 'Client' : 'Vendor', ...B.map(b => ({ label: b, right: true })), { label: 'Total', right: true }]}
        foot={<tr><td style={{ ...TD, fontWeight: 800 }}>Total</td>{tot.map((v, i) => <td key={i} style={{ ...NUM, fontWeight: 800, color: i >= 3 && v ? 'var(--red)' : undefined }}>{num2(v)}</td>)}<td style={{ ...NUM, fontWeight: 900 }}>{num2(tot.reduce((s, v) => s + v, 0))}</td></tr>}>
        {Object.entries(by).sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0)).map(([n, a]) => (
          <tr key={n}><td style={TD}>{n}</td>{a.map((v, i) => <td key={i} style={{ ...NUM, color: i >= 3 && v ? 'var(--red)' : v ? undefined : 'var(--text3)' }}>{v ? num2(v) : '—'}</td>)}<td style={{ ...NUM, fontWeight: 700 }}>{num2(a.reduce((s, v) => s + v, 0))}</td></tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>Nothing outstanding. 🎉</Empty>}
    </div>
  )
}

// ── General ledger for one account ──────────────────────────────────────────
export function GeneralLedger() {
  const [accounts, setAccounts] = useState([]); const [acct, setAcct] = useState(''); const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(today())
  const [rows, setRows] = useState([]); const [opening, setOpening] = useState(0)
  useEffect(() => { loadAccounts().then(a => { setAccounts(a); setAcct(a.find(x => x.system_key === 'bank')?.id || a[0]?.id || '') }) }, [])
  useEffect(() => {
    if (!acct) return
    (async () => {
      const [tb, l] = await Promise.all([trialBalance(from, to), fetchAllRows(() => supabase.from('fin_ledger').select('*').eq('account_id', acct).gte('entry_date', from).lte('entry_date', to).order('entry_date').order('id'))])
      setOpening(tb.find(r => r.account_id === acct)?.opening || 0); setRows(l.data || [])
    })()
  }, [acct, from, to])
  const a = accounts.find(x => x.id === acct); const sign = a && ['asset', 'expense'].includes(a.type) ? 1 : -1
  let run = opening
  const lines = rows.map(r => { run = round2(run + sign * (+r.debit - +r.credit)); return { ...r, run } })
  const link = r => r.source_type === 'invoice' ? `/finance/invoices/${r.source_id}` : r.source_type === 'credit_note' ? `/finance/credit-notes/${r.source_id}` : ['bill', 'bill_void'].includes(r.source_type) ? `/finance/bills/${r.source_id}` : r.source_type === 'invoice_void' ? `/finance/invoices/${r.source_id}` : null
  return (
    <div>
      <Toolbar>
        <select value={acct} onChange={e => setAcct(e.target.value)} style={{ ...INP, width: 'auto', maxWidth: 280 }}>{accounts.map(x => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}</select>
        <PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}/><div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`ledger-${a?.code}-${from}-${to}.csv`, lines.map(r => ({ date: r.entry_date, memo: r.memo, reference: r.reference, debit: r.debit, credit: r.credit, balance: r.run })))} style={BTN}>⬇ Excel</button>
      </Toolbar>
      <Table head={['Date', 'Entry', 'Ref', { label: 'Debit', right: true }, { label: 'Credit', right: true }, { label: 'Balance', right: true }]}>
        <tr><td style={TD}>{fmtDate(from)}</td><td style={{ ...TD, fontWeight: 700 }} colSpan={4}>Opening balance</td><td style={{ ...NUM, fontWeight: 700 }}>{num2(opening)}</td></tr>
        {lines.map(r => (
          <tr key={r.id}><td style={TD}>{fmtDate(r.entry_date)}</td>
            <td style={TD}>{link(r) ? <a href={link(r)} style={{ color: 'var(--blue)' }}>{r.memo}</a> : r.memo}{r.reconciled_at && <span title="Reconciled" style={{ color: 'var(--green)' }}> ✓</span>}</td>
            <td style={TD}>{r.reference || ''}</td><td style={NUM}>{+r.debit ? num2(r.debit) : ''}</td><td style={NUM}>{+r.credit ? num2(r.credit) : ''}</td><td style={{ ...NUM, fontWeight: 600 }}>{num2(r.run)}</td></tr>
        ))}
      </Table>
    </div>
  )
}

// ── Journal: list + manual entries ──────────────────────────────────────────
const blankJL = () => ({ key: Math.random().toString(36).slice(2), account_id: '', debit: '', credit: '', description: '', client_id: '' })

function JournalForm({ accounts, preset, onClose, onSaved }) {
  const [f, setF] = useState({ entry_date: today(), memo: preset?.memo || '', reference: '' })
  const [lines, setLines] = useState(preset?.lines || [blankJL(), blankJL()])
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const setL = (i, p) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...p } : l))
  const dr = round2(lines.reduce((s, l) => s + (+l.debit || 0), 0)), cr = round2(lines.reduce((s, l) => s + (+l.credit || 0), 0))
  async function save() {
    const clean = lines.filter(l => l.account_id && ((+l.debit || 0) > 0 || (+l.credit || 0) > 0))
    if (!f.memo.trim()) return setMsg({ text: 'Write what this entry is for' })
    if (clean.length < 2) return setMsg({ text: 'An entry needs at least two lines' })
    if (clean.some(l => +l.debit > 0 && +l.credit > 0)) return setMsg({ text: 'A line is either debit or credit, not both' })
    if (dr !== cr) return setMsg({ text: `Debits (${num2(dr)}) must equal credits (${num2(cr)})` })
    setBusy(true)
    const j = await supabase.from('fin_journal').insert({ entry_date: f.entry_date, memo: f.memo.trim(), reference: f.reference || null, source_type: 'manual' }).select('id').single()
    if (hasErr(j.error)) { setBusy(false); return setMsg({ text: j.error.message }) }
    const { error } = await supabase.from('fin_journal_lines').insert(clean.map(l => ({ journal_id: j.data.id, account_id: l.account_id, debit: +l.debit || 0, credit: +l.credit || 0, description: l.description || null, client_id: l.client_id || null })))
    if (hasErr(error)) { await supabase.from('fin_journal').delete().eq('id', j.data.id); setBusy(false); return setMsg({ text: error.message }) }
    setBusy(false); onSaved()
  }
  return (
    <Modal title="Manual journal entry" onClose={onClose} busy={busy} width={860}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 180px', gap: 10, marginBottom: 10 }}>
        <Field label="Date"><input type="date" value={f.entry_date} onChange={e => setF({ ...f, entry_date: e.target.value })} style={INP}/></Field>
        <Field label="What is it for *"><input value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })} style={INP} placeholder="e.g. Owner put money into the bank"/></Field>
        <Field label="Reference"><input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} style={INP}/></Field>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ fontSize: 11, color: 'var(--text3)' }}><th style={{ textAlign: 'left' }}>Account</th><th style={{ textAlign: 'left' }}>Line note</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th/></tr></thead>
        <tbody>{lines.map((l, i) => (
          <tr key={l.key}>
            <td style={{ padding: 3 }}><select value={l.account_id} onChange={e => setL(i, { account_id: e.target.value })} style={INP}><option value="">Account…</option>{accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
            <td style={{ padding: 3 }}><input value={l.description} onChange={e => setL(i, { description: e.target.value })} style={INP}/></td>
            <td style={{ padding: 3, width: 120 }}><input type="number" min="0" step="any" value={l.debit} onChange={e => setL(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} style={{ ...INP, textAlign: 'right' }}/></td>
            <td style={{ padding: 3, width: 120 }}><input type="number" min="0" step="any" value={l.credit} onChange={e => setL(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} style={{ ...INP, textAlign: 'right' }}/></td>
            <td style={{ padding: 3 }}><button onClick={() => setLines(ls => ls.length > 2 ? ls.filter((_, j) => j !== i) : ls)} style={{ ...BTN, padding: '3px 7px', color: 'var(--red)' }}>✕</button></td>
          </tr>))}</tbody>
        <tfoot><tr><td><button onClick={() => setLines(ls => [...ls, blankJL()])} style={{ ...BTN, marginTop: 6 }}>+ Line</button></td><td style={{ textAlign: 'right', fontSize: 12, color: dr === cr ? 'var(--green)' : 'var(--red)' }}>{dr === cr ? 'Balanced ✓' : `Difference ${num2(dr - cr)}`}</td>
          <td style={{ textAlign: 'right', fontWeight: 700, padding: 4 }}>{num2(dr)}</td><td style={{ textAlign: 'right', fontWeight: 700, padding: 4 }}>{num2(cr)}</td><td/></tr></tfoot>
      </table>
      <Msg msg={msg}/>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={BTN}>Cancel</button><button onClick={save} disabled={busy} style={PRIMARY}>{busy ? 'Saving…' : 'Post entry'}</button>
      </div>
    </Modal>
  )
}

export function Journal() {
  const [from, setFrom] = useState(monthStart()); const [to, setTo] = useState(today())
  const [rows, setRows] = useState([]); const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState(null); const [msg, setMsg] = useState(null); const [src, setSrc] = useState('all')
  useEffect(() => { loadAccounts().then(setAccounts) }, [])
  useEffect(() => { load() }, [from, to])
  async function load() {
    const { data } = await fetchAllRows(() => supabase.from('fin_journal').select('*, fin_journal_lines(id,debit,credit,description,fin_accounts(code,name))').gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: false }).order('created_at', { ascending: false }))
    setRows(data || [])
  }
  async function del(j) {
    if (!window.confirm('Delete this manual entry?')) return
    const { error } = await supabase.from('fin_journal').delete().eq('id', j.id)
    if (hasErr(error)) setMsg({ text: error.message }); else load()
  }
  const bank = accounts.find(a => a.system_key === 'bank')?.id, cap = accounts.find(a => a.system_key === 'capital')?.id, draw = accounts.find(a => a.system_key === 'drawings')?.id
  const presets = [
    ['Opening balances', { memo: 'Opening balances', lines: [{ ...blankJL(), account_id: bank || '' }, { ...blankJL(), account_id: cap || '' }] }],
    ['Owner added money', { memo: 'Owner capital introduced', lines: [{ ...blankJL(), account_id: bank || '' }, { ...blankJL(), account_id: cap || '' }] }],
    ['Owner took money', { memo: 'Owner drawings', lines: [{ ...blankJL(), account_id: draw || '' }, { ...blankJL(), account_id: bank || '' }] }],
  ]
  const list = rows.filter(r => src === 'all' || (src === 'manual' ? r.source_type === 'manual' : r.source_type !== 'manual'))
  return (
    <div>
      <Toolbar>
        <PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo}/>
        <select value={src} onChange={e => setSrc(e.target.value)} style={{ ...INP, width: 'auto' }}><option value="all">All entries</option><option value="manual">Manual only</option><option value="auto">Automatic only</option></select>
        <div style={{ flex: 1 }}/>
        {presets.map(([l, p]) => <button key={l} onClick={() => setForm(p)} style={{ ...BTN, fontSize: 12 }}>{l}</button>)}
        <button onClick={() => setForm({})} style={PRIMARY}>+ Journal entry</button>
      </Toolbar>
      <Msg msg={msg}/>
      {list.map(j => (
        <div key={j.id} style={{ ...CARD, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div><b>{fmtDate(j.entry_date)}</b> · {j.memo} {j.reference && <span style={{ color: 'var(--text3)' }}>· {j.reference}</span>}
              <span style={{ fontSize: 11, marginLeft: 6, color: j.source_type === 'manual' ? 'var(--purple)' : 'var(--text3)' }}>{j.source_type === 'manual' ? 'manual' : 'auto · ' + j.source_type.replace('_', ' ')}</span></div>
            {j.source_type === 'manual' && <button onClick={() => del(j)} style={{ ...BTN, padding: '2px 8px', fontSize: 11, color: 'var(--red)' }}>Delete</button>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><tbody>
            {(j.fin_journal_lines || []).sort((a, b) => +b.debit - +a.debit).map(l => (
              <tr key={l.id}><td style={{ padding: '2px 4px', paddingLeft: +l.credit ? 28 : 4 }}>{l.fin_accounts?.code} {l.fin_accounts?.name}{l.description ? <span style={{ color: 'var(--text3)' }}> · {l.description}</span> : null}</td>
                <td style={{ padding: '2px 4px', textAlign: 'right', width: 110 }}>{+l.debit ? num2(l.debit) : ''}</td><td style={{ padding: '2px 4px', textAlign: 'right', width: 110 }}>{+l.credit ? num2(l.credit) : ''}</td></tr>
            ))}
          </tbody></table>
        </div>
      ))}
      {list.length === 0 && <Empty>No entries in this period.</Empty>}
      {form && <JournalForm accounts={accounts} preset={form.lines ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); setMsg({ type: 'ok', text: '✅ Entry posted.' }) }}/>}
    </div>
  )
}

// ── Chart of accounts ───────────────────────────────────────────────────────
export function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]); const [bal, setBal] = useState({}); const [form, setForm] = useState(null); const [msg, setMsg] = useState(null)
  useEffect(() => { load() }, [])
  async function load() {
    const [a, tb] = await Promise.all([loadAccounts(), trialBalance('1900-01-01', today()).catch(() => [])])
    setAccounts(a); const b = {}; tb.forEach(r => { b[r.account_id] = r.closing }); setBal(b)
  }
  async function save() {
    if (!form.code?.trim() || !form.name?.trim()) return setMsg({ text: 'Code and name are required' })
    const row = { code: form.code.trim(), name: form.name.trim(), type: form.type, subtype: form.subtype || null, description: form.description || null, is_active: form.is_active !== false }
    const { error } = form.id ? await supabase.from('fin_accounts').update(form.system_key ? { name: row.name, description: row.description, is_active: row.is_active } : row).eq('id', form.id)
      : await supabase.from('fin_accounts').insert(row)
    if (hasErr(error)) return setMsg({ text: error.message.includes('duplicate') ? 'That account code is already used' : error.message })
    setForm(null); setMsg(null); load()
  }
  return (
    <div>
      <Toolbar><span style={{ fontSize: 13, color: 'var(--text3)' }}>Accounts marked 🔒 are used by automatic posting and can be renamed but not removed.</span><div style={{ flex: 1 }}/>
        <button onClick={() => setForm({ code: '', name: '', type: 'expense', subtype: '', is_active: true })} style={PRIMARY}>+ New account</button></Toolbar>
      <Msg msg={msg}/>
      {Object.entries(TYPE_LABEL).map(([type, label]) => (
        <div key={type} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, margin: '4px 0 6px' }}>{label}</div>
          <Table head={['Code', 'Account', 'Kind', { label: 'Balance', right: true }]}>
            {accounts.filter(a => a.type === type).map(a => (
              <tr key={a.id} onClick={() => setForm({ ...a })} style={{ cursor: 'pointer', opacity: a.is_active ? 1 : 0.5 }}>
                <td style={{ ...TD, fontFamily: 'monospace', width: 70 }}>{a.code}</td><td style={TD}>{a.system_key ? '🔒 ' : ''}{a.name}{!a.is_active && ' (inactive)'}</td>
                <td style={{ ...TD, color: 'var(--text3)' }}>{a.subtype === 'cogs' ? 'cost of sales' : a.subtype || ''}</td><td style={NUM}>{num2(bal[a.id] || 0)}</td>
              </tr>
            ))}
          </Table>
        </div>
      ))}
      {form && (
        <Modal title={form.id ? 'Edit account' : 'New account'} onClose={() => setForm(null)} width={480}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
            <Field label="Code"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} disabled={!!form.system_key} style={INP}/></Field>
            <Field label="Name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={INP}/></Field>
            <Field label="Type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} disabled={!!form.id} style={INP}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Kind">
              <select value={form.subtype || ''} onChange={e => setForm({ ...form, subtype: e.target.value })} disabled={!!form.system_key} style={INP}>
                <option value="">General</option>
                {form.type === 'asset' && <><option value="bank">Bank account</option><option value="cash">Cash</option><option value="current">Current asset</option><option value="fixed">Fixed asset</option></>}
                {form.type === 'expense' && <option value="cogs">Cost of sales (direct job cost)</option>}
                {form.type === 'liability' && <option value="current">Current liability</option>}
              </select>
            </Field>
            <Field label="Description" span><input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={INP}/></Field>
            {form.id && !form.system_key && <label style={{ fontSize: 13, display: 'flex', gap: 6, gridColumn: '1 / -1' }}><input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })}/> Active</label>}
          </div>
          <Msg msg={msg}/>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}><button onClick={() => setForm(null)} style={BTN}>Cancel</button><button onClick={save} style={PRIMARY}>Save</button></div>
        </Modal>
      )}
    </div>
  )
}

// ── Bank reconciliation ─────────────────────────────────────────────────────
export function BankRec() {
  const [accounts, setAccounts] = useState([]); const [acct, setAcct] = useState('')
  const [date, setDate] = useState(today()); const [stmt, setStmt] = useState('')
  const [lines, setLines] = useState([]); const [cleared, setCleared] = useState(0); const [tick, setTick] = useState(new Set())
  const [hist, setHist] = useState([]); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false)
  const banks = useMemo(() => accounts.filter(a => ['bank', 'cash'].includes(a.subtype)), [accounts])
  useEffect(() => { loadAccounts().then(a => { setAccounts(a); setAcct(a.find(x => x.subtype === 'bank')?.id || '') }) }, [])
  useEffect(() => { if (acct) load() }, [acct, date])
  async function load() {
    const [open, done, h] = await Promise.all([
      fetchAllRows(() => supabase.from('fin_ledger').select('*').eq('account_id', acct).is('reconciled_at', null).lte('entry_date', date).order('entry_date')),
      fetchAllRows(() => supabase.from('fin_ledger').select('debit,credit').eq('account_id', acct).not('reconciled_at', 'is', null)),
      supabase.from('fin_reconciliations').select('*').eq('account_id', acct).order('statement_date', { ascending: false }).limit(12),
    ])
    setLines(open.data || []); setTick(new Set())
    setCleared(round2((done.data || []).reduce((s, r) => s + +r.debit - +r.credit, 0))); setHist(h.data || [])
  }
  const ticked = round2(lines.filter(l => tick.has(l.id)).reduce((s, l) => s + +l.debit - +l.credit, 0))
  const clearedNow = round2(cleared + ticked), diff = stmt === '' ? null : round2(+stmt - clearedNow)
  async function finish() {
    if (diff !== 0) return setMsg({ text: 'The difference must be 0.00 before you can finish.' })
    setBusy(true)
    const ids = [...tick]
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('fin_journal_lines').update({ reconciled_at: date }).in('id', ids.slice(i, i + 200))
      if (hasErr(error)) { setBusy(false); return setMsg({ text: error.message }) }
    }
    await supabase.from('fin_reconciliations').insert({ account_id: acct, statement_date: date, statement_balance: +stmt })
    setBusy(false); setMsg({ type: 'ok', text: `✅ Reconciled ${ids.length} transactions to ${fmtDate(date)}.` }); setStmt(''); load()
  }
  async function undo(r) {
    if (!window.confirm(`Undo the reconciliation of ${fmtDate(r.statement_date)}? Its transactions become un-cleared again.`)) return
    await supabase.from('fin_journal_lines').update({ reconciled_at: null }).eq('account_id', acct).eq('reconciled_at', r.statement_date)
    await supabase.from('fin_reconciliations').delete().eq('id', r.id); load()
  }
  return (
    <div>
      <Toolbar>
        <select value={acct} onChange={e => setAcct(e.target.value)} style={{ ...INP, width: 'auto' }}>{banks.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
        <span style={{ fontSize: 13 }}>Statement date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...INP, width: 'auto' }}/>
        <span style={{ fontSize: 13 }}>Statement closing balance</span><input type="number" step="any" value={stmt} onChange={e => setStmt(e.target.value)} style={{ ...INP, width: 150 }} placeholder="from bank statement"/>
      </Toolbar>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Previously cleared" value={money(cleared)}/><Stat label="Ticked now" value={money(ticked)}/>
        <Stat label="Cleared balance" value={money(clearedNow)}/>
        <Stat label="Difference" value={diff == null ? '—' : money(diff)} color={diff === 0 ? 'var(--green)' : 'var(--red)'}/>
      </div>
      <Msg msg={msg}/>
      <Toolbar>
        <button onClick={() => setTick(new Set(lines.map(l => l.id)))} style={BTN}>Tick all</button><button onClick={() => setTick(new Set())} style={BTN}>Clear ticks</button><div style={{ flex: 1 }}/>
        <button onClick={finish} disabled={busy || diff !== 0 || !tick.size} style={{ ...PRIMARY, opacity: diff === 0 && tick.size ? 1 : 0.5 }}>✔ Finish reconciliation</button>
      </Toolbar>
      <Table head={['', 'Date', 'Entry', 'Ref', { label: 'Money in', right: true }, { label: 'Money out', right: true }]}>
        {lines.map(l => (
          <tr key={l.id} onClick={() => setTick(p => { const n = new Set(p); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} style={{ cursor: 'pointer', background: tick.has(l.id) ? 'var(--green-bg)' : undefined }}>
            <td style={TD}><input type="checkbox" readOnly checked={tick.has(l.id)} style={{ accentColor: 'var(--green)' }}/></td>
            <td style={TD}>{fmtDate(l.entry_date)}</td><td style={TD}>{l.memo}</td><td style={TD}>{l.reference || ''}</td>
            <td style={{ ...NUM, color: 'var(--green)' }}>{+l.debit ? num2(l.debit) : ''}</td><td style={{ ...NUM, color: 'var(--red)' }}>{+l.credit ? num2(l.credit) : ''}</td>
          </tr>
        ))}
      </Table>
      {lines.length === 0 && <Empty>Everything up to this date is reconciled.</Empty>}
      {hist.length > 0 && (
        <div style={{ marginTop: 14 }}><b style={{ fontSize: 13 }}>Past reconciliations</b>
          {hist.map((r, i) => <div key={r.id} style={{ fontSize: 13, display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{fmtDate(r.statement_date)}</span><span>balance {money(r.statement_balance)}</span>{i === 0 && <button onClick={() => undo(r)} style={{ ...BTN, padding: '1px 8px', fontSize: 11, color: 'var(--red)' }}>Undo</button>}</div>)}
        </div>
      )}
    </div>
  )
}

export function Reports() {
  const [r, setR] = useState('pl')
  const tabs = [['pl', 'Profit & loss'], ['bs', 'Balance sheet'], ['tb', 'Trial balance'], ['vat', 'VAT return'], ['ar', 'Receivables ageing'], ['ap', 'Payables ageing'], ['gl', 'General ledger']]
  return (
    <div>
      <div className="fx-no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setR(k)} style={{ ...BTN, padding: '6px 12px', fontSize: 12, ...(r === k ? { background: 'var(--text)', color: 'var(--bg)', borderColor: 'var(--text)' } : {}) }}>{l}</button>)}
      </div>
      {r === 'pl' && <ProfitLoss/>}{r === 'bs' && <BalanceSheet/>}{r === 'tb' && <TrialBalance/>}{r === 'vat' && <VatReturn/>}
      {r === 'ar' && <Ageing kind="ar"/>}{r === 'ap' && <Ageing kind="ap"/>}{r === 'gl' && <GeneralLedger/>}
    </div>
  )
}

