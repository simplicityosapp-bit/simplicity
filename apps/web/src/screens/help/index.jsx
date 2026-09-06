import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, HelpCircle, ChevronDown, Lightbulb, Search, X, ArrowLeft, MessageSquarePlus } from 'lucide-react'
import { getHelpScreen, getGlobalFaq, guideOrder } from '../../lib/helpContent'
import { searchHelp } from './searchHelp'
import { routeForScreen } from '../../lib/nav'
import { useT } from '../../i18n/useT'
import MG from '../../components/MG'
import './HelpScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   HELP — the full guide and the FAQ, as a screen of their own.
   ════════════════════════════════════════════════════════════════
   These used to be two tabs inside Settings → אודות, which put the app's
   entire manual four disclosures deep: open settings, open the group, open
   the section, pick the tab — and then open the screen you wanted to read
   about. The floating ? button on every screen offered a shortcut straight
   to it, and even that landed on a collapsed settings page, because it
   named the section but not the group holding it.

   One press now. Settings keeps אודות for what it actually is: the app's
   identity, its version, and the legal documents.

   Three ways in, because "where is the answer" has three shapes:
     • search — one query over the guide AND the FAQ, for a reader who has
       a question and no idea which of the two lists holds it. See
       searchHelp.js.
     • the chapter list — a map of the manual, and of the app.
     • an address — /help?screen=clients opens that chapter and scrolls to
       it. The ? sheet's "full guide" link uses it, so arriving from a
       screen lands on that screen's chapter rather than on seventeen shut
       rows, and support has something to send.

   Content comes from lib/helpContent.js, shared with the per-screen HelpFab
   sheet — one source, so a screen's guidance can't drift between the two
   places it appears. The tip list reuses the help-* classes from
   HelpFab.css, always loaded inside AppShell.
   ════════════════════════════════════════════════════════════════ */

const TABS = [
  { key: 'guide', icon: BookOpen },
  { key: 'faq', icon: HelpCircle },
]

export default function HelpScreen({ onOpenFeedback }) {
  const { t, lang } = useT('settings')
  const [tab, setTab] = useState('guide')
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()

  /* Re-resolved when the language changes. `lang` looks unused to the linter
     because the dependency is inside the getters: guideOrder(), getHelpScreen()
     and getGlobalFaq() all read the i18n singleton, so switching language has
     to invalidate these or the manual stays in the old one. */
  /* eslint-disable react-hooks/exhaustive-deps */
  const chapters = useMemo(
    () => guideOrder().map((key) => ({ key, chapter: getHelpScreen(key) })).filter((c) => c.chapter),
    [lang],
  )
  const faqCategories = useMemo(() => getGlobalFaq(), [lang])
  /* eslint-enable react-hooks/exhaustive-deps */
  const results = useMemo(() => searchHelp(chapters, faqCategories, query), [chapters, faqCategories, query])

  /* replace, not push: jumping between chapters is navigation within one
     page, and a reader who tapped four of them shouldn't need four backs
     to leave. */
  const jump = useCallback((key) => {
    setQuery('')
    setTab('guide')
    setParams({ screen: key }, { replace: true })
  }, [setParams])

  return (
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <BookOpen size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('help.title')}
          </Txt>
        </Box>
      </Box>

      <Box className="hs-screen">
        <Box className="hs-search">
          <Search size={16} strokeWidth={1.7} aria-hidden="true" />
          <Input
            type="search"
            className="hs-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('help.search.placeholder')}
            aria-label={t('help.search.aria')}
          />
          {query && (
            <Btn type="button" className="hs-search-clear" onClick={() => setQuery('')} aria-label={t('help.search.clear')}>
              <X size={15} strokeWidth={2} aria-hidden="true" />
            </Btn>
          )}
        </Box>

        {/* While a query is live the two lists stop being two lists: the
            results carry where each answer came from, which is the only
            part the reader needed the tabs for. */}
        {!results.active && (
          <Box className="hs-tabs" role="tablist" aria-label={t('help.tabsAria')}>
            {TABS.map((x) => {
              const Icon = x.icon
              return (
                <Btn
                  key={x.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === x.key}
                  className={`hs-tab${tab === x.key ? ' on' : ''}`}
                  onClick={() => setTab(x.key)}
                >
                  <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                  {t(`help.tabs.${x.key}`)}
                </Btn>
              )
            })}
          </Box>
        )}

        {results.active
          ? <Results results={results} query={query} onJump={jump} />
          : tab === 'guide'
            ? <Guide chapters={chapters} wanted={params.get('screen')} onJump={jump} />
            : <Faq categories={faqCategories} />}

        {/* Under every state of this screen, "nothing found" included — the
            exact moment a reader decides the app has no answer for them. */}
        <Box className="hs-contact">
          <Txt as="p" className="hs-contact-t">{t('help.contact.title')}</Txt>
          <Txt as="p" className="hs-contact-b">{t('help.contact.body')}</Txt>
          <Btn type="button" className="hs-contact-cta" onClick={() => onOpenFeedback?.()}>
            <MessageSquarePlus size={16} strokeWidth={1.7} aria-hidden="true" />
            {t('help.contact.cta')}
          </Btn>
        </Box>
      </Box>
    </Box>
  )
}

/* ── Search results ─────────────────────────────────────────────── */

function Results({ results, query, onJump }) {
  const { t } = useT('settings')

  if (results.count === 0) {
    return (
      <Box className="hs-none">
        <Txt as="p" className="hs-none-t">{t('help.search.none', { query })}</Txt>
        <Txt as="p" className="hs-none-b">{t('help.search.noneHint')}</Txt>
      </Box>
    )
  }

  return (
    <Box className="hs-results">
      <Txt as="p" className="hs-count">{t('help.search.results', { count: results.count })}</Txt>

      {results.guide.length > 0 && (
        <>
          <Txt as="p" className="hs-res-where">{t('help.search.inGuide')}</Txt>
          {results.guide.map((c) => (
            <Box key={c.key} className="hs-res-chapter">
              <Box className="hs-res-head">
                <Txt as="p" className="hs-res-title">{c.title}</Txt>
                <Btn type="button" className="hs-res-open" onClick={() => onJump(c.key)}>
                  {t('help.search.openChapter')}
                  <ArrowLeft size={13} strokeWidth={1.8} aria-hidden="true" />
                </Btn>
              </Box>
              {c.intro && <Txt as="p" className="hs-guide-intro"><MG text={c.intro} /></Txt>}
              {c.features.map((f, i) => (
                <Box key={i} className="hs-feat">
                  <Txt as="p" className="hs-feat-t"><MG text={f.title} /></Txt>
                  <Txt as="p" className="hs-feat-b"><MG text={f.body} /></Txt>
                </Box>
              ))}
              {c.tips.length > 0 && (
                <Box as="ul" className="help-tips">
                  {c.tips.map((tip, i) => (
                    <Box as="li" key={i} className="help-tip">
                      <Txt className="help-tip-icon">
                        <Lightbulb size={15} strokeWidth={1.7} aria-hidden="true" />
                      </Txt>
                      <MG text={tip} />
                    </Box>
                  ))}
                </Box>
              )}
              {c.faq.map((item, i) => (
                <Box key={i} className="hs-qa">
                  <Txt as="p" className="hs-q"><MG text={item.q} /></Txt>
                  <Txt as="p" className="hs-a"><MG text={item.a} /></Txt>
                </Box>
              ))}
            </Box>
          ))}
        </>
      )}

      {results.faq.length > 0 && (
        <>
          <Txt as="p" className="hs-res-where">{t('help.search.inFaq')}</Txt>
          {results.faq.map((cat, ci) => (
            <Box key={ci} className="hs-res-chapter">
              <Txt as="p" className="hs-res-title">{cat.category}</Txt>
              {cat.items.map((item, i) => (
                <Box key={i} className="hs-qa">
                  <Txt as="p" className="hs-q"><MG text={item.q} /></Txt>
                  <Txt as="p" className="hs-a"><MG text={item.a} /></Txt>
                </Box>
              ))}
            </Box>
          ))}
        </>
      )}
    </Box>
  )
}

/* ── The guide ──────────────────────────────────────────────────── */

function Guide({ chapters, wanted, onJump }) {
  const { t } = useT('settings')
  const navigate = useNavigate()
  const keys = chapters.map((c) => c.key)

  /* Which chapters are expanded. A Set, not a single key: this is a manual,
     and closing what you were reading to open the next one is the wrong
     trade. The URL only ever names the one to jump to. */
  const [open, setOpen] = useState(() => new Set(wanted && keys.includes(wanted) ? [wanted] : []))
  const rows = useRef({})

  /* Follow the address bar: arriving with ?screen=…, and the back button
     afterwards. Opening a chapter by hand does NOT write to the URL — that
     would put a history entry behind every disclosure triangle. */
  useEffect(() => {
    if (!wanted || !keys.includes(wanted)) return undefined
    setOpen((prev) => (prev.has(wanted) ? prev : new Set(prev).add(wanted))) // eslint-disable-line react-hooks/set-state-in-effect
    /* After the row has painted its body, so the scroll lands on the open
       chapter rather than where the shut one used to be. */
    const id = requestAnimationFrame(() => rows.current[wanted]?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [wanted]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((key, isOpen) => {
    setOpen((prev) => {
      if (prev.has(key) === isOpen) return prev
      const next = new Set(prev)
      if (isOpen) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  return (
    <Box className="hs-guide">
      <Txt as="p" className="hs-intro">{t('about.guideIntro')}</Txt>

      <Box as="nav" className="hs-jump" aria-label={t('about.guideJump')}>
        {chapters.map(({ key, chapter }) => (
          <Btn
            key={key}
            type="button"
            className={`hs-jump-chip${open.has(key) ? ' on' : ''}`}
            onClick={() => onJump(key)}
          >
            {chapter.title}
          </Btn>
        ))}
      </Box>

      {chapters.map(({ key, chapter: s }) => (
        <Box
          as="details"
          key={key}
          className="hs-guide-screen"
          ref={(el) => { rows.current[key] = el }}
          open={open.has(key)}
          onToggle={(e) => toggle(key, e.currentTarget.open)}
        >
          <Txt as="summary">
            {s.title}
            <ChevronDown size={16} strokeWidth={1.7} className="hs-chev" aria-hidden="true" />
          </Txt>
          <Box className="hs-guide-body">
            {s.intro && <Txt as="p" className="hs-guide-intro"><MG text={s.intro} /></Txt>}
            {(s.features || []).map((f, i) => (
              <Box key={i} className="hs-feat">
                <Txt as="p" className="hs-feat-t"><MG text={f.title} /></Txt>
                <Txt as="p" className="hs-feat-b"><MG text={f.body} /></Txt>
              </Box>
            ))}
            {(s.tips || []).length > 0 && (
              <>
                <Txt as="p" className="hs-sub">{t('about.guideTips')}</Txt>
                <Box as="ul" className="help-tips">
                  {s.tips.map((tip, i) => (
                    <Box as="li" key={i} className="help-tip">
                      <Txt className="help-tip-icon">
                        <Lightbulb size={15} strokeWidth={1.7} aria-hidden="true" />
                      </Txt>
                      <MG text={tip} />
                    </Box>
                  ))}
                </Box>
              </>
            )}
            {(s.faq || []).length > 0 && (
              <>
                <Txt as="p" className="hs-sub">{t('about.guideFaq')}</Txt>
                {s.faq.map((item, i) => (
                  <Box key={i} className="hs-qa">
                    <Txt as="p" className="hs-q"><MG text={item.q} /></Txt>
                    <Txt as="p" className="hs-a"><MG text={item.a} /></Txt>
                  </Box>
                ))}
              </>
            )}
            {routeForScreen(key) && (
              <Btn type="button" className="hs-goto" onClick={() => navigate(routeForScreen(key))}>
                {t('help.openScreen')}
                <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
              </Btn>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function Faq({ categories }) {
  return (
    <Box className="hs-faq">
      {categories.map((cat, ci) => (
        <Box key={ci} className="hs-faq-group">
          <Txt as="p" className="hs-faq-cat">{cat.category}</Txt>
          {cat.items.map((item, i) => (
            <Box as="details" key={i} className="hs-faq-item">
              <Txt as="summary">
                <MG text={item.q} />
                <ChevronDown size={15} strokeWidth={1.7} className="hs-chev" aria-hidden="true" />
              </Txt>
              <Txt as="p" className="hs-a"><MG text={item.a} /></Txt>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}
