import { X, Plus } from 'lucide-react'
import { templatesForKind } from '../../lib/sitePageTemplates'
import { useT } from '../../i18n/useT'
import SiteRenderer from '../site-page/SiteRenderer'
import { Box, Txt, Btn } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   TEMPLATE PICKER — shown when creating a new page.
   ════════════════════════════════════════════════════════════════
   A modal grid of starter templates (+ "blank"), each with a LIVE
   miniature preview rendered by the same SiteRenderer the editor uses,
   so the thumbnail can never drift from the real page. Picking calls
   onPick(template | null) — null = blank. */

export default function TemplatePicker({ kind, onPick, onClose }) {
  const { t } = useT('siteBuilder')
  const templates = templatesForKind(kind)
  return (
    <Box className="tpl-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('templates.choose')}>
      <Box className="tpl-modal" onClick={(e) => e.stopPropagation()}>
        <Box className="tpl-head">
          <Txt as="h2" className="tpl-title">{t('templates.choose')}</Txt>
          <Btn className="tpl-close" onClick={onClose} aria-label={t('templates.close')} title={t('templates.close')}><X size={18} /></Btn>
        </Box>
        <Box className="tpl-grid">
          {/* A card is a div (not a button) because the live thumbnail contains
              its own <form>/<button> elements — nesting those in a <button> is
              invalid HTML. role/tabIndex/onKeyDown keep it keyboard-operable. */}
          <Box className="tpl-card" role="button" tabIndex={0}
            onClick={() => onPick(null)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(null) } }}>
            <Box className="tpl-thumb tpl-thumb-blank"><Plus size={30} /></Box>
            <Txt className="tpl-name">{t('templates.blank')}</Txt>
          </Box>
          {templates.map((tpl) => (
            <Box className="tpl-card" key={tpl.id} role="button" tabIndex={0}
              onClick={() => onPick(tpl)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(tpl) } }}>
              <Box className="tpl-thumb">
                <Box className="tpl-thumb-scale" aria-hidden="true">
                  <SiteRenderer theme={tpl.theme} sections={tpl.sections} interactive={false} />
                </Box>
              </Box>
              <Txt className="tpl-name">{t('templates.' + tpl.id)}</Txt>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
