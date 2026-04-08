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

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentW = pageW - margin * 2
  let y = margin

  // Colors
  const textDark = '#1a1a1a'
  const textSecondary = '#666666'
  const tableHeaderBg = '#f5f5f5'
  const tableBorder = '#e0e0e0'

  // ── Header ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(textDark)
  doc.text(data.fromName, margin, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(textSecondary)
  doc.text('INVOICE', pageW - margin, y, { align: 'right' })

  y += 12

  // ── Invoice details (right side) ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(textSecondary)
  const detailsX = pageW - margin
  doc.text(`Invoice #: ${data.invoiceNum}`, detailsX, y, { align: 'right' })
  y += 5
  doc.text(`Date: ${data.date}`, detailsX, y, { align: 'right' })
  y += 5
  doc.text(`Due Date: ${data.dueDate}`, detailsX, y, { align: 'right' })

  // ── From / To section ──
  y = 44 + 8

  // From
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(textSecondary)
  doc.text('FROM', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(textDark)
  doc.text(data.fromName, margin, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor(textSecondary)
  doc.text(data.fromEmail, margin, y)

  // To
  let toY = 52
  const toX = margin + contentW * 0.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(textSecondary)
  doc.text('TO', toX, toY)
  toY += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(textDark)
  doc.text(data.clientName, toX, toY)
  toY += 5
  doc.setFontSize(9)
  doc.setTextColor(textSecondary)
  if (data.clientEmail) {
    doc.text(data.clientEmail, toX, toY)
  }

  y = Math.max(y, toY) + 12

  // ── Separator ──
  doc.setDrawColor(tableBorder)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // ── Line Items Table ──
  const colDesc = margin
  const colQty = margin + contentW * 0.55
  const colRate = margin + contentW * 0.72
  const colAmt = pageW - margin
  const rowH = 8

  // Table header
  doc.setFillColor(tableHeaderBg)
  doc.rect(margin, y - 4, contentW, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(textSecondary)
  doc.text('DESCRIPTION', colDesc + 3, y)
  doc.text('QTY', colQty, y, { align: 'right' })
  doc.text('RATE', colRate + 18, y, { align: 'right' })
  doc.text('AMOUNT', colAmt - 2, y, { align: 'right' })
  y += rowH

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let subtotal = 0

  data.lineItems.forEach((item, i) => {
    const amount = item.qty * item.rate
    subtotal += amount

    // Alternating row bg
    if (i % 2 === 1) {
      doc.setFillColor('#fafafa')
      doc.rect(margin, y - 4, contentW, rowH, 'F')
    }

    doc.setTextColor(textDark)
    doc.text(item.description || '', colDesc + 3, y)
    doc.text(String(item.qty), colQty, y, { align: 'right' })
    doc.text(fmtCurrency(item.rate), colRate + 18, y, { align: 'right' })
    doc.text(fmtCurrency(amount), colAmt - 2, y, { align: 'right' })
    y += rowH
  })

  // Bottom border
  doc.setDrawColor(tableBorder)
  doc.line(margin, y - 2, pageW - margin, y - 2)
  y += 8

  // ── Totals ──
  const totalsX = colRate + 18
  const totalsValX = colAmt - 2

  const taxAmount = subtotal * (data.taxRate / 100)
  const total = subtotal + taxAmount

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(textSecondary)
  doc.text('Subtotal', totalsX, y, { align: 'right' })
  doc.setTextColor(textDark)
  doc.text(fmtCurrency(subtotal), totalsValX, y, { align: 'right' })
  y += 6

  if (data.taxRate > 0) {
    doc.setTextColor(textSecondary)
    doc.text(`Tax (${data.taxRate}%)`, totalsX, y, { align: 'right' })
    doc.setTextColor(textDark)
    doc.text(fmtCurrency(taxAmount), totalsValX, y, { align: 'right' })
    y += 6
  }

  // Total line
  doc.setDrawColor(tableBorder)
  doc.line(totalsX - 20, y - 2, pageW - margin, y - 2)
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(textDark)
  doc.text('Total', totalsX, y, { align: 'right' })
  doc.text(fmtCurrency(total), totalsValX, y, { align: 'right' })
  y += 14

  // ── Footer ──
  doc.setDrawColor(tableBorder)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  if (data.paymentTerms) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(textSecondary)
    doc.text('PAYMENT TERMS', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textDark)
    doc.text(data.paymentTerms, margin, y)
    y += 8
  }

  if (data.memo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(textSecondary)
    doc.text('NOTES', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textDark)
    const memoLines = doc.splitTextToSize(data.memo, contentW)
    doc.text(memoLines, margin, y)
  }

  return doc
}
