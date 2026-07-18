import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  CalendarDays, Plus, ArrowLeft, MapPin, Link2, Trash2, CalendarPlus, Check, Upload,
} from 'lucide-react'
import { fmtTime, fmtRelativeDay } from '@simplicity/core'
import { useCommunityProfile } from '../../hooks/useCommunityProfile'
import { useCommunityEvents } from '../../hooks/useCommunityEvents'
import { useCommunityMembers } from '../../hooks/useCommunityMembers'
import { useAuth } from '../../auth/AuthContext'
import { isAdminUser } from '../../lib/admin'
import ConfirmModal from '../../modals/ConfirmModal'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import './CommunityScreen.css'
import { Box, Txt, Btn, Input, Textarea } from '../../components/ui'

/* A bare "example.com" becomes https:// (the DB requires it, 0092); empty → null. */
function normalizeLink(raw) {
  const v = raw.trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}
function prettyLink(url) {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

/* The community calendar (0092). Any member posts an event; the creator or an
   admin removes it; anyone can add one to their own in-app calendar. The Google
   push is a separate manual step, added next. */
export default function CommunityEventsScreen() {
  const { t } = useT('community')
  const navigate = useNavigate()
  const { profile, hasProfile, loading: profileLoading } = useCommunityProfile()
  const gateOpen = !profileLoading && hasProfile
  const { user } = useAuth()
  const isAdmin = isAdminUser(user)
  const { events, addedIds, googleConnected, loading, error, create, remove, addToCalendar, removeFromCalendar, importToGoogle } =
    useCommunityEvents({ enabled: gateOpen })
  const members = useCommunityMembers({ enabled: gateOpen })
  const [gImport, setGImport] = useState({ busy: false, msg: '' })

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [link, setLink] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  /* Same gate as the room: no profile → the setup screen (a profile is required
     to take part). Wait for the check so an existing member isn't bounced. */
  if (!profileLoading && !hasProfile) return <Navigate to={ROUTES.COMMUNITY_PROFILE} replace />

  const memberMap = new Map((members ?? []).map((m) => [m.user_id, m]))
  const creatorName = (uid) => {
    if (profile && uid === profile.user_id) return profile.display_name
    return memberMap.get(uid)?.display_name || t('chat.unknownAuthor')
  }
  const isMine = (ev) => !!(profile && ev.created_by === profile.user_id)

  const resetForm = () => {
    setTitle(''); setStartsAt(''); setEndsAt(''); setLocation(''); setLink(''); setDescription('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !startsAt) { setErr(t('events.errors.required')); return }
    setBusy(true)
    setErr('')
    try {
      await create({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        link: normalizeLink(link),
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      })
      resetForm()
      setShowForm(false)
    } catch (e2) {
      setErr(t('events.errors.createFailed', { error: e2?.message || '' }))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    const ev = pendingDelete
    setPendingDelete(null)
    if (ev) await remove(ev.id)
  }

  const addedEvents = events.filter((e) => addedIds.has(e.id))
  const runImport = async () => {
    setGImport({ busy: true, msg: '' })
    try {
      const r = await importToGoogle(addedEvents)
      const n = (r?.added ?? 0) + (r?.existing ?? 0)
      setGImport({ busy: false, msg: r?.ok ? t('events.google.done', { count: n }) : t('events.google.failed') })
    } catch {
      setGImport({ busy: false, msg: t('events.google.failed') })
    }
  }

  return (
    <Box className="screen cmt-events-screen">
      <Box as="header" className="screen-head cmt-head">
        <Box>
          <Txt as="p" className="t-screen">
            <CalendarDays size={20} strokeWidth={1.6} aria-hidden="true" /> {t('events.title')}
          </Txt>
          <Txt as="p" className="lbl-sm">{t('events.subtitle')}</Txt>
        </Box>
        <Btn type="button" className="cmt-head-back" onClick={() => navigate(ROUTES.COMMUNITY_CHAT)}>
          <ArrowLeft size={16} strokeWidth={1.7} aria-hidden="true" /> {t('events.toChat')}
        </Btn>
      </Box>

      <Box className="cmt-events-body">
        {/* Create — any member. A toggle keeps the list uncluttered. */}
        {!showForm && (
          <Btn type="button" className="cme-new" onClick={() => { setErr(''); setShowForm(true) }}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> {t('events.newEvent')}
          </Btn>
        )}
        {showForm && (
          <Box as="form" className="cmt-card cme-form" onSubmit={submit}>
            <Box className="m-field">
              <Box as="label" className="m-label" htmlFor="cme-title">{t('events.form.title')}</Box>
              <Input id="cme-title" className={`m-input${err && !title.trim() ? ' err' : ''}`} value={title}
                onChange={(e) => { setTitle(e.target.value); if (err) setErr('') }}
                placeholder={t('events.form.titlePlaceholder')} autoComplete="off" maxLength={140} />
            </Box>
            <Box className="cme-form-row">
              <Box className="m-field">
                <Box as="label" className="m-label" htmlFor="cme-start">{t('events.form.starts')}</Box>
                <Input id="cme-start" type="datetime-local" className={`m-input${err && !startsAt ? ' err' : ''}`}
                  value={startsAt} onChange={(e) => { setStartsAt(e.target.value); if (err) setErr('') }} />
              </Box>
              <Box className="m-field">
                <Box as="label" className="m-label" htmlFor="cme-end">{t('events.form.ends')}</Box>
                <Input id="cme-end" type="datetime-local" className="m-input"
                  value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt || undefined} />
              </Box>
            </Box>
            <Box className="cme-form-row">
              <Box className="m-field">
                <Box as="label" className="m-label" htmlFor="cme-loc">{t('events.form.location')}</Box>
                <Input id="cme-loc" className="m-input" value={location}
                  onChange={(e) => setLocation(e.target.value)} placeholder={t('events.form.locationPlaceholder')}
                  autoComplete="off" maxLength={200} />
              </Box>
              <Box className="m-field">
                <Box as="label" className="m-label" htmlFor="cme-link">{t('events.form.link')}</Box>
                <Input id="cme-link" className="m-input" value={link} onChange={(e) => setLink(e.target.value)}
                  placeholder="https://example.com" autoComplete="off" inputMode="url" maxLength={300} />
              </Box>
            </Box>
            <Box className="m-field">
              <Box as="label" className="m-label" htmlFor="cme-desc">{t('events.form.description')}</Box>
              <Textarea id="cme-desc" className="m-input cme-desc-input" value={description}
                onChange={(e) => setDescription(e.target.value)} placeholder={t('events.form.descriptionPlaceholder')}
                rows={3} maxLength={1000} />
            </Box>
            {err && <Txt as="p" className="m-error">{err}</Txt>}
            <Box className="cme-form-actions">
              <Btn type="button" className="cme-form-cancel" onClick={() => { setShowForm(false); resetForm(); setErr('') }}>
                {t('events.form.cancel')}
              </Btn>
              <Btn type="submit" className="m-btn-save" disabled={busy}>
                {busy ? t('events.form.creating') : t('events.form.create')}
              </Btn>
            </Box>
          </Box>
        )}

        {/* Manual, opt-in push of the member's added events to Google (only
            when connected). Google writes aren't verifiable in preview. */}
        {googleConnected && !showForm && (
          <Box className="cme-gimport">
            <Btn type="button" className="cme-gimport-btn" onClick={runImport} disabled={gImport.busy || addedEvents.length === 0}>
              <Upload size={15} strokeWidth={1.7} aria-hidden="true" />
              {gImport.busy ? t('events.google.importing') : t('events.google.import', { count: addedEvents.length })}
            </Btn>
            {gImport.msg && <Txt as="span" className="cme-gimport-msg">{gImport.msg}</Txt>}
          </Box>
        )}

        {loading && <Txt as="p" className="m-hint cmt-feed-note">{t('events.loading')}</Txt>}
        {!loading && error && <Txt as="p" className="m-error cmt-feed-note" role="alert">{t('events.errors.loadFailed')}</Txt>}
        {!loading && !error && events.length === 0 && !showForm && (
          <Box className="cmt-card cmt-empty">
            <Txt className="cmt-empty-mark"><CalendarDays size={26} strokeWidth={1.5} aria-hidden="true" /></Txt>
            <Txt as="p" className="cmt-empty-title">{t('events.empty.title')}</Txt>
            <Txt as="p" className="m-hint">{t('events.empty.body')}</Txt>
          </Box>
        )}

        <Box className="cme-list">
          {events.map((ev) => {
            const added = addedIds.has(ev.id)
            return (
              <Box key={ev.id} className="cmt-card cme-card">
                <Box className="cme-when">
                  <Txt className="cme-when-day">{fmtRelativeDay(ev.starts_at)}</Txt>
                  <Txt className="cme-when-time">
                    {fmtTime(ev.starts_at)}{ev.ends_at ? ` – ${fmtTime(ev.ends_at)}` : ''}
                  </Txt>
                </Box>
                <Box className="cme-main">
                  <Txt as="p" className="cme-title-txt">{ev.title}</Txt>
                  {ev.description && <Txt as="p" className="cme-desc-txt">{ev.description}</Txt>}
                  {(ev.location || ev.link) && (
                    <Box className="cme-meta">
                      {ev.location && (
                        <Txt as="span" className="cme-meta-item">
                          <MapPin size={13} strokeWidth={1.7} aria-hidden="true" /> {ev.location}
                        </Txt>
                      )}
                      {ev.link && (
                        <a className="cme-meta-link" href={ev.link} target="_blank" rel="noopener noreferrer nofollow ugc">
                          <Link2 size={13} strokeWidth={1.7} aria-hidden="true" /> {prettyLink(ev.link)}
                        </a>
                      )}
                    </Box>
                  )}
                  <Txt as="p" className="cme-creator">{t('events.by', { name: creatorName(ev.created_by) })}</Txt>
                </Box>
                <Box className="cme-actions">
                  {added ? (
                    <Btn type="button" className="cme-add on" onClick={() => removeFromCalendar(ev.id)}>
                      <Check size={14} strokeWidth={2} aria-hidden="true" /> {t('events.added')}
                    </Btn>
                  ) : (
                    <Btn type="button" className="cme-add" onClick={() => addToCalendar(ev)}>
                      <CalendarPlus size={14} strokeWidth={1.7} aria-hidden="true" /> {t('events.addToCalendar')}
                    </Btn>
                  )}
                  {(isMine(ev) || isAdmin) && (
                    <Btn type="button" className="cme-del" onClick={() => setPendingDelete(ev)} aria-label={t('events.delete.aria')}>
                      <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                    </Btn>
                  )}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('events.delete.title')}
        message={t('events.delete.message')}
        confirmLabel={t('events.delete.confirm')}
        danger
        onConfirm={confirmDelete}
      />
    </Box>
  )
}
