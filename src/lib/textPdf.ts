// Minimal, dependency-free PDF generator for plain-text documents.
// Produces a real .pdf Blob (downloadable, works offline) — not a print dialog.
// Uses the standard Helvetica font (no embedding), ASCII text only, letter pages.

export interface PdfSection {
  heading: string
  items: string[]
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const TEXT_W = PAGE_W - MARGIN * 2

/** Transliterate common non-ASCII punctuation to ASCII; drop anything else (Helvetica is ASCII-safe). */
function toAscii(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/[▸•●–]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** Word-wrap to a pixel width using an average Helvetica glyph width estimate. */
function wrap(text: string, size: number, maxWidthPt: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidthPt / (size * 0.52)))
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > maxChars) { lines.push(cur); cur = w }
    else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

interface LayoutLine { text: string; size: number; x: number; gapAfter: number }

export function buildTextPdf(title: string, sections: PdfSection[]): Blob {
  // 1. Flatten content into positioned text lines.
  const layout: LayoutLine[] = [{ text: toAscii(title), size: 18, x: MARGIN, gapAfter: 12 }]
  for (const sec of sections) {
    if (sec.heading) layout.push({ text: toAscii(sec.heading).toUpperCase(), size: 12, x: MARGIN, gapAfter: 4 })
    for (const item of sec.items) {
      const wrapped = wrap('- ' + toAscii(item), 10, TEXT_W - 8)
      wrapped.forEach((ln, i) => layout.push({ text: ln, size: 10, x: MARGIN + (i === 0 ? 0 : 10), gapAfter: 2 }))
    }
    layout.push({ text: '', size: 6, x: MARGIN, gapAfter: 6 }) // section spacer
  }

  // 2. Paginate into content streams.
  const lineHeight = (size: number) => size * 1.35
  const pages: string[] = []
  let stream = ''
  let y = PAGE_H - MARGIN
  for (const l of layout) {
    if (y - lineHeight(l.size) < MARGIN) { pages.push(stream); stream = ''; y = PAGE_H - MARGIN }
    y -= lineHeight(l.size)
    if (l.text) stream += `BT /F1 ${l.size} Tf ${l.x} ${y.toFixed(1)} Td (${escapePdf(l.text)}) Tj ET\n`
    y -= l.gapAfter
  }
  pages.push(stream)

  // 3. Build objects: 1 Catalog, 2 Pages, 3 Font, then N content + N page objects.
  const nPages = pages.length
  const FONT = 3
  const firstContent = 4
  const firstPage = firstContent + nPages
  const kids = Array.from({ length: nPages }, (_, i) => `${firstPage + i} 0 R`).join(' ')

  const objs: string[] = []
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`
  objs[2] = `<< /Type /Pages /Count ${nPages} /Kids [${kids}] >>`
  objs[FONT] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
  pages.forEach((content, i) => {
    const length = new TextEncoder().encode(content).length
    objs[firstContent + i] = `<< /Length ${length} >>\nstream\n${content}endstream`
    objs[firstPage + i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${FONT} 0 R >> >> /Contents ${firstContent + i} 0 R >>`
  })

  // 4. Serialize with a cross-reference table. Everything here is ASCII, so
  //    string length == byte length and xref offsets line up.
  const total = objs.length - 1
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let n = 1; n <= total; n++) {
    offsets[n] = pdf.length
    pdf += `${n} 0 obj\n${objs[n]}\nendobj\n`
  }
  const xrefPos = pdf.length
  pdf += `xref\n0 ${total + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= total; n++) pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
