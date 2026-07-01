import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MessageCircle, Check, RotateCcw } from 'lucide-react'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { resolveMessage } from '../../lib/whatsapp'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import './WhatsAppConnection.css'
import { Box, Txt, Btn, Textarea } from '../../components/ui'

/* The five customisable send surfaces and the tokens each one offers. The
   keys match components:whatsapp.defaults.* and prefs.whatsapp.templates.*. */
const FIELDS = [
  { key: 'client', tokens: ['name'] },
  { key: 'reminder', tokens: ['name', 'title'] },
  { key: 'meeting', tokens: ['name', 'date', 'time'] },
  { key: 'receipt', tokens: ['name', 'number', 'url'] },
  { key: 'lead', tokens: ['name'] },
  { key: 'payment', tokens: ['name', 'balance'] },
]

/* Literal token values → t() re-emits the {{token}} verbatim, so we can show
   the raw default (with its placeholders) as the textarea placeholder. */
const TOKEN_LITERAL = {
  name: '{{name}}', title: '{{title}}', date: '{{date}}',
  time: '{{time}}', number: '{{number}}', url: '{{url}}', balance: '{{balance}}',
}
/* Sample values for the live preview line. */
const SAMPLE = {
  name: 'דנה', title: 'להביא יומן', date: '12/06',
  time: '17:00', number: '1042', url: 'https://wa.me/doc', balance: '₪1,200',
}

/* Sub-screen: edit the default WhatsApp messages. There's nothing to
   "connect" (manual click-to-chat needs no credentials) — this screen just
   lets the coach personalise the prefilled text for each send surface.
   Empty field = the built-in localized default is used. */
export default function WhatsAppConnectionScreen() {
  const { t } = useT('connections')
  const { t: tc } = useT('components')
  const navigate = useNavigate()
  const { prefs, update } = useUserPreferences()
  const refs = useRef({})
  const seeded = useRef(false)
  const [draft, setDraft] = useState({ client: '', reminder: '', meeting: '', receipt: '', lead: '' })
  const [saved, setSaved] = useState(false)

  /* Seed the draft once from saved prefs (don't clobber edits on re-render). */
  useEffect(() => {
    if (seeded.current || !prefs) return
    seeded.current = true
    setDraft((d) => ({ ...d, ...(prefs.whatsapp?.templates || {}) }))
  }, [prefs])

  const defaultRaw = (key) => tc(`whatsapp.defaults.${key}`, TOKEN_LITERAL)
  const previewOf = (key) => resolveMessage(draft[key], SAMPLE, tc(`whatsapp.defaults.${key}`, SAMPLE))

  const setField = (key, value) => { setSaved(false); setDraft((d) => ({ ...d, [key]: value })) }

  const insertToken = (key, token) => {
    const tok = `{{${token}}}`
    const el = refs.current[key]
    setSaved(false)
    setDraft((d) => {
      const v = d[key] || ''
      if (el && typeof el.selectionStart === 'number') {
        const s = el.selectionStart
        const e = el.selectionEnd
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length) })
        return { ...d, [key]: v.slice(0, s) + tok + v.slice(e) }
      }
      return { ...d, [key]: v + tok }
    })
  }

  const resetField = (key) => { setSaved(false); setDraft((d) => ({ ...d, [key]: '' })) }

  const save = async () => {
    const templates = Object.fromEntries(FIELDS.map((f) => [f.key, (draft[f.key] || '').trim()]))
    await update({ whatsapp: { templates } })
    setSaved(true)
  }

  return (
    <Box className="screen">
      <Box as="header" className="screen-head conn-head conn-detail-head">
        <Btn type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('whatsappScreen.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Box>
          <Txt as="p" className="t-screen"><MessageCircle size={20} strokeWidth={1.6} aria-hidden="true" /> {t('whatsappScreen.title')}</Txt>
          <Txt as="p" className="lbl-sm wa-subtitle">{t('whatsappScreen.subtitle')}</Txt>
        </Box>
      </Box>

      <Box className="wa-fields">
        {FIELDS.map((f) => (
          <Box key={f.key} className="wa-field">
            <Box className="wa-field-head">
              <Box as="label" className="wa-field-label" htmlFor={`wa-${f.key}`}>{t(`whatsappScreen.fields.${f.key}.label`)}</Box>
              {(draft[f.key] || '').trim() && (
                <Btn type="button" className="wa-reset" onClick={() => resetField(f.key)}>
                  <RotateCcw size={12} strokeWidth={1.8} aria-hidden="true" /> {t('whatsappScreen.reset')}
                </Btn>
              )}
            </Box>
            <Txt as="p" className="wa-field-hint">{t(`whatsappScreen.fields.${f.key}.hint`)}</Txt>
            <Textarea
              id={`wa-${f.key}`}
              ref={(el) => { refs.current[f.key] = el }}
              className="wa-textarea"
              rows={2}
              value={draft[f.key] || ''}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={defaultRaw(f.key)}
            />
            <Box className="wa-tokens">
              <Txt className="wa-tokens-label">{t('whatsappScreen.tokensLabel')}</Txt>
              {f.tokens.map((tok) => (
                <Btn key={tok} type="button" className="wa-token" onClick={() => insertToken(f.key, tok)}>
                  {t(`whatsappScreen.tokens.${tok}`)}
                </Btn>
              ))}
            </Box>
            <Txt as="p" className="wa-preview"><Txt className="wa-preview-label">{t('whatsappScreen.preview')}</Txt> {previewOf(f.key)}</Txt>
          </Box>
        ))}
      </Box>

      <Box className="wa-save-bar">
        <Btn type="button" className={`wa-save${saved ? ' is-saved' : ''}`} onClick={save}>
          {saved ? <><Check size={16} strokeWidth={2} aria-hidden="true" /> {t('whatsappScreen.saved')}</> : t('whatsappScreen.save')}
        </Btn>
      </Box>
    </Box>
  )
}
