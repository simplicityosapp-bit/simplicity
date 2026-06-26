/* ════════════════════════════════════════════════════════════════
   SSR META — server-side meta injection for public builder pages.
   ════════════════════════════════════════════════════════════════
   Target of the rewrites for /p/<slug> and /lead/<slug> (vercel.json).
   Serves the SPA's index.html with the page's SEO (title + og/twitter)
   injected, so social crawlers — which don't run JS — see per-page cards.
   Real visitors get the same shell and the React app boots as usual.

   BULLETPROOF: any failure (no config, fetch error, bad data) falls back to
   the unmodified index.html. It can never break the public page. */

const SUPABASE_URL = 'https://rdurkakzyymxhocvhufw.supabase.co'
// Publishable (anon) key — the same one shipped in the client bundle; safe to
// embed. Overridable via a Vercel env var if ever rotated.
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_vr-jk0ptqv6xdF-NRTMQ6w_RIQYkZ5A'

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const trim = (v) => (v == null ? '' : String(v)).trim()

function resolveSeo(cfg) {
  const seo = (cfg && cfg.config && cfg.config.seo) || {}
  const sections = Array.isArray(cfg && cfg.sections) ? cfg.sections : []
  const hero = sections.find((x) => x && x.type === 'hero')
  const firstImg = sections.find((x) => x && x.type === 'image' && x.props && trim(x.props.url))
  const img = trim(seo.image || (firstImg && firstImg.props.url) || '')
  return {
    title: trim(seo.title) || trim(hero && hero.props && hero.props.heading),
    description: trim(seo.description) || trim(hero && hero.props && hero.props.subheading),
    image: /^https?:\/\//i.test(img) ? img : '',
  }
}

/* Replace an existing <meta {attr}="{key}"> (or insert before </head>). */
function setMeta(html, attr, key, value) {
  if (!value) return html
  const tag = `<meta ${attr}="${key}" content="${esc(value)}">`
  const re = new RegExp(`<meta\\s+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i')
  return re.test(html) ? html.replace(re, tag) : html.replace(/<\/head>/i, `  ${tag}\n</head>`)
}

function injectMeta(html, seo, url) {
  if (seo.title) {
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(seo.title)}</title>`)
    html = setMeta(html, 'property', 'og:title', seo.title)
    html = setMeta(html, 'name', 'twitter:title', seo.title)
  }
  if (seo.description) {
    html = setMeta(html, 'name', 'description', seo.description)
    html = setMeta(html, 'property', 'og:description', seo.description)
    html = setMeta(html, 'name', 'twitter:description', seo.description)
  }
  if (seo.image) {
    html = setMeta(html, 'property', 'og:image', seo.image)
    html = setMeta(html, 'name', 'twitter:image', seo.image)
    html = setMeta(html, 'name', 'twitter:card', 'summary_large_image')
  }
  if (url) html = setMeta(html, 'property', 'og:url', url)
  return html
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const base = `${proto}://${host}`

  // 1) Fetch the SPA shell. If even this fails, let the static file serve.
  let html
  try {
    const r = await fetch(`${base}/index.html`)
    html = await r.text()
  } catch {
    res.setHeader('Location', '/index.html'); res.status(302).end(); return
  }

  // 2) Best-effort meta injection — never throws out of here.
  try {
    const kind = req.query && req.query.kind === 'lead' ? 'lead' : 'landing'
    const slug = req.query && req.query.slug ? String(req.query.slug) : ''
    if (slug) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/site-intake?page=${encodeURIComponent(slug)}&kind=${kind}`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      })
      if (r.ok) {
        const seo = resolveSeo(await r.json())
        const original = kind === 'lead' ? `/lead/${slug}` : `/p/${slug}`
        html = injectMeta(html, seo, `${base}${original}`)
      }
    }
  } catch { /* keep the unmodified shell */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  res.status(200).send(html)
}
