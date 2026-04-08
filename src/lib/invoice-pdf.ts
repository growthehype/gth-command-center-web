import jsPDF from 'jspdf'

export interface LineItem {
  description: string
  qty: number
  rate: number
}

export interface InvoiceData {
  invoiceNum: string
  date: string
  dueDate: string
  fromName: string
  fromEmail: string
  clientName: string
  clientEmail: string
  lineItems: LineItem[]
  taxRate: number
  paymentTerms: string
  memo: string
}

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentW = pageW - margin * 2
  let y = 0

  // Brand colors
  const darkBg: [number, number, number] = [26, 26, 26]         // #1a1a1a
  const brandPurple = hexToRgb('#863bff')
  const white: [number, number, number] = [255, 255, 255]
  const textDark = '#1a1a1a'
  const textMid = '#555555'
  const textLight = '#999999'
  const rowAlt = '#f7f7f7'

  // ── Top bar ──
  const barH = 18
  doc.setFillColor(...darkBg)
  doc.rect(0, 0, pageW, barH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...white)
  doc.text('GROW THE HYPE', margin, barH / 2 + 1.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(22)
  doc.setTextColor(180, 180, 180)
  doc.text('INVOICE', pageW - margin, barH / 2 + 2.5, { align: 'right' })

  y = barH + 10

  // ── Invoice details row ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(textLight)

  const detailCol1 = margin
  const detailCol2 = margin + 55
  const detailCol3 = margin + 110

  doc.text('INVOICE #', detailCol1, y)
  doc.text('DATE', detailCol2, y)
  doc.text('DUE DATE', detailCol3, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(textDark)
  doc.text(data.invoiceNum || '—', detailCol1, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.date || '—', detailCol2, y)
  doc.text(data.dueDate || '—', detailCol3, y)

  y += 14

  // ── FROM / TO section ──
  const fromX = margin
  const toX = margin + contentW * 0.55

  // FROM label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...brandPurple)
  doc.text('FROM', fromX, y)

  // TO label
  doc.text('TO', toX, y)

  y += 6

  // FROM details
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(textDark)
  doc.text(data.fromName, fromX, y)

  // TO details
  doc.text(data.clientName || '—', toX, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(textMid)
  doc.text(data.fromEmail, fromX, y)
  if (data.clientEmail) {
    doc.text(data.clientEmail, toX, y)
  }

  y += 16

  // ── Line Items Table ──
  const colDesc = margin
  const colQty = margin + contentW * 0.55
  const colRate = margin + contentW * 0.72
  const colAmt = pageW - margin
  const headerH = 9
  const rowH = 9

  // Table header
  doc.setFillColor(...darkBg)
  doc.rect(margin, y, contentW, headerH, 'F')

  const headerTextY = y + headerH / 2 + 1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...white)
  doc.text('DESCRIPTION', colDesc + 4, headerTextY)
  doc.text('QTY', colQty, headerTextY, { align: 'right' })
  doc.text('RATE', colRate + 18, headerTextY, { align: 'right' })
  doc.text('AMOUNT', colAmt - 3, headerTextY, { align: 'right' })

  y += headerH

  // Table rows
  let subtotal = 0
  data.lineItems.forEach((item, i) => {
    const amount = item.qty * item.rate
    subtotal += amount

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(rowAlt)
      doc.rect(margin, y, contentW, rowH, 'F')
    }

    const rowTextY = y + rowH / 2 + 1

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textDark)
    doc.text(item.description || '', colDesc + 4, rowTextY)

    doc.setTextColor(textMid)
    doc.text(String(item.qty), colQty, rowTextY, { align: 'right' })
    doc.text(fmtCurrency(item.rate), colRate + 18, rowTextY, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(textDark)
    doc.text(fmtCurrency(amount), colAmt - 3, rowTextY, { align: 'right' })

    y += rowH
  })

  // Bottom border under last row
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)

  y += 10

  // ── Totals ──
  const totalsLabelX = colRate + 18
  const totalsValX = colAmt - 3
  const taxAmount = subtotal * (data.taxRate / 100)
  const total = subtotal + taxAmount

  // Subtotal
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(textLight)
  doc.text('Subtotal', totalsLabelX, y, { align: 'right' })
  doc.setTextColor(textDark)
  doc.text(fmtCurrency(subtotal), totalsValX, y, { align: 'right' })
  y += 7

  // Tax
  if (data.taxRate > 0) {
    doc.setTextColor(textLight)
    doc.text(`Tax (${data.taxRate}%)`, totalsLabelX, y, { align: 'right' })
    doc.setTextColor(textDark)
    doc.text(fmtCurrency(taxAmount), totalsValX, y, { align: 'right' })
    y += 7
  }

  // Purple accent line above total
  doc.setDrawColor(...brandPurple)
  doc.setLineWidth(0.6)
  doc.line(totalsLabelX - 30, y, pageW - margin, y)
  y += 6

  // Total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(textDark)
  doc.text('Total', totalsLabelX, y, { align: 'right' })
  doc.text(fmtCurrency(total), totalsValX, y, { align: 'right' })

  y += 18

  // ── Footer: Payment Terms box ──
  if (data.paymentTerms) {
    // Light box for payment terms
    const boxH = 16
    doc.setFillColor(247, 247, 247)
    doc.rect(margin, y, contentW * 0.48, boxH, 'F')
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.3)
    doc.rect(margin, y, contentW * 0.48, boxH, 'S')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...brandPurple)
    doc.text('PAYMENT TERMS', margin + 4, y + 5.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textDark)
    doc.text(data.paymentTerms, margin + 4, y + 11.5)

    y += boxH + 6
  }

  // ── Footer: Notes / Memo ──
  if (data.memo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...brandPurple)
    doc.text('NOTES', margin, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textMid)
    const memoLines = doc.splitTextToSize(data.memo, contentW * 0.7)
    doc.text(memoLines, margin, y)
    y += memoLines.length * 4.5 + 4
  }

  // ── Bottom accent line ──
  doc.setDrawColor(...brandPurple)
  doc.setLineWidth(1)
  doc.line(margin, pageH - 14, pageW - margin, pageH - 14)

  // ── Powered by text ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(180, 180, 180)
  doc.text('Powered by GTH Operations Command Center', pageW / 2, pageH - 8, { align: 'center' })

  return doc
}
