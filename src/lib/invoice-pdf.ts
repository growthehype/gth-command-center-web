import jsPDF from 'jspdf'
import { GTH_LOGO_BASE64 } from './invoice-logo'

export interface LineItem {
  description: string
  qty: number
  rate: number
}

export interface InvoiceData {
  invoiceNum: string
  date: string
  dueDate: string
  status?: 'draft' | 'sent' | 'paid' | 'overdue'

  // From
  fromName: string
  fromEmail: string
  fromPhone?: string
  fromAddress?: string
  fromWebsite?: string
  gstNumber?: string

  // To
  clientName: string
  clientEmail: string
  clientPhone?: string
  clientAddress?: string
  clientContactName?: string

  // Line items & totals
  lineItems: LineItem[]
  taxRate: number
  taxLabel?: string
  currency?: string // CAD, USD

  // Footer
  paymentTerms: string
  paymentInstructions?: string
  memo: string
  termsText?: string // Full legal terms block
}

/* ── Helpers ── */

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/* ────────────────────────────────────────────────────────────────────────
   PREMIUM INVOICE PDF — Matching GTH production invoice standard
   ──────────────────────────────────────────────────────────────────────── */

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const W = doc.internal.pageSize.getWidth()    // 210
  const H = doc.internal.pageSize.getHeight()    // 297
  const L = 20
  const R = 20
  const CW = W - L - R
  let y = 0

  const currency = data.currency || 'CAD'
  const taxLabel = data.taxLabel || 'GST'
  const gstNum = data.gstNumber || ''

  // ── Palette ──
  const black: [number, number, number] = [0, 0, 0]
  const dark: [number, number, number] = [20, 20, 20]
  const charcoal: [number, number, number] = [40, 40, 40]
  const mid: [number, number, number] = [80, 80, 80]
  const steel: [number, number, number] = [120, 120, 120]
  const muted: [number, number, number] = [150, 150, 150]
  const light: [number, number, number] = [190, 190, 190]
  const ash: [number, number, number] = [220, 220, 220]
  const faint: [number, number, number] = [240, 240, 240]
  const cream: [number, number, number] = [245, 240, 235]
  const white: [number, number, number] = [255, 255, 255]

  // ── Helpers ──
  const hr = (yy: number, clr: [number, number, number] = ash, w = 0.3) => {
    doc.setDrawColor(...clr)
    doc.setLineWidth(w)
    doc.line(L, yy, W - R, yy)
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > H - 28) { doc.addPage(); y = 20 }
  }

  // Right-aligned text helper — prints label: value pairs
  const metaRow = (label: string, value: string, yy: number, bold = false, highlight = false) => {
    const valX = W - R
    const lblX = valX - 65

    if (highlight) {
      doc.setFillColor(...cream)
      doc.rect(lblX - 3, yy - 4, 68, 6.5, 'F')
      doc.setFillColor(...black)
      doc.rect(lblX - 3, yy - 4, 1.5, 6.5, 'F')
    }

    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...(highlight ? black : mid))
    doc.text(label + ':', lblX, yy, { align: 'right' })

    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...dark)
    doc.text(value, valX, yy, { align: 'right' })
  }

  // ══════════════════════════════════════════════════════════════════
  //  HEADER — Logo left | "INVOICE" + Company info right
  // ══════════════════════════════════════════════════════════════════

  y = 18

  // Logo — large, prominent
  try {
    doc.addImage(GTH_LOGO_BASE64, 'PNG', L, y - 2, 32, 32)
  } catch { /* skip */ }

  // Right side — "INVOICE" title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...black)
  doc.text('INVOICE', W - R, y + 2, { align: 'right' })

  // Tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...steel)
  doc.text('Grow The Hype  ·  Strategic Marketing & Creative Services', W - R, y + 8, { align: 'right' })

  // Company details — right-aligned block
  let hY = y + 15
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...dark)
  doc.text(data.fromName, W - R, hY, { align: 'right' })
  hY += 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...mid)

  // Address lines
  if (data.fromAddress) {
    const addrParts = data.fromAddress.split(',').map(s => s.trim())
    addrParts.forEach(part => {
      doc.text(part, W - R, hY, { align: 'right' })
      hY += 4
    })
  }

  // Phone & website
  if (data.fromPhone) {
    doc.text(data.fromPhone, W - R, hY, { align: 'right' })
    hY += 4
  }
  if (data.fromWebsite) {
    doc.text(data.fromWebsite, W - R, hY, { align: 'right' })
    hY += 4
  }

  y = Math.max(y + 34, hY + 2)

  // Thin rule
  hr(y, ash, 0.4)

  y += 10

  // ══════════════════════════════════════════════════════════════════
  //  BILL TO (left) | INVOICE DETAILS (right)
  // ══════════════════════════════════════════════════════════════════

  const billToY = y

  // ── Bill To label ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...steel)
  doc.text('Bill to', L, y)
  y += 5.5

  // Client company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...dark)
  doc.text(data.clientName || '—', L, y)
  y += 5

  // Client contact name
  if (data.clientContactName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...charcoal)
    doc.text(data.clientContactName, L, y)
    y += 4.5
  }

  // Client address
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...mid)

  if (data.clientAddress) {
    const addrParts = data.clientAddress.split(',').map(s => s.trim())
    addrParts.forEach(part => {
      doc.text(part, L, y)
      y += 4
    })
  }

  // Spacer
  if (data.clientPhone || data.clientEmail) y += 2

  if (data.clientPhone) {
    doc.text(data.clientPhone, L, y)
    y += 4
  }
  if (data.clientEmail) {
    doc.text(data.clientEmail, L, y)
    y += 4
  }

  const billToEndY = y

  // ── Invoice details (right column) — structured table ──
  let mY = billToY + 1

  metaRow('Invoice Number', data.invoiceNum || '—', mY, true)
  mY += 6.5

  metaRow('Invoice Date', fmtDate(data.date), mY)
  mY += 6.5

  metaRow('Payment Due', fmtDate(data.dueDate), mY)
  mY += 6.5

  // Amount Due (CAD) — highlighted row
  const subtotalCalc = data.lineItems.reduce((s, li) => s + li.qty * li.rate, 0)
  const taxCalc = subtotalCalc * (data.taxRate / 100)
  const totalCalc = subtotalCalc + taxCalc
  metaRow(`Amount Due (${currency})`, fmt(totalCalc), mY, true, true)

  y = Math.max(billToEndY, mY + 4) + 10

  // ══════════════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ══════════════════════════════════════════════════════════════════

  const tL = L
  const tR2 = W - R
  const tW = tR2 - tL
  const cItem = tL + 5
  const cQty = tL + tW * 0.58
  const cPrice = tL + tW * 0.77
  const cAmt = tR2 - 5
  const headH = 10
  const rowHt = 11

  ensureSpace(headH + data.lineItems.length * rowHt + 50)

  // ── Table header — black ──
  doc.setFillColor(...black)
  doc.rect(tL, y, tW, headH, 'F')

  // Left accent — 2px cream strip inside header for subtle flair
  doc.setFillColor(...cream)
  doc.rect(tL, y + headH - 0.8, tW, 0.8, 'F')

  const hTY = y + headH / 2 + 1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...white)
  doc.text('Items', cItem, hTY)
  doc.text('Quantity', cQty, hTY, { align: 'center' })
  doc.text('Price', cPrice, hTY, { align: 'right' })
  doc.text('Amount', cAmt, hTY, { align: 'right' })

  y += headH

  // ── Rows ──
  let subtotal = 0
  data.lineItems.forEach((item, i) => {
    const amount = item.qty * item.rate
    subtotal += amount

    if (y + rowHt > H - 38) {
      doc.addPage()
      y = 20
      doc.setFillColor(...black)
      doc.rect(tL, y, tW, headH, 'F')
      doc.setFillColor(...cream)
      doc.rect(tL, y + headH - 0.8, tW, 0.8, 'F')
      const rr = y + headH / 2 + 1
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...white)
      doc.text('Items', cItem, rr)
      doc.text('Quantity', cQty, rr, { align: 'center' })
      doc.text('Price', cPrice, rr, { align: 'right' })
      doc.text('Amount', cAmt, rr, { align: 'right' })
      y += headH
    }

    // Row bg
    if (i % 2 === 1) {
      doc.setFillColor(...faint)
      doc.rect(tL, y, tW, rowHt, 'F')
    }

    // Row bottom line
    doc.setDrawColor(235, 235, 235)
    doc.setLineWidth(0.15)
    doc.line(tL, y + rowHt, tR2, y + rowHt)

    const rTY = y + rowHt / 2 + 1.3

    // Description
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...dark)
    doc.text(item.description || '', cItem, rTY)

    // Qty
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...mid)
    doc.text(String(item.qty), cQty, rTY, { align: 'center' })

    // Price
    doc.text(fmt(item.rate), cPrice, rTY, { align: 'right' })

    // Amount
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...dark)
    doc.text(fmt(amount), cAmt, rTY, { align: 'right' })

    y += rowHt
  })

  y += 8

  // ══════════════════════════════════════════════════════════════════
  //  TOTALS — Right-aligned
  // ══════════════════════════════════════════════════════════════════

  const taxAmount = subtotal * (data.taxRate / 100)
  const total = subtotal + taxAmount
  const lblX = cPrice + 5
  const valX = cAmt

  // Subtotal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...mid)
  doc.text('Subtotal:', lblX, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...dark)
  doc.text(fmt(subtotal), valX, y, { align: 'right' })
  y += 6.5

  // Tax with GST number
  if (data.taxRate > 0) {
    const taxLine = gstNum
      ? `${taxLabel} ${data.taxRate}% (${gstNum}):`
      : `${taxLabel} ${data.taxRate}%:`
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...steel)
    doc.text(taxLine, lblX, y, { align: 'right' })
    doc.setTextColor(...dark)
    doc.text(fmt(taxAmount), valX, y, { align: 'right' })
    y += 7
  }

  // Divider
  hr(y, ash, 0.4)
  y += 6

  // Total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...charcoal)
  doc.text('Total:', lblX, y, { align: 'right' })
  doc.setTextColor(...dark)
  doc.text(fmt(total), valX, y, { align: 'right' })
  y += 7

  // Amount Due (CAD) — highlighted
  const adBoxW = (valX + 5) - (lblX - 42)
  doc.setFillColor(...cream)
  doc.rect(lblX - 42, y - 4.5, adBoxW, 8, 'F')
  doc.setFillColor(...black)
  doc.rect(lblX - 42, y - 4.5, 1.8, 8, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...black)
  doc.text(`Amount Due (${currency}):`, lblX, y, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(fmt(total), valX, y + 0.5, { align: 'right' })

  y += 18

  // ══════════════════════════════════════════════════════════════════
  //  NOTES / TERMS
  // ══════════════════════════════════════════════════════════════════

  ensureSpace(40)

  const hasTerms = data.termsText || data.memo || data.paymentTerms

  if (hasTerms) {
    // Section header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...dark)
    doc.text('Notes / Terms', L, y)
    y += 2

    // Underline
    doc.setDrawColor(...black)
    doc.setLineWidth(0.5)
    doc.line(L, y, L + 28, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...mid)

    // Payment terms line
    if (data.paymentTerms) {
      const ptLine = `Payment is due within ${data.paymentTerms === 'Due on Receipt' ? 'receipt of this invoice' : data.paymentTerms.toLowerCase().replace('net ', '') + ' days'} unless otherwise stated.`
      const ptLines = doc.splitTextToSize(ptLine, CW)
      doc.text(ptLines, L, y)
      y += ptLines.length * 4.2 + 3
    }

    // Custom terms text (multi-paragraph)
    if (data.termsText) {
      const paragraphs = data.termsText.split('\n').filter(p => p.trim())
      paragraphs.forEach(para => {
        ensureSpace(12)
        const lines = doc.splitTextToSize(para.trim(), CW)
        doc.text(lines, L, y)
        y += lines.length * 4.2 + 3
      })
    }

    // Memo
    if (data.memo && data.memo !== data.termsText) {
      ensureSpace(10)
      const memoLines = doc.splitTextToSize(data.memo, CW)
      doc.text(memoLines, L, y)
      y += memoLines.length * 4.2
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  FOOTER
  // ══════════════════════════════════════════════════════════════════

  const fY = H - 16

  // Thin rule
  doc.setDrawColor(...ash)
  doc.setLineWidth(0.3)
  doc.line(L, fY, W - R, fY)

  // Thank you + payment info
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...steel)

  const footerLine1Parts: string[] = ['Thank you for choosing Grow The Hype.']
  if (data.paymentInstructions) {
    footerLine1Parts.push(data.paymentInstructions + '.')
  } else {
    footerLine1Parts.push('Payments can be made via e-transfer or credit card.')
  }
  const footerLine1 = footerLine1Parts.join(' ')

  const footerLine2 = `For questions about this invoice, contact ${data.fromEmail || 'omar@growthehype.ca'}`

  doc.text(footerLine1, W / 2, fY + 4.5, { align: 'center' })
  doc.text(footerLine2, W / 2, fY + 9, { align: 'center' })

  return doc
}
