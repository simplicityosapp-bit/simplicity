import {
  Trash2, User, FolderOpen, Users, CheckSquare, UserPlus, Tag,
  Banknote, Repeat, CalendarDays, Bell, Target, LayoutGrid, BarChart3,
  HelpCircle, MessageCircle,
} from 'lucide-react'
import { useTrash, TRASH_ENTITY_TYPES } from '../../hooks/useTrash'
import { useAddress } from '../../hooks/useAddress'
import TrashItem from './TrashItem'
import './TrashScreen.css'

const ENTITY_META = {
  clients:        { label: 'לקוחות',          icon: User },
  projects:       { label: 'פרויקטים',        icon: FolderOpen },
  groups:         { label: 'קבוצות',          icon: Users },
  tasks:          { label: 'משימות',          icon: CheckSquare },
  leads:          { label: 'לידים',           icon: UserPlus },
  leadSources:    { label: 'מקורות לידים',    icon: Tag },
  leadStatuses:   { label: 'תתי-סטטוס לידים', icon: Tag },
  transactions:   { label: 'תנועות',          icon: Banknote },
  categories:     { label: 'קטגוריות הוצאות', icon: Tag },
  recurring:      { label: 'תבניות חוזרות',   icon: Repeat },
  sessions:       { label: 'פגישות',          icon: CalendarDays },
  reminders:      { label: 'תזכורות',         icon: Bell },
  goals:          { label: 'יעדים',           icon: Target },
  goalCategories: { label: 'מדדי יעדים',      icon: LayoutGrid },
  goalEntries:    { label: 'הזנות יעדים',     icon: BarChart3 },
  userQuestions:  { label: 'שאלות יומיות',    icon: HelpCircle },
  dailyAnswers:   { label: 'תשובות יומיות',   icon: MessageCircle },
}

export default function TrashScreen() {
  const { addr } = useAddress()
  const { trash, totalCount, loading, error, restore } = useTrash()

  return (
    <div className="screen trash-screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{totalCount} פריטים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">נשמרים 30 יום</p>
            </div>
            <p className="lbl-sm">כל מחיקה כאן עוד הפיכה.</p>
          </div>
          <p className="t-screen">סל מיחזור</p>
        </header>
      </div>

      {error && <p className="trash-error">שגיאה: {error}</p>}

      {loading ? (
        <div className="empty"><p className="empty-text">טוען…</p></div>
      ) : totalCount === 0 ? (
        <div className="empty">
          <span className="empty-icon"><Trash2 size={36} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="empty-text">סל המיחזור ריק 🌱<br />כל מה ש{addr({ male: 'תמחק', female: 'תמחקי', neutral: 'תמחק/י' })} יחכה כאן 30 יום.</p>
        </div>
      ) : (
        <section className="trash-groups">
          {TRASH_ENTITY_TYPES.map((type) => {
            const items = trash[type]
            if (!items || items.length === 0) return null
            const meta = ENTITY_META[type]
            const Icon = meta.icon
            return (
              <div className="trash-group" key={type}>
                <div className="trash-group-head">
                  <span className="trash-group-name">
                    <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                    {meta.label}
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
