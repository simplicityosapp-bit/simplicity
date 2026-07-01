import {
  User, Wallet, Sparkles, Users, Repeat, Folder,
  ClipboardList, Bell, Target, Heart, ChevronLeft, Pencil, CheckCircle2,
} from 'lucide-react'
import Modal from './Modal'
import { ROUTES } from '../lib/routes'
import { useT } from '../i18n/useT'
import './ProfileHealthModal.css'
import { Box, Txt, Btn } from '../components/ui'

/* gap.icon key → Lucide component. Keys come from lib/profileHealth. */
const ICONS = {
  user: User, wallet: Wallet, sparkles: Sparkles, users: Users,
  repeat: Repeat, folder: Folder, tasks: ClipboardList, bell: Bell,
  target: Target, leads: Heart,
}

/* One encouraging line per tier — frames gaps as opportunity, not failure.
   `t` is the gender-aware translator (the two middle tiers address the
   user directly, so their he copy inflects for gender via _male/_female). */
function leadLine(score, tier, t) {
  if (score >= 100) return t('profileHealth.lead.full')
  if (tier.key === 'high') return t('profileHealth.lead.high')
  if (tier.key === 'mid') return t('profileHealth.lead.mid')
  return t('profileHealth.lead.low')
}

/* ════════════════════════════════════════════════════════════════
   ProfileHealthModal — bottom-sheet breakdown of the profile-health
   score. A progress ring up top, then one actionable row per gap, and
   an "edit profile" shortcut at the bottom. onNavigate(route, state)
   is wired by the caller to navigate AND close the menu drawer.
   ════════════════════════════════════════════════════════════════ */
export default function ProfileHealthModal({ open, onClose, health, loading, onNavigate }) {
  const { t } = useT('modalsSystem')
  const ready = !loading && !!health
  const score = health?.score ?? 0
  const tier = health?.tier ?? { key: 'low', color: 'var(--clay)' }
  const gaps = health?.gaps ?? []

  /* Ring geometry — a single stroked circle, dash length = progress.
     While the data is still loading the score is computed from empty
     arrays (artificially low), so hold the ring + number until ready. */
  const R = 46
  const C = 2 * Math.PI * R
  const dash = C * ((ready ? score : 0) / 100)

  return (
    <Modal open={open} onClose={onClose} title={t('profileHealth.title')}>
      <Box className="ph-body">
        <Box className="ph-ring-wrap">
          <svg className="ph-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="ph-ring-track" cx="60" cy="60" r={R} />
            <circle
              className="ph-ring-fill"
              cx="60" cy="60" r={R}
              style={{ color: tier.color }}
              strokeDasharray={`${dash} ${C}`}
              strokeLinecap="round"
            />
          </svg>
          <Box className="ph-ring-center">
            <Txt className="ph-score" style={{ color: ready ? tier.color : 'var(--stone)' }}>
              {ready ? score : '··'}
            </Txt>
            <Txt className="ph-score-pct">%</Txt>
          </Box>
        </Box>

        <Txt as="p" className="ph-lead">{ready ? leadLine(score, tier, t) : t('profileHealth.calculating')}</Txt>

        {!ready ? (
          <Txt as="p" className="ph-loading">{t('profileHealth.loadingData')}</Txt>
        ) : gaps.length === 0 ? (
          <Box className="ph-done">
            <CheckCircle2 size={22} strokeWidth={1.6} aria-hidden="true" />
            <Txt>{t('profileHealth.noGaps')}</Txt>
          </Box>
        ) : (
          <Box as="ul" className="ph-gaps">
            {gaps.map((g) => {
              const Icon = ICONS[g.icon] || Sparkles
              return (
                <Box as="li" key={g.id} className={`ph-gap ph-gap-${g.group}`}>
                  <Txt className="ph-gap-icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></Txt>
                  <Txt className="ph-gap-label">{g.label}</Txt>
                  <Btn
                    type="button"
                    className="ph-gap-action"
                    onClick={() => onNavigate(g.action.route, g.action.state)}
                  >
                    {g.action.label}
                    <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
                  </Btn>
                </Box>
              )
            })}
          </Box>
        )}

        <Btn
          type="button"
          className="ph-edit"
          onClick={() => onNavigate(ROUTES.SETTINGS, { openSection: 'profile' })}
        >
          <Pencil size={16} strokeWidth={1.6} aria-hidden="true" />
          {t('profileHealth.editProfile')}
        </Btn>
      </Box>
    </Modal>
  )
}
