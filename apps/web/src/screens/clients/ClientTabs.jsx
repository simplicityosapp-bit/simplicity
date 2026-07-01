import { CheckCircle2, Clock, CircleSlash, CircleDashed } from 'lucide-react'
import MG from '../../components/MG'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* 4 status tabs. no_status only appears when it holds clients (D22). */
const TABS = [
  { key: 'active', labelKey: 'status.active', icon: CheckCircle2 },
  { key: 'wandering', labelKey: 'status.wandering', icon: Clock },
  { key: 'past', labelKey: 'status.past', icon: CircleSlash },
  { key: 'no_status', labelKey: 'status.noStatus', icon: CircleDashed },
]

export default function ClientTabs({ active, counts, showNoStatus, onChange }) {
  const { t } = useT('clients')
  return (
    <Box className="c-tabs-row" role="tablist" aria-label={t('tabsAria')}>
      {TABS.map((tab) => {
        if (tab.key === 'no_status' && !showNoStatus) return null
        const Icon = tab.icon
        const count = counts?.[tab.key] ?? 0
        return (
          <Btn
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={`c-tab${active === tab.key ? ' on' : ''}`}
            onClick={() => onChange(tab.key)}
          >
            <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
            <Txt><MG text={t(tab.labelKey)} /></Txt>
            <Txt className="c-tab-count">{count}</Txt>
          </Btn>
        )
      })}
    </Box>
  )
}
