/* ════════════════════════════════════════════════════════════════
   ClientFormFields — the shared add-client form body.
   ════════════════════════════════════════════════════════════════
   Extracted when the onboarding client step rendered the same fields.
   Onboarding has its own short form since the 4-step rework, so today
   AddClientModal is the only mount. Uses the modal form classes
   (.m-field / .m-input / .m-pills …) so it looks native wherever it is.

   Only NAME is required, but the form used to open as ~13 fields in
   one scroll, which reads as "all of this is expected of you now".
   Name / phone / status stay in the open; everything else sits behind
   ONE toggle. Nothing was removed: every field is still here and still
   fillable, and the rest can equally be completed later from the
   client's own file.

   Inside the toggle the groups carry the SAME names, in the SAME order,
   as the sections of EditClientModal — details, then the schedule, then
   billing. Creating a client and editing one are the two halves of one
   job, and they used to hand the user two different maps of it: this
   form led with billing under headings ("שיוך", "קשר") that appear
   nowhere in the edit modal. Meeting type moved into the schedule group
   with them, which is where the edit modal keeps it.

   Props:
     - form:     the form state object (name, status, status_id,
                 sessions, price_per_session, phone, project_id,
                 group_id, recurring_day, recurring_time).
     - set:      (key, value) => void — generic field setter.
     - setMeta:  (statusKey) => void — sets status + clears sub-status.
     - projects: project options for the project select.
     - statuses: client_statuses; sub-status select shows only when the
                 active meta-category has sub-statuses.
     - groups:   OPTIONAL. When provided (non-empty), a group select is
                 shown. The in-app modal omits it; onboarding passes the
                 project's groups.
     - err:      current error string (drives the name's error ring).
   ════════════════════════════════════════════════════════════════ */

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from './ui'
import DateField from './DateField'
import SelectMenu from './SelectMenu'
import FormSection from './FormSection'

const STATUSES = [
  { k: 'active', labelKey: 'status.active' },
  { k: 'wandering', labelKey: 'status.wandering' },
  { k: 'past', labelKey: 'status.past' },
  { k: 'no_status', labelKey: 'form.none' },
]
const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6]

export default function ClientFormFields({ form, set, setMeta, projects = [], statuses = [], groups = [], err, meetingTypes = null, onPickMeetingType, onPriceChange, onManageMeetingTypes }) {
  const { t } = useT('clients')
  const subStatuses = statuses.filter((s) => s.meta_category === form.status)
  /* Meeting-type select is opt-in: only the in-app add/edit modals pass
     `meetingTypes`, so the onboarding step's layout stays unchanged. */
  const showMeetingTypes = Array.isArray(meetingTypes)
  const setPrice = onPriceChange || ((v) => set('price_per_session', v))
  const nameMissing = !!err && !form.name.trim()
  /* Option lists for the styled pickers. These five were native <select>s —
     the last of them in the add forms — so tapping one opened the OS wheel
     while the lead and transaction forms opened the app's own menu. */
  const noneOpt = { value: '', label: t('form.none') }
  const subStatusOptions = [noneOpt, ...subStatuses.map((s) => ({ value: s.id, label: `${s.icon ? `${s.icon} ` : ''}${s.display_name}` }))]
  const projectOptions = [noneOpt, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const groupOptions = [{ value: '', label: t('form.noGroup') }, ...groups.map((g) => ({ value: g.id, label: g.name }))]
  const meetingTypeOptions = [noneOpt, ...(meetingTypes || []).map((mt) => ({
    value: mt.id,
    label: `${mt.name}${mt.default_price != null ? ` · ₪${mt.default_price}` : ''}`,
  }))]
  const dayOptions = [noneOpt, ...DAY_KEYS.map((d) => ({ value: String(d), label: t(`form.days.${d}`) }))]
  /* The toggle starts closed — a blank form should cost a name and nothing
     else. It opens on mount only when something inside already carries a
     value, so a part-filled form never hides what's in it.
     project_id / group_id are deliberately NOT part of the test: onboarding
     seeds the project it just created into every new client, so including it
     forced the accordion open on arrival — handing the new user all fourteen
     fields, in the one place the short form matters most. */
  const [moreOpen, setMoreOpen] = useState(() => !!(
    form.sessions || form.price_per_session || form.meeting_type_id
    || form.status_id || form.email || form.address || form.birth_date
    || form.recurring_day !== '' || form.recurring_time
  ))

  return (
    <>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('form.name')}</Box>
        <Input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={t('form.namePlaceholder')}
          aria-label={t('form.name')}
        />
        <Txt as="p" className="m-hint">{t('form.onlyNameRequired')}</Txt>
      </Box>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('form.phone')}</Box>
        <Input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" aria-label={t('form.phone')} />
      </Box>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('form.status')}</Box>
        <Box className="m-pills">
          {STATUSES.map((s) => (
            <Btn
              key={s.k}
              type="button"
              className={`m-pill${form.status === s.k ? ' on' : ''}`}
              onClick={() => setMeta(s.k)}
            >
              {t(s.labelKey)}
            </Btn>
          ))}
        </Box>
      </Box>

      {/* SlidersHorizontal, not the Wallet this used to wear: the lid holds
          details and the schedule as well as billing, and the lead and
          transaction forms name the same lid with the same icon. */}
      <FormSection
        id="client-more"
        icon={<SlidersHorizontal size={16} strokeWidth={1.7} />}
        title={t('form.moreToggle')}
        open={moreOpen}
        onToggle={() => setMoreOpen((o) => !o)}
      >
            <Txt as="p" className="m-group-h">{t('form.grpDetails')}</Txt>
            {subStatuses.length > 0 && (
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.subStatus')}</Box>
                <SelectMenu value={form.status_id} onChange={(v) => set('status_id', v)} options={subStatusOptions} placeholder={t('form.none')} ariaLabel={t('form.subStatus')} />
              </Box>
            )}
            <Box className="m-field">
              <Box as="label" className="m-label">{t('form.project')}</Box>
              <SelectMenu value={form.project_id} onChange={(v) => set('project_id', v)} options={projectOptions} placeholder={t('form.none')} ariaLabel={t('form.project')} />
            </Box>
            {groups.length > 0 && (
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.group')}</Box>
                <SelectMenu value={form.group_id} onChange={(v) => set('group_id', v)} options={groupOptions} placeholder={t('form.noGroup')} ariaLabel={t('form.group')} />
              </Box>
            )}

            <Box className="m-field">
              <Box as="label" className="m-label">{t('form.email')}</Box>
              <Input type="email" className="m-input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" dir="ltr" aria-label={t('form.email')} />
            </Box>
            <Box className="m-field">
              <Box as="label" className="m-label">{t('form.address')}</Box>
              <Input className="m-input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('form.addressPlaceholder')} aria-label={t('form.address')} />
            </Box>
            <Box className="m-field">
              <Box as="label" className="m-label">{t('form.birthDate')}</Box>
              <DateField className="m-input" value={form.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} aria-label={t('form.birthDate')} />
            </Box>

            <Txt as="p" className="m-group-h">{t('form.grpScheduling')}</Txt>
            {/* Meeting type sits with the schedule, not with billing, because
                that is where the edit modal keeps it — even though picking one
                fills the price below. */}
            {showMeetingTypes && (
              <Box className="m-field">
                <Box className="m-label-row">
                  <Box as="label" className="m-label">{t('form.meetingType')}</Box>
                  {onManageMeetingTypes && (
                    <Btn type="button" className="m-clear-link" onClick={onManageMeetingTypes}>{t('form.manageMeetingTypes')}</Btn>
                  )}
                </Box>
                <SelectMenu
                  value={form.meeting_type_id || ''}
                  onChange={(v) => (onPickMeetingType ? onPickMeetingType(v) : set('meeting_type_id', v))}
                  options={meetingTypeOptions}
                  placeholder={t('form.none')}
                  ariaLabel={t('form.meetingType')}
                />
              </Box>
            )}
            <Box className="m-row2">
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.recurringDay')}</Box>
                <SelectMenu value={String(form.recurring_day ?? '')} onChange={(v) => set('recurring_day', v)} options={dayOptions} placeholder={t('form.none')} ariaLabel={t('form.recurringDay')} />
              </Box>
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.recurringTime')}</Box>
                <Input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} aria-label={t('form.recurringTime')} />
              </Box>
            </Box>
            {/* A native time input can't be emptied on touch devices, so once a
                fixed meeting is set by mistake there's no path back to "none".
                This reachable clear resets the whole pair (day + time). */}
            {(form.recurring_day !== '' || form.recurring_time !== '') && (
              <Btn
                type="button"
                className="m-clear-link"
                onClick={() => { set('recurring_day', ''); set('recurring_time', '') }}
              >
                {t('form.clearRecurring')}
              </Btn>
            )}

            <Txt as="p" className="m-group-h">{t('form.grpBilling')}</Txt>
            {/* Billing mode (migration 0014) — 'package' keeps the sessions ×
                price model; 'per_session' bills per held meeting, so the quota
                field is hidden. */}
            <Box className="m-field">
              <Box as="label" className="m-label">{t('form.billingMode')}</Box>
              <Box className="m-pills">
                <Btn
                  type="button"
                  className={`m-pill${(form.billing_mode || 'package') === 'package' ? ' on' : ''}`}
                  onClick={() => set('billing_mode', 'package')}
                >
                  {t('form.package')}
                </Btn>
                <Btn
                  type="button"
                  className={`m-pill${form.billing_mode === 'per_session' ? ' on' : ''}`}
                  onClick={() => set('billing_mode', 'per_session')}
                >
                  {t('form.perSession')}
                </Btn>
              </Box>
              {form.billing_mode === 'per_session' && (
                <Txt as="p" className="m-sub">{t('form.perSessionNote')}</Txt>
              )}
            </Box>

            <Box className="m-row2">
              {/* Shown in BOTH modes — see the note in EditClientModal. For a
                  per-session client this is how many meetings are booked
                  ahead, and it does not bill them; hiding it left no way to
                  record that at all. */}
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.sessionsCount')}</Box>
                <Input type="number" min="0" className="m-input" value={form.sessions} onChange={(e) => set('sessions', e.target.value)} placeholder="0" aria-label={t('form.sessionsCount')} />
              </Box>
              <Box className="m-field">
                <Box as="label" className="m-label">{t('form.pricePerSession')}</Box>
                <Input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => setPrice(e.target.value)} placeholder="0" aria-label={t('form.pricePerSession')} />
              </Box>
            </Box>
      </FormSection>
    </>
  )
}
