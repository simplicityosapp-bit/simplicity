import TransactionCard from './TransactionCard'
import { useT } from '../../i18n/useT'

/* Pending lives in its own section now (see PendingSection). The main list
   shows confirmed + (optionally) skipped. */
const GROUP_KEYS = ['confirmed', 'skipped']

export default function TransactionList({ transactions, clients, projects, categories, showSkipped = true, onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const { t } = useT('finance')
  const visible = transactions.filter((tx) => tx.status !== 'pending' && (showSkipped || tx.status !== 'skipped'))
  if (!visible.length) {
    return (
      <div className="empty">
        <p className="empty-text">{t('list.empty')}</p>
      </div>
    )
  }
  return (
    <div className="f-tx-groups">
      {GROUP_KEYS.map((key) => {
        if (key === 'skipped' && !showSkipped) return null
        const items = visible.filter((tx) => tx.status === key)
        if (!items.length) return null
        return (
          <div key={key} className="f-tx-group">
            <p className="f-section-lbl">
              {t(`list.${key}`)} <span className="f-group-count">{items.length}</span>
            </p>
            {items.map((tx) => (
              <TransactionCard
                key={tx.id}
                tx={tx}
                clients={clients}
                projects={projects}
                categories={categories}
                onApprove={onApprove}
                onSkip={onSkip}
                onUnskip={onUnskip}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
