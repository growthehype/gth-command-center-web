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
  taxLabel?: string // GST, HST, PST, VAT, Tax

  // Footer
  paymentTerms: string
  paymentInstructions?: string
  memo: string
}

/* ── Helpers ── */

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function drawRoundedRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number, r: number,
  style: 'F' | 'S' | 'FD' = 'F',
) {
  doc.roundedRect(x, y, w, h, r, r, style)
}

/* ────────────────────────────────────────────────────────────────
   Generate a premium, branded invoice PDF
   ──────────────────────────────────────────────────────────────── */

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()   // 210
  const pageH = doc.internal.pageSize.getHeight()   // 297
  const ml = 22          // left margin
  const mr = 22          // right margin
  const contentW = pageW - ml - mr
  let y = 0

  // ── Brand palette ──
  const obsidian: [number, number, number] = [0, 0, 0]
  const charcoal: [number, number, number] = [26, 26, 26]
  const steel: [number, number, number] = [136, 136, 136]
  const ash: [number, number, number] = [232, 232, 232]
  const cream: [number, number, number] = [245, 240, 235]
  const white: [number, number, number] = [255, 255, 255]
  const creamHex = '#F5F0EB'
  const textDark = '#111111'
  const textMid = '#555555'
  const textLight = '#999999'
  const rowAlt: [number, number, number] = [250, 248, 246]

  // Status badge colors
  const statusColors: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
    draft: { bg: [232, 232, 232], text: [100, 100, 100] },
    sent: { bg: [255, 243, 205], text: [133, 100, 4] },
    paid: { bg: [212, 237, 218], text: [21, 87, 36] },
    overdue: { bg: [248, 215, 218], text: [114, 28, 36] },
  }

  // ════════════════════════════════════════════════════════════════
  //  HEADER — Logo + Wordmark | INVOICE label
  // ════════════════════════════════════════════════════════════════

  y = 20

  // Logo (shield icon)
  try {
    doc.addImage(GTH_LOGO_BASE64, 'PNG', ml, y - 4, 14, 14)
  } catch {
    // If logo fails, skip gracefully
  }

  // Wordmark next to logo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...obsidian)
  doc.text('GROW THE HYPE', ml + 17, y + 6)

  // INVOICE title — large, right-aligned, light weight
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(32)
  doc.setTextColor(200, 200, 200)
  doc.text('INVOICE', pageW - mr, y + 7, { align: 'right' })

  y += 18

  // Thin accent line
  doc.setDrawColor(...obsidian)
  doc.setLineWidth(0.7)
  doc.line(ml, y, pageW - mr, y)

  y += 12

  // ════════════════════════════════════════════════════════════════
  //  INVOICE META — Number, Date, Due Date, Status
  // ════════════════════════════════════════════════════════════════

  const metaCol1 = ml
  const metaCol2 = ml + 45
  const metaCol3 = ml + 90
  const metaCol4 = ml + 135

  // Labels
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(textLight)
  doc.text('INVOICE NO.', metaCol1, y)
  doc.text('DATE', metaCol2, y)
  doc.text('DUE DATE', metaCol3, y)
  if (data.status) doc.text('STATUS', metaCol4, y)

  y += 5.5

  // Values
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(textDark)
  doc.text(data.invoiceNum || '—', metaCol1, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.date || '—', metaCol2, y)
  doc.text(data.dueDate || '—', metaCol3, y)

  // Status badge
  if (data.status) {
    const st = statusColors[data.status] || statusColors.draft
    const statusLabel = data.status.toUpperCase()
    doc.setFontSize(7.5)
    const badgeW = doc.getTextWidth(statusLabel) + 8
    doc.setFillColor(...st.bg)
    drawRoundedRect(doc, metaCol4 - 1, y - 4, badgeW, 6.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...st.text)
    doc.text(statusLabel, metaCol4 + 3, y)
  }

  y += 16

  // ════════════════════════════════════════════════════════════════
  //  FROM / BILL TO
  // ════════════════════════════════════════════════════════════════

  const fromX = ml
  const toX = ml + contentW * 0.55

  // Cream background box for the FROM/TO section
  doc.setFillColor(...cream)
  const fromToBoxH = 38
  drawRoundedRect(doc, ml - 2, y - 3, contentW + 4, fromToBoxH, 2, 'F')

  // FROM
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...steel)
  doc.text('FROM', fromX, y + 1)

  // TO
  doc.text('BILL TO', toX, y + 1)

  y += 8

  // From details
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(textDark)
  doc.text(data.fromName, fromX, y)

  // To details
  doc.text(data.clientName || '—', toX, y)

  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(textMid)

  // From contact details
  if (data.fromEmail) { doc.text(data.fromEmail, fromX, y); y += 4.2 }
  let fromY = y
  if (data.fromPhone) { doc.text(data.fromPhone, fromX, fromY); fromY += 4.2 }
  if (data.fromAddress) {
    const addrLines = doc.splitTextToSize(data.fromAddress, contentW * 0.45)
    doc.text(addrLines, fromX, fromY)
    fromY += addrLines.length * 4.2
  }
  if (data.fromWebsite) { doc.text(data.fromWebsite, fromX, fromY) }

  // To contact details — restart y from after email
  let toY = y
  doc.setTextColor(textMid)
  if (data.clientEmail) { doc.text(data.clientEmail, toX, toY); toY += 4.2 }
  if (data.clientPhone) { doc.text(data.clientPhone, toX, toY); toY += 4.2 }
  if (data.clientAddress) {
    const addrLines = doc.splitTextToSize(data.clientAddress, contentW * 0.40)
    doc.text(addrLines, toX, toY)
  }

  y = (y - 5.5 - 8 + 3) + fromToBoxH + 10  // jump below the cream box

  // ════════════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ════════════════════════════════════════════════════════════════

  const colDesc = ml + 4
  const colQty = ml + contentW * 0.58
  const colRate = ml + contentW * 0.74
  const colAmt = pageW - mr - 4
  const headerH = 10
  const rowH = 11

  // Check if we need page break before table
  const estimatedTableH = headerH + (data.lineItems.length * rowH) + 60
  if (y + estimatedTableH > pageH - 40) {
    doc.addPage()
    y = 25
  }

  // Table header — cream background
  doc.setFillColor(...cream)
  drawRoundedRect(doc, ml, y, contentW, headerH, 1.5, 'F')

  const headerTextY = y + headerH / 2 + 1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...charcoal)
  doc.text('DESCRIPTION', colDesc, headerTextY)
  doc.text('QTY', colQty, headerTextY, { align: 'right' })
  doc.text('RATE', colRate + 10, headerTextY, { align: 'right' })
  doc.text('AMOUNT', colAmt, headerTextY, { align: 'right' })

  y += headerH

  // Table rows
  let subtotal = 0
  data.lineItems.forEach((item, i) => {
    const amount = item.qty * item.rate
    subtotal += amount

    // Check page overflow for each row
    if (y + rowH > pageH - 40) {
      doc.addPage()
      y = 25
      // Reprint header on new page
      doc.setFillColor(...cream)
      drawRoundedRect(doc, ml, y, contentW, headerH, 1.5, 'F')
      const hty = y + headerH / 2 + 1
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...charcoal)
      doc.text('DESCRIPTION', colDesc, hty)
      doc.text('QTY', colQty, hty, { align: 'right' })
      doc.text('RATE', colRate + 10, hty, { align: 'right' })
      doc.text('AMOUNT', colAmt, hty, { align: 'right' })
      y += headerH
    }

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(...rowAlt)
      doc.rect(ml, y, contentW, rowH, 'F')
    }

    const rowTextY = y + rowH / 2 + 1.2

    // Description
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(textDark)
    doc.text(item.description || '', colDesc, rowTextY)

    // Qty
    doc.setTextColor(textMid)
    doc.setFontSize(9)
    doc.text(String(item.qty), colQty, rowTextY, { align: 'right' })

    // Rate
    doc.text(fmtCurrency(item.rate), colRate + 10, rowTextY, { align: 'right' })

    // Amount
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(textDark)
    doc.text(fmtCurrency(amount), colAmt, rowTextY, { align: 'right' })

    y += rowH
  })

  // Bottom border
  doc.setDrawColor(...ash)
  doc.setLineWidth(0.5)
  doc.line(ml, y, pageW - mr, y)

  y += 12

  // ════════════════════════════════════════════════════════════════
  //  TOTALS
  // ════════════════════════════════════════════════════════════════

  const totalsLabelX = colRate + 10
  const totalsValX = colAmt
  const taxLabel = data.taxLabel || 'Tax'
  const taxAmount = subtotal * (data.taxRate / 100)
  const total = subtotal + taxAmount

  // Subtotal
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(textLight)
  doc.text('Subtotal', totalsLabelX, y, { align: 'right' })
  doc.setTextColor(textDark)
  doc.text(fmtCurrency(subtotal), totalsValX, y, { align: 'right' })
  y += 7.5

  // Tax
  if (data.taxRate > 0) {
    doc.setTextColor(textLight)
    doc.text(`${taxLabel} (${data.taxRate}%)`, totalsLabelX, y, { align: 'right' })
    doc.setTextColor(textDark)
    doc.text(fmtCurrency(taxAmount), totalsValX, y, { align: 'right' })
    y += 7.5
  }

  // Divider above total
  doc.setDrawColor(...obsidian)
  doc.setLineWidth(0.8)
  doc.line(totalsLabelX - 35, y, pageW - mr, y)
  y += 7

  // TOTAL — large
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...obsidian)
  doc.text('Total Due', totalsLabelX, y, { align: 'right' })
  doc.text(fmtCurrency(total), totalsValX, y, { align: 'right' })

  y += 20

  // ════════════════════════════════════════════════════════════════
  //  PAYMENT TERMS & INSTRUCTIONS
  // ════════════════════════════════════════════════════════════════

  // Check page overflow
  if (y + 30 > pageH - 35) {
    doc.addPage()
    y = 25
  }

  if (data.paymentTerms || data.paymentInstructions) {
    // Cream box
    const payBoxStartY = y
    let payBoxH = 14
    if (data.paymentInstructions) payBoxH += 8

    doc.setFillColor(...cream)
    drawRoundedRect(doc, ml, y, contentW * 0.55, payBoxH, 2, 'F')

    y += 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...steel)
    doc.text('PAYMENT TERMS', ml + 5, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(textDark)
    doc.text(data.paymentTerms, ml + 5, y)

    if (data.paymentInstructions) {
      y += 6
      doc.setFontSize(8.5)
      doc.setTextColor(textMid)
      const instrLines = doc.splitTextToSize(data.paymentInstructions, contentW * 0.50)
      doc.text(instrLines, ml + 5, y)
    }

    y = payBoxStartY + payBoxH + 10
  }

  // ════════════════════════════════════════════════════════════════
  //  MEMO / NOTES
  // ════════════════════════════════════════════════════════════════

  if (data.memo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...steel)
    doc.text('NOTES', ml, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textMid)
    const memoLines = doc.splitTextToSize(data.memo, contentW * 0.65)
    doc.text(memoLines, ml, y)
    y += memoLines.length * 4.5 + 8
  }

  // ════════════════════════════════════════════════════════════════
  //  FOOTER
  // ════════════════════════════════════════════════════════════════

  const footerY = pageH - 20

  // Accent line
  doc.setDrawColor(...obsidian)
  doc.setLineWidth(0.8)
  doc.line(ml, footerY, pageW - mr, footerY)

  // Contact info line
  const footerParts: string[] = []
  footerParts.push('Grow The Hype')
  if (data.fromEmail) footerParts.push(data.fromEmail)
  if (data.fromWebsite) footerParts.push(data.fromWebsite)
  else footerParts.push('growthehype.ca')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...steel)
  doc.text(footerParts.join('  ·  '), pageW / 2, footerY + 5.5, { align: 'center' })

  // Thank you line
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(170, 170, 170)
  doc.text('Thank you for your business.', pageW / 2, footerY + 10.5, { align: 'center' })

  return doc
}
