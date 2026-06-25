import { useState } from 'react'
import Modal from './Modal'
import ClientFormFields from '../components/ClientFormFields'
import MeetingTypesModal from './MeetingTypesModal'
import MG from '../components/MG'
import { showToast } from '../lib/toast'
import { useMeetingTypes } from '../hooks/useMeetingTypes'
import { useT } from '../i18n/useT'

const blank = () => ({
  name: '', status: 'active', status_id: '', sessions: '', price_per_session: '',
  billing_mode: 'package',
  phone: '', email: '', address: '', birth_date: '', project_id: '', group_id: '',
  recurring_day: '', recurring_time: '',
  meeting_type_id: '', price_overridden: false,
})

/* onSave is async (Supabase insert). Sub-status is optional — the user can
   define sub-statuses per meta-category in Settings. Form body is the shared
   <ClientFormFields> so it stays identical to the onboarding client step. */
export default function AddClientModal({ open, onClose, onSave, projects = [], statuses = [] }) {
  const { t } = useT('modalsClient')
  const { types: meetingTypes, refetch: refetchMeetingTypes } = useMeetingTypes()
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [manageTypes, setManageTypes] = useState(false)
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (err) setErr('') }
  const setMeta = (k) => { setForm((f) => ({ ...f, status: k, status_id: '' })); if (err) setErr('') }
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  /* Picking a type auto-fills the price from the type's default (and re-attaches
     the price to the type); the user can still override it by hand afterwards. */
  const pickMeetingType = (id) => {
    const type = meetingTypes.find((mt) => mt.id === id)
    setForm((f) => ({
      ...f,
      meeting_type_id: id,
      price_overridden: false,
      price_per_session: type && type.default_price != null ? String(type.default_price) : f.price_per_session,
    }))
    if (err) setErr('')
  }
  /* A hand-edited price detaches the client from the type's price. */
  const setPrice = (v) => setForm((f) => ({ ...f, price_per_session: v, price_overridden: true }))

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        name: form.name.trim(),
        status: form.status,
        status_meta: form.status,
        status_id: form.status_id || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        sessions: form.billing_mode === 'per_session' ? 0 : (Number(form.sessions) || 0),
        price_per_session: Number(form.price_per_session) || 0,
        billing_mode: form.billing_mode || 'package',
        meeting_type_id: form.meeting_type_id || null,
        price_overridden: !!form.price_overridden,
        total_override: null,
        has_custom_price: false,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        /* A fixed meeting needs a day; with no day the time is inert — drop
           it so a stray time can never persist a half-set meeting. */
        recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
        left_mid_process: false,
        phone: form.phone.trim() || null,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        birth_date: form.birth_date || null,
        notes: null,
        notes_updated_at: null,
      })
      showToast(t('addClient.toastSaved'))
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={close} title={<MG word="client_new" />} titleLabel={t('addClient.titleLabel')}>
      <ClientFormFields
        form={form}
        set={set}
        setMeta={setMeta}
        projects={projects}
        statuses={statuses}
        err={err}
        meetingTypes={meetingTypes}
        onPickMeetingType={pickMeetingType}
        onPriceChange={setPrice}
        onManageMeetingTypes={() => setManageTypes(true)}
      />

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>

      <MeetingTypesModal open={manageTypes} onClose={() => { setManageTypes(false); refetchMeetingTypes() }} />
    </Modal>
  )
}
