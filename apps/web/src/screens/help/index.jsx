import { useState } from 'react'
import { BookOpen, HelpCircle, ChevronDown, Lightbulb } from 'lucide-react'
import { getHelpScreen, getGlobalFaq } from '../../lib/helpContent'
import { useT } from '../../i18n/useT'
import MG from '../../components/MG'
import './HelpScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

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

   Content comes from lib/helpContent.js, shared with the per-screen HelpFab
   sheet — one source, so a screen's guidance can't drift between the two
   places it appears. The tip list reuses the help-* classes from
   HelpFab.css, always loaded inside AppShell.
   ════════════════════════════════════════════════════════════════ */

const TABS = [
  { key: 'guide', icon: BookOpen },
  { key: 'faq', icon: HelpCircle },
]

/* Reading order for the guide — deliberate, not the raw object key order.
   Owner-only screens (admin) are omitted. */
const GUIDE_ORDER = [
  'home', 'clients', 'leads', 'finance', 'projects', 'tasks',
  'calendar', 'goals', 'insights', 'moon', 'reports', 'connections',
  'settings', 'trash',
]

export default function HelpScreen() {
  const { t } = useT('settings')
  const [tab, setTab] = useState('guide')

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

        {tab === 'guide' ? <Guide /> : <Faq />}
      </Box>
    </Box>
  )
}

function Guide() {
  const { t } = useT('settings')
  return (
    <Box className="hs-guide">
      <Txt as="p" className="hs-intro">{t('about.guideIntro')}</Txt>
      {GUIDE_ORDER.map((key) => {
        const s = getHelpScreen(key)
        if (!s) return null
        return (
          <Box as="details" key={key} className="hs-guide-screen">
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
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

function Faq() {
  return (
    <Box className="hs-faq">
      {getGlobalFaq().map((cat, ci) => (
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
