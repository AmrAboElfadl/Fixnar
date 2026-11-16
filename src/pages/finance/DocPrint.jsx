import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { num2, fmtDate, loadSettings, signedUrl, amountInWords, round2 } from '../../lib/finance'

// Printable quotation / UAE tax invoice / credit note (A4). "Save as PDF" in the print dialog makes the PDF.
// Tax invoice shows every Article 59 particular: "Tax Invoice", supplier & recipient name/address/TRN,
// sequential number, issue & supply date, line description/qty/rate/VAT rate/VAT amount, totals in AED.
export default function DocPrint() {
  const { kind, id } = useParams()
  const [d, setD] = useState(null); const [err, setErr] = useState(null)
  const isQuote = kind === 'quote', isCN = kind === 'credit_note'

  useEffect(() => {
    (async () => {
      const table = isQuote ? 'fin_quotes' : 'fin_invoices', lt = isQuote ? 'fin_quote_lines' : 'fin_invoice_lines', fk = isQuote ? 'quote_id' : 'invoice_id'
      const [s, doc, lines] = await Promise.all([
        loadSettings(),
        supabase.from(table).select('*, fin_clients(*), stores(name,address)').eq('id', id).maybeSingle(),
        supabase.from(lt).select('*').eq(fk, id).order('sort'),
      ])
      if (!doc.data) return setErr('Document not found (only admins can open finance documents).')
      let original = null
      if (doc.data.credit_for) original = (await supabase.from('fin_invoices').select('number,issue_date').eq('id', doc.data.credit_for).maybeSingle()).data
      setD({ s, doc: doc.data, lines: lines.data || [], logo: await signedUrl(s.logo_path, 3600), original })
    })()
  }, [id, isQuote])

  useEffect(() => {
    if (!d) return
    document.title = `${d.doc.number || 'DRAFT'} – ${d.doc.fin_clients?.name || ''}`
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [d])

  if (err) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{err}</div>
  if (!d) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Preparing document…</div>
  const { s, doc, lines, logo, original } = d
  const c = doc.fin_clients || {}
  const draft = doc.status === 'draft' && !isQuote
  const title = isQuote ? { en: 'QUOTATION', ar: 'عرض سعر' } : isCN ? { en: 'TAX CREDIT NOTE', ar: 'إشعار دائن ضريبي' } : { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' }
  const net = round2(+doc.subtotal - +doc.discount)
  const vatRates = [...new Set(lines.map(l => +l.vat_rate))]
  const cell = { border: '1px solid #cfd6dc', padding: '6px 8px', fontSize: 11.5, verticalAlign: 'top' }
  const hd = { ...cell, background: '#1D9E75', color: '#fff', fontWeight: 700, fontSize: 10.5 }
  const r = { textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div style={{ background: '#e9ecef', minHeight: '100vh', padding: '20px 0', fontFamily: "'Segoe UI', Arial, sans-serif", color: '#111' }} className="fin-print-wrap">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .fin-print-wrap { background: #fff !important; padding: 0 !important; } .fin-sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; padding: 0 !important; } .fin-noprint { display: none !important; } body::after { display: none !important; } }
      `}</style>
      <div className="fin-noprint" style={{ textAlign: 'center', marginBottom: 12 }}>
        <button onClick={() => window.print()} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}>🖨 Print / Save as PDF</button>
        <button onClick={() => window.close()} style={{ marginLeft: 8, background: '#fff', border: '1px solid #ccc', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>Close</button>
      </div>
      <div className="fin-sheet" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff', padding: '14mm', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,.15)', position: 'relative' }}>
        {(draft || doc.status === 'void') && (
          <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center', fontSize: 110, fontWeight: 900, color: 'rgba(220,0,0,.10)', transform: 'rotate(-25deg)', pointerEvents: 'none' }}>{doc.status === 'void' ? 'VOID' : 'DRAFT'}</div>
        )}
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, borderBottom: '3px solid #1D9E75', paddingBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {logo && <img src={logo} alt="" style={{ height: 60, maxWidth: 160, objectFit: 'contain' }}/>}
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{s.company_name}</div>
              {s.legal_name && s.legal_name !== s.company_name && <div style={{ fontSize: 11 }}>{s.legal_name}</div>}
              <div style={{ fontSize: 11, color: '#444', maxWidth: 300 }}>{s.address}{s.emirate ? `, ${s.emirate}` : ''}, United Arab Emirates</div>
              <div style={{ fontSize: 11, color: '#444' }}>{[s.phone, s.email, s.website].filter(Boolean).join(' · ')}</div>
              {s.trn && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>TRN: {s.trn}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1D9E75', letterSpacing: '.04em' }}>{title.en}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1D9E75', direction: 'rtl' }}>{title.ar}</div>
            <table style={{ marginLeft: 'auto', marginTop: 6, fontSize: 11.5, borderCollapse: 'collapse' }}><tbody>
              <tr><td style={{ color: '#555', paddingRight: 8 }}>{isQuote ? 'Quotation no.' : isCN ? 'Credit note no.' : 'Invoice no.'}</td><td style={{ fontWeight: 800 }}>{doc.number || 'DRAFT'}</td></tr>
              <tr><td style={{ color: '#555', paddingRight: 8 }}>Date of issue</td><td>{fmtDate(doc.issue_date)}</td></tr>
              {!isQuote && doc.supply_date && doc.supply_date !== doc.issue_date && <tr><td style={{ color: '#555', paddingRight: 8 }}>Date of supply</td><td>{fmtDate(doc.supply_date)}</td></tr>}
              {isQuote && <tr><td style={{ color: '#555', paddingRight: 8 }}>Valid until</td><td>{fmtDate(doc.valid_until)}</td></tr>}
              {!isQuote && !isCN && doc.due_date && <tr><td style={{ color: '#555', paddingRight: 8 }}>Due date</td><td>{fmtDate(doc.due_date)}</td></tr>}
              {doc.lpo_number && <tr><td style={{ color: '#555', paddingRight: 8 }}>Your LPO no.</td><td>{doc.lpo_number}</td></tr>}
              {isCN && original && <tr><td style={{ color: '#555', paddingRight: 8 }}>Original invoice</td><td>{original.number} ({fmtDate(original.issue_date)})</td></tr>}
            </tbody></table>
          </div>
        </div>
        {/* parties */}
        <div style={{ display: 'flex', gap: 14, margin: '12px 0' }}>
          <div style={{ flex: 1, border: '1px solid #cfd6dc', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1D9E75', letterSpacing: '.05em' }}>{isQuote ? 'PREPARED FOR' : 'BILL TO'}</div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{c.legal_name || c.name}</div>
            {c.address && <div style={{ fontSize: 11.5 }}>{c.address}{c.emirate ? `, ${c.emirate}` : ''}</div>}
            {c.trn && <div style={{ fontSize: 11.5, fontWeight: 700 }}>TRN: {c.trn}</div>}
            {c.contact_name && <div style={{ fontSize: 11, color: '#444' }}>Attn: {c.contact_name} {c.phone ? `· ${c.phone}` : ''}</div>}
          </div>
          {(doc.stores || doc.subject) && (
            <div style={{ flex: 1, border: '1px solid #cfd6dc', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1D9E75', letterSpacing: '.05em' }}>SITE / SUBJECT</div>
              {doc.stores && <div style={{ fontWeight: 700, fontSize: 12.5 }}>{doc.stores.name}</div>}
              {doc.stores?.address && <div style={{ fontSize: 11 }}>{doc.stores.address}</div>}
              {doc.subject && <div style={{ fontSize: 12, marginTop: 2 }}>{doc.subject}</div>}
            </div>
          )}
        </div>
        {/* lines */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...hd, width: 24 }}>#</th><th style={{ ...hd, textAlign: 'left' }}>Description</th><th style={{ ...hd, ...r }}>Qty</th><th style={hd}>Unit</th>
            <th style={{ ...hd, ...r }}>Rate</th>{lines.some(l => +l.discount_pct) && <th style={{ ...hd, ...r }}>Disc.</th>}
            <th style={{ ...hd, ...r }}>Taxable amount</th><th style={{ ...hd, ...r }}>VAT %</th><th style={{ ...hd, ...r }}>VAT</th><th style={{ ...hd, ...r }}>Total (AED)</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td><td style={{ ...cell, whiteSpace: 'pre-wrap' }}>{l.description}</td>
                <td style={{ ...cell, ...r }}>{+l.qty}</td><td style={cell}>{l.unit}</td><td style={{ ...cell, ...r }}>{num2(l.unit_price)}</td>
                {lines.some(x => +x.discount_pct) && <td style={{ ...cell, ...r }}>{+l.discount_pct ? `${+l.discount_pct}%` : ''}</td>}
                <td style={{ ...cell, ...r }}>{num2(l.net_amount)}</td><td style={{ ...cell, ...r }}>{+l.vat_rate}%</td>
                <td style={{ ...cell, ...r }}>{num2(l.vat_amount)}</td><td style={{ ...cell, ...r, fontWeight: 700 }}>{num2(+l.net_amount + +l.vat_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* totals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginTop: 10 }}>
          <div style={{ flex: 1, fontSize: 11.5 }}>
            <div><b>Amount in words:</b> {isCN ? 'Credit of ' : ''}UAE {amountInWords(doc.total)}</div>
            {vatRates.includes(0) && <div style={{ marginTop: 4, color: '#444' }}>Lines at 0% are zero-rated supplies.</div>}
          </div>
          <table style={{ borderCollapse: 'collapse', minWidth: 270, fontSize: 12 }}><tbody>
            <tr><td style={{ padding: '3px 8px', color: '#555' }}>Subtotal</td><td style={{ padding: '3px 8px', ...r }}>{num2(doc.subtotal)}</td></tr>
            {+doc.discount > 0 && <tr><td style={{ padding: '3px 8px', color: '#555' }}>Discount</td><td style={{ padding: '3px 8px', ...r }}>− {num2(doc.discount)}</td></tr>}
            <tr><td style={{ padding: '3px 8px', color: '#555' }}>Total taxable amount</td><td style={{ padding: '3px 8px', ...r }}>{num2(net)}</td></tr>
            <tr><td style={{ padding: '3px 8px', color: '#555' }}>VAT {vatRates.length === 1 ? `@ ${vatRates[0]}%` : ''}</td><td style={{ padding: '3px 8px', ...r }}>{num2(doc.vat_amount)}</td></tr>
            <tr style={{ background: '#1D9E75', color: '#fff' }}><td style={{ padding: '6px 8px', fontWeight: 800 }}>{isCN ? 'Total credit (AED)' : 'Total payable (AED)'}</td><td style={{ padding: '6px 8px', ...r, fontWeight: 900, fontSize: 14 }}>{num2(doc.total)}</td></tr>
            {!isQuote && !isCN && +doc.amount_paid > 0 && <tr><td style={{ padding: '3px 8px', color: '#555' }}>Paid</td><td style={{ padding: '3px 8px', ...r }}>{num2(doc.amount_paid)}</td></tr>}
            {!isQuote && !isCN && (+doc.amount_paid > 0 || +doc.amount_credited > 0) && <tr><td style={{ padding: '3px 8px', fontWeight: 700 }}>Balance due</td><td style={{ padding: '3px 8px', ...r, fontWeight: 800 }}>{num2(doc.balance)}</td></tr>}
          </tbody></table>
        </div>
        {/* notes, bank, terms */}
        {doc.notes && <div style={{ marginTop: 12, fontSize: 11.5 }}><b>Notes:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</span></div>}
        {!isQuote && !isCN && (s.iban || s.bank_name) && (
          <div style={{ marginTop: 12, fontSize: 11.5, border: '1px solid #cfd6dc', borderRadius: 6, padding: '8px 10px' }}>
            <b>Bank details for payment</b><br/>
            {s.account_name && <>Account name: {s.account_name}<br/></>}{s.bank_name && <>Bank: {s.bank_name}<br/></>}
            {s.iban && <>IBAN: <b>{s.iban.replace(/(.{4})/g, '$1 ').trim()}</b><br/></>}{s.swift && <>SWIFT: {s.swift}</>}
          </div>
        )}
        {doc.terms && <div style={{ marginTop: 10, fontSize: 10.5, color: '#444', whiteSpace: 'pre-wrap' }}><b>Terms & conditions</b><br/>{doc.terms}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, fontSize: 11 }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: 4, width: 200 }}>For {s.company_name}</div>
          <div style={{ borderTop: '1px solid #999', paddingTop: 4, width: 200, textAlign: 'right' }}>{isQuote ? 'Accepted by client (sign & stamp)' : 'Received by'}</div>
        </div>
        <div style={{ position: 'absolute', bottom: '8mm', left: '14mm', right: '14mm', fontSize: 9.5, color: '#888', textAlign: 'center' }}>
          {isQuote ? 'This quotation is not a tax invoice.' : 'This is a computer-generated document.'} {s.company_name}{s.trn ? ` · TRN ${s.trn}` : ''}
        </div>
      </div>
    </div>
  )
}
