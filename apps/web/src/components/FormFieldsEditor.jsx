import { Trash2, Plus } from 'lucide-react'
import { FIELD_TYPES, isChoiceType, isConsentType, defaultChoiceOptions, freeFieldKey } from '../lib/sitePageSchema'
import { useT } from '../i18n/useT'
import SelectMenu from './SelectMenu'
import './FormFieldsEditor.css'
import { Box, Txt, Btn, Input } from './ui'

/* ════════════════════════════════════════════════════════════════
   LEAD-FORM FIELD EDITOR — label + type + required, per field.
   ════════════════════════════════════════════════════════════════
   Lifted out of the site-page Editor so the BOOKING builder can offer the
   same control instead of growing a second, weaker one: the booking page
   collected the same four fields the lead form does, hardcoded, with no way
   to mark one required or drop one (beta 02/08).

   Builtin fields keep their reserved key and their type — those two map to
   real columns (leads/bookings name·phone·email·note), so letting either
   change would break the mapping. Everything else about them is editable,
   and free fields are fully editable and land in the row's `data` JSON.

   The i18n namespace stays `siteBuilder`: these strings are the field
   editor's, and copying them into a second namespace to translate twice is
   how the two copies start drifting.
   ════════════════════════════════════════════════════════════════ */
export default function FormFieldsEditor({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const fields = Array.isArray(value) ? value : []
  const setField = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const remove = (i) => onChange(fields.filter((_, j) => j !== i))
  const add = () => onChange([...fields, { key: freeFieldKey(fields), label: t('fields.newField'), type: 'text', required: false, builtin: false }])
  // Per-option editing for choice fields (select/checkbox): one row each, add/remove individually.
  const setOption = (i, oi, val) => setField(i, { options: (fields[i].options || []).map((o, k) => (k === oi ? val : o)) })
  const addOption = (i) => setField(i, { options: [...(fields[i].options || []), ''] })
  const removeOption = (i, oi) => setField(i, { options: (fields[i].options || []).filter((_, k) => k !== oi) })
  return (
    <Box className="spe-f">
      <Txt>{t('fields.formFields')}</Txt>
      {fields.map((f, i) => (
        <Box className="spe-listitem" key={f.key}>
          <Box className="spe-listitem-head">
            <Input className="spe-flex" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            {!f.builtin ? <Btn onClick={() => remove(i)}><Trash2 size={13} /></Btn> : null}
          </Box>
          <Box className="spe-field-row">
            <SelectMenu
              value={f.type}
              disabled={f.builtin}
              onChange={(v) => setField(i, { type: v, ...(isChoiceType(v) && !f.options ? { options: defaultChoiceOptions() } : {}) })}
              ariaLabel={t('fields.formFields')}
              options={FIELD_TYPES.map((ft) => ({ value: ft, label: t('fieldTypes.' + ft) }))}
            />
            <Box as="label" className="spe-req-toggle"><Input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> {t('fields.required')}</Box>
          </Box>
          {isChoiceType(f.type) ? (
            <Box className="spe-opts">
              {(f.options || []).map((o, oi) => (
                <Box className="spe-opt-row" key={oi}>
                  <Input className="spe-flex" placeholder={t('fields.optionPlaceholder')}
                    value={o} onChange={(e) => setOption(i, oi, e.target.value)} />
                  <Btn onClick={() => removeOption(i, oi)}><Trash2 size={13} /></Btn>
                </Box>
              ))}
              <Btn className="spe-add-opt" onClick={() => addOption(i)}><Plus size={13} /> {t('fields.addOption')}</Btn>
            </Box>
          ) : isConsentType(f.type) ? (
            <>
              <Input className="spe-flex" placeholder={t('fields.consentLinkUrl')}
                value={f.link || ''} onChange={(e) => setField(i, { link: e.target.value })} />
              <Input className="spe-flex" placeholder={t('fields.consentLinkText')}
                value={f.linkText || ''} onChange={(e) => setField(i, { linkText: e.target.value })} />
            </>
          ) : null}
        </Box>
      ))}
      <Btn className="spe-add-row" onClick={add}><Plus size={14} /> {t('fields.addField')}</Btn>
    </Box>
  )
}
