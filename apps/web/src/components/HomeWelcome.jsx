import { useNavigate } from 'react-router-dom'
import { Upload, Sparkles, Repeat, Check, ChevronLeft, X } from 'lucide-react'
import { useSetupTasks } from '../hooks/useSetupTasks'
import { useT } from '../i18n/useT'
import './HomeWelcome.css'
import { Box, Txt, Btn } from './ui'

/* Icon per task key — kept beside the markup rather than in the hook, so
   the hook stays data and this file stays presentation. */
const ICONS = { import: Upload, questions: Sparkles, recurring: Repeat }

/* ════════════════════════════════════════════════════════════════
   HomeWelcome — finish setting up, from the home screen.
   ════════════════════════════════════════════════════════════════
   Onboarding used to ask for all of this before the user had seen a
   single screen: upload your spreadsheet and map its columns, choose
   daily questions, enter your fixed expenses. Nine steps of setup for
   an app nobody had looked at yet.

   Those three moved here. Each one opens the real screen it belongs to,
   so it is learned in the place it lives rather than in a copy of itself
   inside a wizard — and each ticks itself off from the data, so the card
   empties as the user works and then goes away. Dismissible at any point:
   none of it is required.
   ════════════════════════════════════════════════════════════════ */

export default function HomeWelcome({ onDismiss }) {
  const navigate = useNavigate()
  const { t } = useT('home')
  const tasks = useSetupTasks()

  return (
    <Box as="section" className="home-welcome anim">
      {onDismiss && (
        <Btn
          type="button"
          className="home-welcome-close"
          onClick={onDismiss}
          aria-label={t('welcome.close')}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </Btn>
      )}
      <Txt as="p" className="home-welcome-eyebrow">{t('welcome.eyebrow')}</Txt>
      <Txt as="h2" className="home-welcome-title">{t('welcome.title')}</Txt>
      <Txt as="p" className="home-welcome-sub">{t('welcome.sub')}</Txt>

      <Box as="ul" className="home-welcome-tasks">
        {tasks.map(({ key, done, to, state }) => {
          const Icon = ICONS[key]
          return (
          <Box as="li" key={key}>
            <Btn
              type="button"
              className={`home-welcome-task${done ? ' done' : ''}`}
              onClick={() => navigate(to, state ? { state } : undefined)}
            >
              <Txt className="home-welcome-task-mark" aria-hidden="true">
                {done ? <Check size={14} strokeWidth={2.6} /> : <Icon size={17} strokeWidth={1.6} />}
              </Txt>
              <Box className="home-welcome-task-body">
                <Txt as="p" className="home-welcome-task-title">{t(`welcome.tasks.${key}.title`)}</Txt>
                <Txt as="p" className="home-welcome-task-sub">
                  {done ? t('welcome.taskDone') : t(`welcome.tasks.${key}.sub`)}
                </Txt>
              </Box>
              <ChevronLeft size={16} strokeWidth={1.8} className="home-welcome-task-arrow" aria-hidden="true" />
            </Btn>
          </Box>
          )
        })}
      </Box>
    </Box>
  )
}
