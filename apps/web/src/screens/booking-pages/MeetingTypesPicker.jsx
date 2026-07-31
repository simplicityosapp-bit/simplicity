import { useState } from 'react'
import { Plus, Clock } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   WHAT THE PAGE OFFERS — the meeting types, and how long each runs.
   ════════════════════════════════════════════════════════════════
   Shared by the creation wizard and the builder.

   The fallback length lives here now. It used to be "אורך ברירת מחדל (דק׳)",
   a number among the five technical availability settings, a whole section away
   from the list it governs — so the page had two places that set how long a
   meeting is and neither mentioned the other. It is one sentence at the foot of
   the list now, right under the types whose blank boxes it fills, and it says
   what it does instead of naming itself.
   ════════════════════════════════════════════════════════════════ */
export default function MeetingTypesPicker({
  meetingTypes, selectedIds, durations, defaultDuration,
  onToggle, onSetDuration, onSetDefaultDuration, onAddType,
  /* The empty state is the one thing the two hosts cannot share. The wizard can
     say "or skip"; the builder has no steps to skip, and saying so there is a
     small lie about where you are. */
  emptyKey = 'pages.meetingTypesEmpty',
}) {
  const { t } = useT('booking')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')

  const submitNew = async () => {
    const name = newName.trim()
    if (!name || adding) return
    setAdding(true)
    setAddErr('')
    try {
      /* The hook takes the whole row, not a name — a bare string would insert a
         type with no order and no length. The new type inherits the fallback
         length, which is the one the coach can see on this screen. */
      const row = await onAddType({
        name,
        sort_order: meetingTypes.length,
        duration_minutes: defaultDuration,
      })
      if (row?.id) onToggle(row.id)
      setNewName('')
    } catch (e) {
      setAddErr(t('pages.errAddTypeFailed', { error: e.message || '' }))
    } finally { setAdding(false) }
  }

  return (
    <>
      {meetingTypes.length === 0 ? (
        <Txt as="p" className="bk-empty-note">{t(emptyKey)}</Txt>
      ) : (
        <Box className="bk-type-list">
          {meetingTypes.map((mt) => {
            const on = selectedIds.includes(mt.id)
            return (
              <Box key={mt.id} className={`bk-type-row${on ? ' on' : ''}`}>
                <Box as="label" className="bk-type-pick">
                  <Input type="checkbox" checked={on} onChange={() => onToggle(mt.id)} />
                  <Txt className="bk-type-name">{mt.name}</Txt>
                </Box>
                <Box className="bk-type-dur">
                  <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
                  <Input
                    type="number" min="5" step="5" className="bk-dur-input"
                    value={durations[mt.id] ?? ''}
                    placeholder={String(mt.duration_minutes || defaultDuration)}
                    onChange={(e) => onSetDuration(mt.id, e.target.value)}
                    aria-label={t('pages.typeDurationAria', { name: mt.name })}
                  />
                  <Txt className="bk-dur-unit">{t('pages.durationUnit')}</Txt>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {/* The number that fills every blank box above — said as a sentence, in
          the one place where it has a visible effect. */}
      <Box className="bk-fallback-dur">
        <Txt className="bk-fallback-text">{t('pages.fallbackDurationBefore')}</Txt>
        <Input
          type="number" min="5" step="5" className="bk-dur-input"
          value={defaultDuration}
          onChange={(e) => onSetDefaultDuration(Number(e.target.value))}
          aria-label={t('pages.defaultDurationLabel')}
        />
        <Txt className="bk-fallback-text">{t('pages.fallbackDurationAfter')}</Txt>
      </Box>

      <Box className="bk-newtype-row">
        <Input
          className="m-input" type="text" maxLength={60}
          value={newName}
          placeholder={t('pages.newTypeNamePlaceholder')}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNew() } }}
          aria-label={t('pages.newTypeDialogTitle')}
        />
        <Btn type="button" className="bk-mini-btn" onClick={submitNew} disabled={adding || !newName.trim()}>
          <Plus size={14} strokeWidth={1.9} /> {adding ? t('pages.adding') : t('pages.add')}
        </Btn>
      </Box>
      {addErr && <Txt as="p" className="m-error">{addErr}</Txt>}
    </>
  )
}
