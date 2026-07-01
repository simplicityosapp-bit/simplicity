import { useNavigate } from 'react-router-dom'
import { LayoutTemplate, ClipboardList, CalendarClock, ChevronLeft } from 'lucide-react'
import { KIND_LABEL } from '../../lib/sitePageSchema'
import { ROUTES, buildRoute } from '../../lib/routes'
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

  return (
    <Box className="screen" data-screen="sitePages">
      <Box as="header" className="screen-head spg-hub-head">
        <Box>
          <Txt as="p" className="t-screen"><LayoutTemplate size={20} strokeWidth={1.6} aria-hidden="true" /> {t('hub.title')}</Txt>
          <Txt as="p" className="lbl-sm">{t('hub.subtitle')}</Txt>
        </Box>
      </Box>

      <Box className="spg-tiles">
        {TILES.map((tile) => {
          const Icon = tile.icon
          const title = t('kinds.' + tile.kind, { defaultValue: KIND_LABEL[tile.kind] })
          return (
            <Btn key={tile.kind} type="button" className="spg-tile" onClick={() => navigate(tile.to)}
              aria-label={`${title} — ${t('hub.' + tile.desc)}`}>
              <Txt className="spg-tile-icon"><Icon size={22} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Txt className="spg-tile-body">
                <Txt className="spg-tile-title">{title}</Txt>
                <Txt className="spg-tile-desc">{t('hub.' + tile.desc)}</Txt>
              </Txt>
              <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" className="spg-tile-chevron" />
            </Btn>
          )
        })}
      </Box>
    </Box>
  )
}
