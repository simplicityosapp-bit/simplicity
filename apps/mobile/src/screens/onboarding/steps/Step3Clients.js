import { useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { X, Phone, Plus } from 'lucide-react-native'
import { colors, type } from '../../../theme/theme'
import { themed } from '../../../theme/themed'
import i18n from '../../../lib/i18n'
import { useClientsList } from '../../../hooks/useClientsList'
import { useStepCTA } from '../useStepCTA'

/* ════════════════════════════════════════════════════════════════
   Step 3 — the first client.
   ════════════════════════════════════════════════════════════════
   Native port of apps/web Step3Clients.

   This step used to mount the whole add-client form: name, phone, four
   status pills, an accordion of ten more fields, a project select, a
   group select, and a live card computing a balance out of sessions and
   price. All of it optional, none of it explained, on the third screen a
   new user ever sees.

   Name and phone. The project is whatever step 2 just settled on, so
   there is nothing to choose. Everything else about a client — status,
   package, price, address, birthday — lives on their own card, at the
   moment there is a reason to fill it in.
   ════════════════════════════════════════════════════════════════ */

const initials = (name) =>
  (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function Step3Clients({ ob, setCTA }) {
  const t = (k, vars) => i18n.t('onboardingSteps:' + k, vars)
  const { clients, addClient, deleteClient } = useClientsList()

  /* The project step 2 settled on — one it created, or an existing one the
     user chose to continue with. */
  const projectId = ob.state.answers?.projects?.project_id
    || ob.state.answers?.projects?.created_ids?.[0]
    || null
  const initial = ob.state.answers?.clients || {}

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [createdIds, setCreatedIds] = useState(initial.created_ids || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const rtl = (i18n.language || '').startsWith('he')
  const align = { textAlign: rtl ? 'right' : 'left' }

  const added = createdIds.map((id) => (clients || []).find((c) => c.id === id)).filter(Boolean)
  const composerHasName = name.trim().length > 0
  const canAdvance = composerHasName || added.length > 0
  const hint = canAdvance ? null : t('step3.hintAddOne')

  /* Only the two fields we ask for carry a value; the rest of the row is
     the same shape a client insert always writes, left at its defaults. */
  const commit = async () => {
    const row = await addClient({
      name: name.trim(),
      status: 'active',
      status_meta: 'active',
      status_id: null,
      project_id: projectId,
      group_id: null,
      sessions: 0,
      price_per_session: 0,
      total_override: null,
      has_custom_price: false,
      recurring_day: null,
      recurring_time: null,
      left_mid_process: false,
      phone: phone.trim() || null,
      email: null,
      address: null,
      birth_date: null,
      notes: null,
      notes_updated_at: null,
    })
    const next = [...createdIds, row.id]
    setCreatedIds(next)
    await ob.setAnswers('clients', { created_ids: next })
    return next
  }

  const onAdd = async () => {
    if (!composerHasName || busy) return
    setBusy(true); setErr('')
    try { await commit(); setName(''); setPhone('') }
    catch (e) { setErr(t('step3.errSaveFail', { error: e?.message || t('step3.tryAgain') })) }
    finally { setBusy(false) }
  }

  const onRemove = async (id) => {
    await deleteClient(id)
    const next = createdIds.filter((x) => x !== id)
    setCreatedIds(next)
    await ob.setAnswers('clients', { created_ids: next })
  }

  /* A name still sitting in the composer is a client the user meant to
     add, not one they abandoned — so advancing commits it rather than
     dropping it on the floor. */
  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (composerHasName) await commit()
      await ob.advance()
    } catch (e) {
      setErr(t('step3.errSaveFail', { error: e?.message || t('step3.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  return (
    <View style={styles.root}>
      <Text style={[styles.intro, align]}>{t('step3.intro')}</Text>
      <Text style={[styles.introSub, align]}>{t('step3.introSub')}</Text>

      <View style={styles.field}>
        <Text style={[styles.label, align]}>{t('step3.nameLabel')}</Text>
        <TextInput
          style={[styles.input, align]}
          value={name}
          onChangeText={setName}
          placeholder={t('step3.namePlaceholder')}
          placeholderTextColor={colors.textFaint}
          returnKeyType="next"
          /* The return key here means "that's one", not "I am done with
             this step" — adding is what the field in front of them is
             for. On an empty composer it does nothing and the footer
             button stays the way onward. */
          onSubmitEditing={onAdd}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, align]}>{t('step3.phoneLabel')}</Text>
        <TextInput
          style={[styles.input, align]}
          value={phone}
          onChangeText={setPhone}
          placeholder="050-0000000"
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
      </View>

      {composerHasName ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAdd}
          disabled={busy}
          style={({ pressed }) => [styles.addAnother, (pressed || busy) && styles.pressed]}
        >
          <Plus size={15} strokeWidth={2} color={colors.brand} />
          <Text style={styles.addAnotherLabel}>{t('step3.addAnother')}</Text>
        </Pressable>
      ) : null}

      {added.length > 0 ? (
        <View style={styles.field}>
          <Text style={[styles.label, align]}>{t('step3.addedHeading', { count: added.length })}</Text>
          <View style={styles.list}>
            {added.map((c) => (
              <View key={c.id} style={[styles.row, rtl && styles.rowRtl]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(c.name) || '–'}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowName, align]} numberOfLines={1}>{c.name}</Text>
                  {c.phone ? (
                    <View style={[styles.metaRow, rtl && styles.rowRtl]}>
                      <Phone size={11} strokeWidth={1.8} color={colors.textFaint} />
                      <Text style={styles.rowMeta}>{c.phone}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('step3.removeAria', { name: c.name })}
                  onPress={() => onRemove(c.id)}
                  hitSlop={10}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                >
                  <X size={13} strokeWidth={2} color={colors.textSub} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {err ? <Text style={[styles.err, align]}>{err}</Text> : null}
    </View>
  )
}

const styles = themed((c, t) => ({
  root: { gap: 14 },
  rowRtl: { flexDirection: 'row-reverse' },
  intro: { ...t.heading, color: c.text },
  introSub: { ...t.caption, color: c.textSub },
  field: { gap: 7 },
  label: { ...t.caption, color: c.textSub },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.card,
  },
  addAnother: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.brand,
    backgroundColor: c.brandSoft,
  },
  addAnotherLabel: { ...t.body, color: c.brand },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  avatarText: { fontSize: 12, fontWeight: '600', color: c.brand },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...t.body, color: c.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMeta: { ...t.micro, color: c.textFaint },
  remove: { padding: 4 },
  pressed: { opacity: 0.7 },
  err: { ...t.caption, color: c.danger },
}))
