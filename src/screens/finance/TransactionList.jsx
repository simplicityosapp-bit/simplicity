import TransactionCard from './TransactionCard'

/* Pending first (needs action), then confirmed, then skipped. */
const GROUPS = [
  { key: 'pending', label: 'ממתינות לאישור' },
  { key: 'confirmed', label: 'אושרו' },
  { key: 'skipped', label: 'דולגו' },
]

export default function TransactionList({ transactions, clients, projects, categories, onApprove, onSkip, onUnskip, onEdit }) {
  if (!transactions.length) {
    return (
      <div className="empty">
        <p className="empty-text">אין תנועות לחודש זה.</p>
      </div>
    )
  }
  return (
    <div className="f-tx-groups">
      {GROUPS.map((g) => {
        const items = transactions.filter((t) => t.status === g.key)
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
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
