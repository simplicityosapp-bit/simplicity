import TransactionCard from './TransactionCard'

/* Pending lives in its own section now (see PendingSection). The main list
   shows confirmed + (optionally) skipped. */
const GROUPS = [
  { key: 'confirmed', label: 'אושרו' },
  { key: 'skipped', label: 'דולגו' },
]

export default function TransactionList({ transactions, clients, projects, categories, showSkipped = true, onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const visible = transactions.filter((t) => t.status !== 'pending' && (showSkipped || t.status !== 'skipped'))
  if (!visible.length) {
    return (
      <div className="empty">
        <p className="empty-text">אין תנועות לחודש זה.</p>
      </div>
    )
  }
  return (
    <div className="f-tx-groups">
      {GROUPS.map((g) => {
        if (g.key === 'skipped' && !showSkipped) return null
        const items = visible.filter((t) => t.status === g.key)
        if (!items.length) return null
        return (
          <div key={g.key} className="f-tx-group">
            <p className="f-section-lbl">
              {g.label} <span className="f-group-count">{items.length}</span>
            </p>
            {items.map((t) => (
              <TransactionCard
                key={t.id}
                tx={t}
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
