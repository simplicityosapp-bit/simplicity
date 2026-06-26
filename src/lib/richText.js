/* ════════════════════════════════════════════════════════════════
   RICH TEXT — a tiny, SAFE markdown-lite → HTML renderer.
   ════════════════════════════════════════════════════════════════
   Used by the page builder's text block. Coaches write light markdown
   (**bold**, *italic*, [links](url), - lists, 1. lists, ## headings);
   the renderer turns it into a small, fixed set of tags.

   SAFE BY CONSTRUCTION: the input is HTML-escaped FIRST, so no user text
   can ever introduce a tag/attribute. The only tags in the output are the
   ones WE emit from markdown syntax, and the only user-controlled attribute
   (a link href) is allow-listed to http(s)/mailto. No raw HTML passes
   through, so there is nothing to sanitize and no XSS surface. */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* Allow only safe link targets; upgrade a bare domain to https. Anything else
   (javascript:, data:, etc.) yields '' → the link renders as plain text. */
function safeHref(url) {
  const u = String(url || '').trim()
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u)) return 'https://' + u
  return ''
}

/* Bold / italic on an already-escaped string. The `_` italic is intraword-safe
   (so snake_case / file_name aren't mangled). */
function emphasis(s) {
  return s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')
}

/* Inline formatting on an ALREADY-ESCAPED string. Links are extracted to
   private-use tokens BEFORE the emphasis passes, so a `*`/`_` inside an href or
   in `target="_blank"` can never run over (and corrupt) the emitted <a> tag. */
function inline(s) {
  const links = []
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const href = safeHref(url)
    const inner = emphasis(text)
    links.push(href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner)
    return `${links.length - 1}`
  })
  s = emphasis(s)
  return s.replace(/(\d+)/g, (m, i) => links[Number(i)])
}

/* Block-level: paragraphs (blank-line separated), ## / ### headings,
   - / * bullet lists, 1. ordered lists; single newlines become <br>. */
export function renderRichText(md) {
  // Cap length: the link regex is O(n²) on a long run of '[' — bound it so a
  // pathological paste can't freeze the render (a text block is never this long).
  const lines = esc(String(md == null ? '' : md).slice(0, 20000)).split('\n')
  const out = []
  let list = null            // 'ul' | 'ol' | null
  let para = []
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = [] } }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) { flushPara(); closeList(); continue }
    const h = line.match(/^(#{2,3})\s+(.*)$/)
    const ul = line.match(/^[-*]\s+(.*)$/)
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (h) {
      flushPara(); closeList()
      const tag = h[1].length === 2 ? 'h2' : 'h3'
      out.push(`<${tag}>${inline(h[2])}</${tag}>`)
    } else if (ul) {
      flushPara(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul' }
      out.push('<li>' + inline(ul[1]) + '</li>')
    } else if (ol) {
      flushPara(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol' }
      out.push('<li>' + inline(ol[1]) + '</li>')
    } else {
      closeList(); para.push(line)
    }
  }
  flushPara(); closeList()
  return out.join('')
}
