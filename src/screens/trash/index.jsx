import {
  Trash2, User, FolderOpen, Users, CheckSquare, UserPlus, Tag,
  Banknote, Repeat, CalendarDays, Bell, Target, LayoutGrid, BarChart3,
  HelpCircle, MessageCircle,
} from 'lucide-react'
import { Trans } from 'react-i18next'
import { useTrash, TRASH_ENTITY_TYPES } from '../../hooks/useTrash'
import { useT } from '../../i18n/useT'
import TrashItem from './TrashItem'
import './TrashScreen.css'

const ENTITY_ICONS = {
  clients:        User,
  projects:       FolderOpen,
  groups:         Users,
  tasks:          CheckSquare,
  leads:          UserPlus,
  leadSources:    Tag,
  leadStatuses:   Tag,
  transactions:   Banknote,
  categories:     Tag,
  recurring:      Repeat,
  sessions:       CalendarDays,
  reminders:      Bell,
  goals:          Target,
  goalCategories: LayoutGrid,
  goalEntries:    BarChart3,
  userQuestions:  HelpCircle,
  dailyAnswers:   MessageCircle,
}

export default function TrashScreen() {
  const { t } = useT('trash')
  const { trash, totalCount, loading, error, restore } = useTrash()

  return (
    <div className="screen trash-screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{t('itemCount', { count: totalCount })}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{t('keptDays')}</p>
            </div>
            <p className="lbl-sm">{t('stillReversible')}</p>
          </div>
          <p className="t-screen">{t('title')}</p>
        </header>
      </div>

      {error && <p className="trash-error">{t('error', { error })}</p>}

      {loading ? (
        <div className="empty"><p className="empty-text">{t('loading')}</p></div>
      ) : totalCount === 0 ? (
        <div className="empty">
          <span className="empty-icon"><Trash2 size={36} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="empty-text">
            <Trans t={t} i18nKey="empty.body" values={{ deleteVerb: t('deleteVerb') }} components={[<br key="br" />]} />
          </p>
        </div>
      ) : (
        <section className="trash-groups">
          {TRASH_ENTITY_TYPES.map((type) => {
            const items = trash[type]
            if (!items || items.length === 0) return null
            const Icon = ENTITY_ICONS[type]
            return (
              <div className="trash-group" key={type}>
                <div className="trash-group-head">
                  <span className="trash-group-name">
                    <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                    {t(`entities.${type}`)}
                  </span>
                  <span className="trash-group-count mono">{items.length}</span>
                </div>
                <div className="trash-group-list">
                  {items.map((row) => (
                    <TrashItem
                      key={row.id}
                      entityType={type}
                      row={row}
                      onRestore={() => restore(type, row.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
