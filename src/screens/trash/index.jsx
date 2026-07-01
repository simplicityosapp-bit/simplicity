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
import { Box, Txt } from '../../components/ui'

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
    <Box className="screen trash-screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Box>
            <Box className="screen-head-meta">
              <Txt as="p" className="lbl">{t('itemCount', { count: totalCount })}</Txt>
              <Txt className="lbl dot">·</Txt>
              <Txt as="p" className="lbl">{t('keptDays')}</Txt>
            </Box>
            <Txt as="p" className="lbl-sm">{t('stillReversible')}</Txt>
          </Box>
          <Txt as="p" className="t-screen">{t('title')}</Txt>
        </Box>
      </Box>

      {error && <Txt as="p" className="trash-error">{t('error', { error })}</Txt>}

      {loading ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
      ) : totalCount === 0 ? (
        <Box className="empty">
          <Txt className="empty-icon"><Trash2 size={36} strokeWidth={1.4} aria-hidden="true" /></Txt>
          <Txt as="p" className="empty-text">
            <Trans t={t} i18nKey="empty.body" values={{ deleteVerb: t('deleteVerb') }} components={[<br key="br" />]} />
          </Txt>
        </Box>
      ) : (
        <Box as="section" className="trash-groups">
          {TRASH_ENTITY_TYPES.map((type) => {
            const items = trash[type]
            if (!items || items.length === 0) return null
            const Icon = ENTITY_ICONS[type]
            return (
              <Box className="trash-group" key={type}>
                <Box className="trash-group-head">
                  <Txt className="trash-group-name">
                    <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                    {t(`entities.${type}`)}
                  </Txt>
                  <Txt className="trash-group-count mono">{items.length}</Txt>
                </Box>
                <Box className="trash-group-list">
                  {items.map((row) => (
                    <TrashItem
                      key={row.id}
                      entityType={type}
                      row={row}
                      onRestore={() => restore(type, row.id)}
                    />
                  ))}
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
