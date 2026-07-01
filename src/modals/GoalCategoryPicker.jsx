import { Plus } from 'lucide-react'
import Modal from './Modal'
import { CATEGORY_PRESETS } from '../lib/goalPresets'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* Pick a category to add: available presets (not already added) + custom.
   onAddPreset(preset) inserts directly; onAddCustom opens the custom modal. */
export default function GoalCategoryPicker({ open, onClose, categories = [], onAddPreset, onAddCustom }) {
  const { t } = useT('modalsData')
  const taken = new Set(categories.map((c) => c.data_source).filter(Boolean))
  const available = CATEGORY_PRESETS.filter((p) => !taken.has(p.data_source))

  return (
    <Modal open={open} onClose={onClose} title={t('catPicker.title')}>
      <Box className="g-welcome-actions">
        {available.map((p) => (
          <Btn key={p.key} type="button" className="g-preset" onClick={() => { onAddPreset(p); onClose() }}>
            <Txt className="g-preset-ic">{p.icon}</Txt>
            <Txt className="g-preset-name">{p.name}</Txt>
            <Txt className="g-preset-hint">{p.hint}</Txt>
          </Btn>
        ))}
        <Btn type="button" className="g-preset custom" onClick={() => { onClose(); onAddCustom() }}>
          <Txt className="g-preset-ic"><Plus size={18} strokeWidth={1.8} aria-hidden="true" /></Txt>
          <Txt className="g-preset-name">{t('catPicker.customName')}</Txt>
          <Txt className="g-preset-hint">{t('catPicker.customHint')}</Txt>
        </Btn>
      </Box>
    </Modal>
  )
}
