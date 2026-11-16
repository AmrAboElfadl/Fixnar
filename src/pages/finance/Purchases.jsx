import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { hasErr, money, num2, today, addDays, fmtDate, daysBetween, round2, loadAccounts, loadClients, downloadCsv, signedUrl, BILL_STATUS, PAY_METHODS } from '../../lib/finance'
import { INP, BTN, PRIMARY, DANGER, CARD, TD, NUM, Field, Pill, Modal, Msg, Empty, Table, Toolbar, Stat } from './ui'

export function BillsList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([]); const [status, setStatus] = useState('open'); const [q, setQ] = useState('')
  useEffect(() => {
    fetchAllRows(() => supabase.from('fin_bills').select('*, vendors(name), fin_clients(name)').order('bill_date', { ascending: false }))
      .then(r => setRows(r.data || []))
  }, [])
  const t = today()
  const list = rows.filter(r =>
    (status === 'all' || (status === 'open' ? ['approved', 'partially_paid'].includes(r.status) : r.status === status)) &&
    (!q || `${r.number || ''} ${r.vendor_ref || ''} ${r.vendors?.name || ''} ${r.payee || ''}`.toLowerCase().includes(q.toLowerCase())))
  const unpaid = rows.filter(r => ['approved', 'partially_paid'].includes(r.status))
  const month = rows.filter(r => !['draft', 'void'].includes(r.status) && r.bill_date >= t.slice(0, 8) + '01')
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="You owe vendors" value={money(unpaid.reduce((s, r) => s + +r.balance, 0))} color="var(--red)" sub={`${unpaid.length} bills`}/>
        <Stat label="Due in 7 days" value={money(unpaid.filter(r => r.due_date <= addDays(t, 7)).reduce((s, r) => s + +r.balance, 0))} color="var(--amber)"/>
        <Stat label="Costs this month (excl. VAT)" value={money(month.reduce((s, r) => s + +r.subtotal, 0))}/>
      </div>
      <Toolbar>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendor, bill no…" style={{ ...INP, maxWidth: 240 }}/>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...INP, width: 'auto' }}>
          <option value="open">Unpaid</option><option value="all">All</option>{Object.entries(BILL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ flex: 1 }}/>
        <button onClick={() => downloadCsv(`bills-${t}.csv`, list.map(r => ({ number: r.number || 'DRAFT', date: r.bill_date, due: r.due_date, vendor: r.vendors?.name || r.payee, vendor_ref: r.vendor_ref, vendor_trn: r.vendor_trn, net: r.subtotal, vat: r.vat_amount, total: r.total, paid: r.amount_paid, balance: r.balance, status: r.status })))} style={BTN}>⬇ Excel</button>
        <button onClick={() => navigate('/finance/bills/new')} style={PRIMARY}>+ New bill / expense</button>
      </Toolbar>
      <Table head={['Number', 'Date', 'Due', 'Vendor / payee', 'Job', 'Status', { label: 'Total', right: true }, { label: 'Balance', right: true }]}>
        {list.map(r => {
          const late = ['approved', 'partially_paid'].includes(r.status) && r.due_date < t
          return (
            <tr key={r.id} onClick={() => navigate(`/finance/bills/${r.id}`)} style={{ cursor: 'pointer' }}>
              <td style={{ ...TD, fontWeight: 700, fontFamily: 'monospace' }}>{r.number || 'DRAFT'}{r.vendor_ref && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'inherit' }}>ref {r.vendor_ref}</div>}</td>
              <td style={TD}>{fmtDate(r.bill_date)}</td>
              <td style={{ ...TD, color: late ? 'var(--red)' : undefined }}>{fmtDate(r.due_date)}{late && <div style={{ fontSize: 11 }}>{daysBetween(r.due_date, t)} days late</div>}</td>
              <td style={TD}>{r.vendors?.name || r.payee}</td>
              <td style={TD}>{r.fin_clients?.name || '—'}</td>
              <td style={TD}><Pill status={r.status} labels={BILL_STATUS}/></td>
              <td style={NUM}>{money(r.total)}</td>
              <td style={{ ...NUM, fontWeight: 700 }}>{r.status === 'void' ? '—' : money(r.balance)}</td>
            </tr>
          )
        })}
      </Table>
      {list.length === 0 && <Empty>No bills here. Add vendor invoices and everyday expenses (fuel, rent, visas…) so your profit is real.</Empty>}
    </div>
  )
}

const newBillLine = (acct = '') => ({ key: Math.random().toString(36).slice(2), description: '', account_id: acct, amount: '', vat_rate: 5 })

function PayBillModal({ bill, accounts, onClose, onSaved }) {
  const from = accounts.filter(a => ['bank', 'cash'].includes(a.subtype) && a.is_active)
  const [f, setF] = useState({ pay_date: today(), amount: bill.balance, method: 'bank', account_id: from.find(a => a.subtype === 'bank')?.id || from[0]?.id, reference: '' })
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    setBusy(true)
    const { error } = await supabase.from('fin_bill_payments').insert({ ...f, amount: +f.amount, bill_id: bill.id })
    setBusy(false)
    if (hasErr(error)) return setMsg({ text: error.message })
    onSaved()
  }
  return (
    <Modal title={`Pay bill ${bill.number}`} onClose={onClose} busy={busy} width={460}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Balance: <b>{money(bill.balance)}</b></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Amount"><input type="number" min="0" step="any" value={f.amount} onChange={e => set('amount', e.target.value)} style={INP}/></Field>
        <Field label="Date"><input type="date" value={f.pay_date} onChange={e => set('pay_date', e.target.value)} style={INP}/></Field>
        <Field label="Method"><select value={f.method} onChange={e => set('method', e.target.value)} style={INP}>{PAY_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Paid from"><select value={f.account_id} onChange={e => set('account_id', e.target.value)} style={INP}>{from.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
        <Field label="Reference" span><input value={f.reference} onChange={e => set('reference', e.target.value)} style={INP}/></Field>
      </div>
      <Msg msg={msg}/>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={BTN}>Cancel</button><button onClick={save} disabled={busy} style={PRIMARY}>{busy ? 'Saving…' : 'Save payment'}</button>
      </div>
    </Modal>
  )
}

export function BillEditor({ id }) {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([]); const [vendors, setVendors] = useState([]); const [clients, setClients] = useState([])
  const [bill, setBill] = useState(null); const [lines, setLines] = useState([]); const [pays, setPays] = useState([])
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(null); const [payOpen, setPayOpen] = useState(false)
  const [file, setFile] = useState(null); const [fileUrl, setFileUrl] = useState(null)
  const costAccounts = useMemo(() => accounts.filter(a => (a.type === 'expense' || (a.type === 'asset' && ['fixed', 'current'].includes(a.subtype))) && a.is_active), [accounts])

  useEffect(() => { load() }, [id])
  async function load() {
    const [a, v, c] = await Promise.all([loadAccounts(), supabase.from('vendors').select('id,name').order('name'), loadClients()])
    setAccounts(a); setVendors(v.data || []); setClients(c)
    const def = a.find(x => x.system_key === 'cogs')?.id || ''
    if (id && id !== 'new') {
      const [b, l, p] = await Promise.all([
        supabase.from('fin_bills').select('*').eq('id', id).maybeSingle(),
        supabase.from('fin_bill_lines').select('*').eq('bill_id', id).order('sort'),
        supabase.from('fin_bill_payments').select('*, fin_accounts(name)').eq('bill_id', id).order('pay_date'),
      ])
      setBill(b.data); setLines((l.data || []).map(x => ({ ...x, key: x.id }))); setPays(p.data || [])
      setFileUrl(await signedUrl(b.data?.attachment_path))
    } else {
      setBill({ status: 'draft', vendor_id: '', payee: '', vendor_ref: '', vendor_trn: '', client_id: '', bill_date: today(), due_date: '', notes: '' })
      setLines([newBillLine(def)]); setPays([])
    }
  }
  if (!bill) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
  const editable = bill.status === 'draft'
  const set = (k, v) => setBill(p => ({ ...p, [k]: v }))
  const setLine = (i, p) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...p } : l))
  const net = round2(lines.reduce((s, l) => s + (+l.amount || 0), 0))
  const vat = round2(lines.reduce((s, l) => s + round2((+l.amount || 0) * (+l.vat_rate || 0) / 100), 0))

  async function save(approve) {
    if (!bill.vendor_id && !bill.payee?.trim()) return setMsg({ text: 'Choose a vendor or type who was paid' })
    const clean = lines.filter(l => l.description.trim() && +l.amount > 0 && l.account_id)
    if (!clean.length) return setMsg({ text: 'Add at least one line with description, account and amount' })
    setBusy('save'); setMsg(null)
    try {
      const head = { vendor_id: bill.vendor_id || null, payee: bill.payee || null, vendor_ref: bill.vendor_ref || null, vendor_trn: bill.vendor_trn || null,
        client_id: bill.client_id || null, bill_date: bill.bill_date, due_date: bill.due_date || null, notes: bill.notes || null }
      let bid = bill.id
      if (bid) { const { error } = await supabase.from('fin_bills').update(head).eq('id', bid); if (hasErr(error)) throw error }
      else { const r = await supabase.from('fin_bills').insert(head).select('id').single(); if (hasErr(r.error)) throw r.error; bid = r.data.id }
      if (file) {
        const path = `finance/bills/${bid}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type })
        if (hasErr(up.error)) throw up.error
        await supabase.from('fin_bills').update({ attachment_path: path }).eq('id', bid)
      }
      const d = await supabase.from('fin_bill_lines').delete().eq('bill_id', bid); if (hasErr(d.error)) throw d.error
      const ins = await supabase.from('fin_bill_lines').insert(clean.map((l, i) => ({ bill_id: bid, sort: i, description: l.description.trim(), account_id: l.account_id, amount: +l.amount, vat_rate: +l.vat_rate })))
      if (hasErr(ins.error)) throw ins.error
      if (approve) { const { error } = await supabase.from('fin_bills').update({ status: 'approved' }).eq('id', bid); if (hasErr(error)) throw error }
      setFile(null)
      if (!bill.id) navigate(`/finance/bills/${bid}`, { replace: true }); else await load()
      setMsg({ type: 'ok', text: approve ? '✅ Bill approved and posted to the accounts.' : '✅ Saved.' })
    } catch (e) { setMsg({ text: e.message || String(e) }) } finally { setBusy('') }
  }
  async function voidBill() {
    if (!window.confirm('Void this bill? A reversing entry will be posted.')) return
    const { error } = await supabase.from('fin_bills').update({ status: 'void' }).eq('id', bill.id)
    if (hasErr(error)) setMsg({ text: error.message }); else load()
  }
  async function delDraft() {
    if (!window.confirm('Delete this draft?')) return
    const { error } = await supabase.from('fin_bills').delete().eq('id', bill.id)
    if (hasErr(error)) setMsg({ text: error.message }); else navigate('/finance/bills')
  }
  async function delPay(p) {
    if (!window.confirm(`Delete payment ${money(p.amount)}?`)) return
    const { error } = await supabase.from('fin_bill_payments').delete().eq('id', p.id)
    if (hasErr(error)) setMsg({ text: error.message }); else load()
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <button onClick={() => navigate('/finance/bills')} style={{ ...BTN, padding: '4px 10px', fontSize: 12 }}>← Back</button>
          <h2 style={{ margin: '8px 0 2px', fontSize: 21 }}>Bill / expense {bill.number ? <span style={{ fontFamily: 'monospace' }}>{bill.number}</span> : <span style={{ color: 'var(--text3)' }}>(draft)</span>}</h2>
          <Pill status={bill.status} labels={BILL_STATUS}/>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {editable && <button onClick={() => save(false)} disabled={!!busy} style={BTN}>💾 Save draft</button>}
          {editable && <button onClick={() => save(true)} disabled={!!busy} style={PRIMARY}>✔ Approve & post</button>}
          {['approved', 'partially_paid'].includes(bill.status) && <button onClick={() => setPayOpen(true)} style={PRIMARY}>💸 Pay</button>}
          {['approved'].includes(bill.status) && !pays.length && <button onClick={voidBill} style={DANGER}>Void</button>}
          {bill.id && editable && <button onClick={delDraft} style={DANGER}>Delete draft</button>}
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{ ...CARD, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <Field label="Vendor"><select value={bill.vendor_id || ''} onChange={e => set('vendor_id', e.target.value)} disabled={!editable} style={INP}><option value="">— none (type payee) —</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          {!bill.vendor_id && <Field label="Paid to (payee)"><input value={bill.payee || ''} onChange={e => set('payee', e.target.value)} disabled={!editable} style={INP} placeholder="ENOC, Salik, landlord…"/></Field>}
          <Field label="Vendor invoice no."><input value={bill.vendor_ref || ''} onChange={e => set('vendor_ref', e.target.value)} disabled={!editable} style={INP}/></Field>
          <Field label="Vendor TRN (for VAT claim)"><input value={bill.vendor_trn || ''} onChange={e => set('vendor_trn', e.target.value.replace(/\D/g, '').slice(0, 15))} disabled={!editable} style={INP}/></Field>
          <Field label="Bill date"><input type="date" value={bill.bill_date} onChange={e => set('bill_date', e.target.value)} disabled={!editable} style={INP}/></Field>
          <Field label="Due date"><input type="date" value={bill.due_date || ''} onChange={e => set('due_date', e.target.value)} disabled={!editable} style={INP}/></Field>
          <Field label="For client (job cost)"><select value={bill.client_id || ''} onChange={e => set('client_id', e.target.value)} disabled={!editable} style={INP}><option value="">— overhead —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Attach vendor invoice (PDF/photo)">
            {editable ? <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }}/> : null}
            {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--blue)' }}>📎 View attachment</a>}
          </Field>
          <Field label="Notes" span><input value={bill.notes || ''} onChange={e => set('notes', e.target.value)} style={INP} disabled={!editable}/></Field>
        </div>
      </div>
      <div style={{ ...CARD, padding: 10, marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr style={{ fontSize: 11, color: 'var(--text3)' }}><th style={{ textAlign: 'left', padding: 4 }}>Description</th><th style={{ textAlign: 'left', padding: 4 }}>Account</th><th style={{ textAlign: 'right', padding: 4 }}>Amount (excl. VAT)</th><th style={{ textAlign: 'right', padding: 4 }}>VAT</th><th style={{ textAlign: 'right', padding: 4 }}>Total</th><th/></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td style={{ padding: 4 }}><input value={l.description} onChange={e => setLine(i, { description: e.target.value })} disabled={!editable} style={INP}/></td>
                <td style={{ padding: 4, width: 230 }}><select value={l.account_id} onChange={e => setLine(i, { account_id: e.target.value })} disabled={!editable} style={INP}>{costAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                <td style={{ padding: 4, width: 120 }}><input type="number" min="0" step="any" value={l.amount} onChange={e => setLine(i, { amount: e.target.value })} disabled={!editable} style={{ ...INP, textAlign: 'right' }}/></td>
                <td style={{ padding: 4, width: 76 }}><select value={+l.vat_rate} onChange={e => setLine(i, { vat_rate: +e.target.value })} disabled={!editable} style={INP}><option value={5}>5%</option><option value={0}>0% / none</option></select></td>
                <td style={{ padding: 4, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{num2((+l.amount || 0) * (1 + (+l.vat_rate || 0) / 100))}</td>
                <td style={{ padding: 4 }}>{editable && <button onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} style={{ ...BTN, padding: '3px 7px', color: 'var(--red)' }}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && <button onClick={() => setLines(ls => [...ls, newBillLine(ls[ls.length - 1]?.account_id)])} style={{ ...BTN, marginTop: 8 }}>+ Add line</button>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 10, fontSize: 13 }}>
          <span>Net <b>{num2(net)}</b></span><span>VAT <b>{num2(vat)}</b></span><span style={{ fontSize: 15 }}>Total <b>{money(net + vat)}</b></span>
          {bill.id && bill.status !== 'draft' && <span style={{ color: +bill.balance > 0 ? 'var(--red)' : 'var(--green)' }}>Balance <b>{money(bill.balance)}</b></span>}
        </div>
        {vat > 0 && !bill.vendor_trn && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>Tip: input VAT can only be claimed with a valid tax invoice from a VAT-registered vendor — add their TRN.</div>}
      </div>
      {bill.id && bill.status !== 'draft' && (
        <div style={{ ...CARD, padding: 12 }}>
          <b>Payments</b>
          {pays.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>Not paid yet.</div>}
          {pays.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <span>{fmtDate(p.pay_date)} · {PAY_METHODS.find(m => m[0] === p.method)?.[1]} {p.reference ? `· ${p.reference}` : ''} · {p.fin_accounts?.name}</span>
              <span><b>{money(p.amount)}</b> <button onClick={() => delPay(p)} style={{ ...BTN, padding: '1px 6px', fontSize: 11, color: 'var(--red)' }}>✕</button></span>
            </div>
          ))}
        </div>
      )}
      {payOpen && <PayBillModal bill={bill} accounts={accounts} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); load() }}/>}
    </div>
  )
}
