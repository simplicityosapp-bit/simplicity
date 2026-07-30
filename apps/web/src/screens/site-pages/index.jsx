import { useNavigate } from 'react-router-dom'
import { LayoutTemplate, ClipboardList, CalendarClock, ChevronLeft, Check } from 'lucide-react'
import { KIND_LABEL } from '../../lib/sitePageSchema'
import { ROUTES, buildRoute } from '../../lib/routes'
import { useSitePages } from '../../hooks/useSitePages'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useT } from '../../i18n/useT'
import './siteBuilderI18n'
import './SitePagesScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   PAGE BUILDER HUB — /pages
   ════════════════════════════════════════════════════════════════
   One home for the three building tools (landing / lead / booking),
   mirroring the Connections screen: a list of tiles, each tapping into its
   own dedicated builder sub-screen. landing + lead run on the block engine
   (/pages/<kind>); booking opens its existing builder. */

const TILES = [
  { kind: 'landing', icon: LayoutTemplate, to: buildRoute(ROUTES.SITE_PAGE_KIND, { kind: 'landing' }), desc: 'descLanding' },
  { kind: 'lead', icon: ClipboardList, to: buildRoute(ROUTES.SITE_PAGE_KIND, { kind: 'lead' }), desc: 'descLead' },
  { kind: 'booking', icon: CalendarClock, to: ROUTES.BOOKING_PAGES, desc: 'descBooking' },
]

export default function SitePagesScreen() {
  const { t } = useT('siteBuilder')
  const navigate = useNavigate()
  /* Both hooks are React-Query-cached and the builders behind these tiles read
     the same keys, so this is the fetch those screens would do anyway — one
     screen earlier. */
  const { pages: sitePages, loading: sitePagesLoading } = useSitePages()
  const { pages: bookingPages, loading: bookingLoading } = useBookingPages()

  /* What the tile says under its name. The Connections rows these are modelled
     on carry live status; these carried a fixed sentence, so /pages could not
     tell you whether you had five pages or none, or whether anything was
     actually online — the one question you open this screen to answer. */
  const stateFor = (kind) => {
    const loading = kind === 'booking' ? bookingLoading : sitePagesLoading
    if (loading) return null
    const list = kind === 'booking' ? bookingPages : sitePages.filter((p) => p.kind === kind)
    const live = list.filter((p) => p.published).length
    if (!list.length) return { text: t('hub.stateEmpty'), live: false }
    return {
      text: live
        ? `${t('hub.statePages', { count: list.length })} · ${t('hub.stateLive', { count: live })}`
        : t('hub.statePages', { count: list.length }),
      live: live > 0,
    }
  }

  return (
    <Box className="screen" data-screen="sitePages">
      <Box as="header" className="screen-head spg-hub-head">
        <Txt as="p" className="t-screen">
          <LayoutTemplate size={20} strokeWidth={1.6} aria-hidden="true" />
          {t('hub.title')}
        </Txt>
      </Box>

      <Box className="spg-tiles">
        {TILES.map((tile) => {
          const Icon = tile.icon
          const title = t('kinds.' + tile.kind, { defaultValue: KIND_LABEL[tile.kind] })
          const state = stateFor(tile.kind)
          return (
            <Btn key={tile.kind} type="button" className="spg-tile" onClick={() => navigate(tile.to)}
              aria-label={[title, t('hub.' + tile.desc), state?.text].filter(Boolean).join(' — ')}>
              <Txt className="spg-tile-icon"><Icon size={22} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Txt className="spg-tile-body">
                <Txt className="spg-tile-title">{title}</Txt>
                <Txt className="spg-tile-desc">{t('hub.' + tile.desc)}</Txt>
                {/* Reserved even while loading, so the row doesn't jump once the
                    counts arrive. */}
                <Txt className={`spg-tile-state${state?.live ? ' is-live' : ''}`}>
                  {state?.live ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : null}
                  {state?.text ?? ' '}
                </Txt>
              </Txt>
              <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" className="spg-tile-chevron" />
            </Btn>
          )
        })}
      </Box>
    </Box>
  )
}
