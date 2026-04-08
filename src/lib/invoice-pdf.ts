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

  // To
  clientName: string
  clientEmail: string
  clientPhone?: string
  clientAddress?: string

  // Line items & totals
  lineItems: LineItem[]
  taxRate: number
  taxLabel?: string

  // Footer
  paymentTerms: string
  paymentInstructions?: string
  memo: string
}

/* ── Helpers ── */

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatInvoiceDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/* ────────────────────────────────────────────────────────────────────────
   PREMIUM INVOICE PDF — World-class branded document
   ──────────────────────────────────────────────────────────────────────── */

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const W = doc.internal.pageSize.getWidth()    // 210
  const H = doc.internal.pageSize.getHeight()    // 297
  const L = 24   // left margin
  const R = 24   // right margin
  const CW = W - L - R  // content width
  let y = 0

  // ── Palette ──
  const black: [number, number, number] = [0, 0, 0]
  const dark: [number, number, number] = [17, 17, 17]
  const charcoal: [number, number, number] = [38, 38, 38]
  const mid: [number, number, number] = [85, 85, 85]
  const steel: [number, number, number] = [136, 136, 136]
  const light: [number, number, number] = [180, 180, 180]
  const ash: [number, number, number] = [232, 232, 232]
  const cream: [number, number, number] = [245, 240, 235]
  const offwhite: [number, number, number] = [251, 249, 247]
  const white: [number, number, number] = [255, 255, 255]

  const statusMap: Record<string, { bg: [number, number, number]; fg: [number, number, number]; label: string }> = {
    draft:   { bg: [240, 240, 240], fg: [100, 100, 100], label: 'DRAFT' },
    sent:    { bg: [255, 243, 205], fg: [133, 100, 4],   label: 'SENT' },
    paid:    { bg: [212, 237, 218], fg: [21, 87, 36],    label: 'PAID' },
    overdue: { bg: [248, 215, 218], fg: [154, 28, 36],   label: 'OVERDUE' },
  }

  // ── Helper: thin horizontal rule ──
  const hr = (yPos: number, color: [number, number, number] = ash, weight = 0.3) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(weight)
    doc.line(L, yPos, W - R, yPos)
  }

  // ── Helper: check page overflow ──
  const ensureSpace = (needed: number) => {
    if (y + needed > H - 30) {
      doc.addPage()
      y = 24
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  TOP STRIP — Full-width black bar (3mm)
  // ══════════════════════════════════════════════════════════════════

  doc.setFillColor(...black)
  doc.rect(0, 0, W, 3, 'F')

  // ══════════════════════════════════════════════════════════════════
  //  HEADER — Logo lockup left, Invoice # right
  // ══════════════════════════════════════════════════════════════════

  y = 16

  // Logo
  try {
    doc.addImage(GTH_LOGO_BASE64, 'PNG', L, y - 5, 16, 16)
  } catch { /* graceful skip */ }

  // Wordmark
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...black)
  doc.text('GROW THE HYPE', L + 19.5, y + 1)

  // "Inc." on a second line, lighter
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...steel)
  doc.text('Inc.', L + 19.5, y + 5.5)

  // Right side — INVOICE label + number
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...black)
  doc.text('INVOICE', W - R, y - 2, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...steel)
  doc.text(data.invoiceNum || '', W - R, y + 5, { align: 'right' })

  y += 16

  // Thick accent line
  doc.setDrawColor(...black)
  doc.setLineWidth(1.2)
  doc.line(L, y, W - R, y)

  y += 10

  // ══════════════════════════════════════════════════════════════════
  //  META ROW — Date | Due Date | Status
  // ══════════════════════════════════════════════════════════════════

  const col2 = L + 55
  const col3 = L + 110

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...steel)
  doc.text('ISSUE DATE', L, y)
  doc.text('DUE DATE', col2, y)
  if (data.status) doc.text('STATUS', col3, y)

  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...dark)
  doc.text(formatInvoiceDate(data.date), L, y)
  doc.text(formatInvoiceDate(data.dueDate), col2, y)

  // Status pill
  if (data.status && statusMap[data.status]) {
    const s = statusMap[data.status]
    doc.setFontSize(7)
    const tw = doc.getTextWidth(s.label)
    const pillW = tw + 10
    const pillH = 5.5
    const pillX = col3
    const pillY = y - 4
    doc.setFillColor(...s.bg)
    doc.roundedRect(pillX, pillY, pillW, pillH, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...s.fg)
    doc.text(s.label, pillX + pillW / 2, y - 0.5, { align: 'center' })
  }

  y += 12

  hr(y, ash)

  y += 12

  // ══════════════════════════════════════════════════════════════════
  //  FROM / BILL TO — Two columns
  // ══════════════════════════════════════════════════════════════════

  const leftCol = L
  const rightCol = L + CW * 0.55
  const savedY = y

  // ── FROM column ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...steel)
  doc.text('FROM', leftCol, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...black)
  doc.text(data.fromName, leftCol, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...mid)

  const fromLines: string[] = []
  if (data.fromEmail) fromLines.push(data.fromEmail)
  if (data.fromPhone) fromLines.push(data.fromPhone)
  if (data.fromWebsite) fromLines.push(data.fromWebsite)
  if (data.fromAddress) fromLines.push(data.fromAddress)
  fromLines.forEach(line => {
    doc.text(line, leftCol, y)
    y += 4.5
  })

  const fromEndY = y

  // ── BILL TO column ──
  let rY = savedY
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...steel)
  doc.text('BILL TO', rightCol, rY)
  rY += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...black)
  doc.text(data.clientName || '—', rightCol, rY)
  rY += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...mid)

  const toLines: string[] = []
  if (data.clientEmail) toLines.push(data.clientEmail)
  if (data.clientPhone) toLines.push(data.clientPhone)
  if (data.clientAddress) toLines.push(data.clientAddress)
  toLines.forEach(line => {
    doc.text(line, rightCol, rY)
    rY += 4.5
  })

  y = Math.max(fromEndY, rY) + 10

  // ══════════════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ══════════════════════════════════════════════════════════════════

  const tL = L             // table left
  const tR = W - R         // table right
  const tW = tR - tL       // table width
  const cDesc = tL + 5
  const cQty = tL + tW * 0.60
  const cRate = tL + tW * 0.77
  const cAmt = tR - 5
  const headH = 11
  const rowHt = 12

  ensureSpace(headH + (data.lineItems.length * rowHt) + 50)

  // ── Table header ──
  doc.setFillColor(...black)
  doc.rect(tL, y, tW, headH, 'F')

  const hTY = y + headH / 2 + 1.2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...white)
  doc.text('DESCRIPTION', cDesc, hTY)
  doc.text('QTY', cQty, hTY, { align: 'center' })
  doc.text('RATE', cRate, hTY, { align: 'right' })
  doc.text('AMOUNT', cAmt, hTY, { align: 'right' })

  y += headH

  // ── Table rows ──
  let subtotal = 0

  data.lineItems.forEach((item, i) => {
    const amount = item.qty * item.rate
    subtotal += amount

    // Page break check
    if (y + rowHt > H - 40) {
      doc.addPage()
      y = 24
      // Re-draw header
      doc.setFillColor(...black)
      doc.rect(tL, y, tW, headH, 'F')
      const rHY = y + headH / 2 + 1.2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...white)
      doc.text('DESCRIPTION', cDesc, rHY)
      doc.text('QTY', cQty, rHY, { align: 'center' })
      doc.text('RATE', cRate, rHY, { align: 'right' })
      doc.text('AMOUNT', cAmt, rHY, { align: 'right' })
      y += headH
    }

    // Alternating stripe
    if (i % 2 === 0) {
      doc.setFillColor(...offwhite)
      doc.rect(tL, y, tW, rowHt, 'F')
    }

    // Subtle row border
    doc.setDrawColor(240, 240, 240)
    doc.setLineWidth(0.15)
    doc.line(tL, y + rowHt, tR, y + rowHt)

    const rTY = y + rowHt / 2 + 1.5

    // Description — largest text in row
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...dark)
    doc.text(item.description || '', cDesc, rTY)

    // Qty
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...mid)
    doc.text(String(item.qty), cQty, rTY, { align: 'center' })

    // Rate
    doc.text(fmt(item.rate), cRate, rTY, { align: 'right' })

    // Amount — bold
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...dark)
    doc.text(fmt(amount), cAmt, rTY, { align: 'right' })

    y += rowHt
  })

  // Table bottom border
  doc.setDrawColor(...black)
  doc.setLineWidth(0.6)
  doc.line(tL, y, tR, y)

  y += 10

  // ══════════════════════════════════════════════════════════════════
  //  TOTALS — Right-aligned block
  // ══════════════════════════════════════════════════════════════════

  const taxLabel = data.taxLabel || 'Tax'
  const taxAmt = subtotal * (data.taxRate / 100)
  const total = subtotal + taxAmt

  const tLabelX = cRate
  const tValX = cAmt

  // Subtotal
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...steel)
  doc.text('Subtotal', tLabelX, y, { align: 'right' })
  doc.setTextColor(...dark)
  doc.text(fmt(subtotal), tValX, y, { align: 'right' })
  y += 7

  // Tax
  if (data.taxRate > 0) {
    doc.setTextColor(...steel)
    doc.text(`${taxLabel} (${data.taxRate}%)`, tLabelX, y, { align: 'right' })
    doc.setTextColor(...dark)
    doc.text(fmt(taxAmt), tValX, y, { align: 'right' })
    y += 7
  }

  y += 2

  // Total box — cream background
  const totalBoxW = tW * 0.42
  const totalBoxH = 14
  const totalBoxX = tR - totalBoxW
  doc.setFillColor(...cream)
  doc.roundedRect(totalBoxX, y - 1, totalBoxW, totalBoxH, 2, 2, 'F')

  // Black left accent on total box
  doc.setFillColor(...black)
  doc.rect(totalBoxX, y - 1, 2.5, totalBoxH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...black)
  doc.text('AMOUNT DUE', totalBoxX + 8, y + 5.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...black)
  doc.text(fmt(total), tR - 5, y + 6.5, { align: 'right' })

  y += totalBoxH + 16

  // ══════════════════════════════════════════════════════════════════
  //  PAYMENT & NOTES — Two columns
  // ══════════════════════════════════════════════════════════════════

  ensureSpace(35)

  const payNoteY = y
  const payColW = CW * 0.48
  const noteColX = L + CW * 0.54

  // ── Payment Terms (left) ──
  if (data.paymentTerms || data.paymentInstructions) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...steel)
    doc.text('PAYMENT TERMS', L, y)
    y += 5.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...dark)
    doc.text(data.paymentTerms || '', L, y)
    y += 6

    if (data.paymentInstructions) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...mid)
      const instrLines = doc.splitTextToSize(data.paymentInstructions, payColW)
      doc.text(instrLines, L, y)
      y += instrLines.length * 4.2
    }
  }

  // ── Notes/Memo (right) ──
  if (data.memo) {
    let nY = payNoteY
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...steel)
    doc.text('NOTES', noteColX, nY)
    nY += 5.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...mid)
    const memoLines = doc.splitTextToSize(data.memo, CW * 0.42)
    doc.text(memoLines, noteColX, nY)
    const memoEndY = nY + memoLines.length * 4.2
    y = Math.max(y, memoEndY)
  }

  // ══════════════════════════════════════════════════════════════════
  //  FOOTER
  // ══════════════════════════════════════════════════════════════════

  // Bottom strip — mirrors top
  doc.setFillColor(...black)
  doc.rect(0, H - 3, W, 3, 'F')

  const fY = H - 14

  // Fine rule
  hr(fY, ash, 0.3)

  // Footer contact line
  const parts: string[] = ['Grow The Hype Inc.']
  if (data.fromEmail) parts.push(data.fromEmail)
  parts.push(data.fromWebsite || 'growthehype.ca')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...light)
  doc.text(parts.join('   ·   '), W / 2, fY + 5, { align: 'center' })

  // Thank you
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(190, 190, 190)
  doc.text('Thank you for your business.', W / 2, fY + 9.5, { align: 'center' })

  return doc
}
