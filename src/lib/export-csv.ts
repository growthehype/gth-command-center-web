/**
 * Converts an array of objects to a CSV string and triggers a browser download.
 */
export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return

  const headers = Object.keys(data[0])

  const escapeCell = (value: any): string => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    // Wrap in quotes if the value contains commas, quotes, or newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csvRows = [
    headers.map(escapeCell).join(','),
    ...data.map(row =>
      headers.map(h => escapeCell(row[h])).join(',')
    ),
  ]

  const csvString = csvRows.join('\n')
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
