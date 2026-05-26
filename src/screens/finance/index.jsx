import { useMemo, useState } from 'react'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import MonthSummary from './MonthSummary'
import TransactionList from './TransactionList'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EditTransactionModal from '../../modals/EditTransactionModal'
import './FinanceScreen.css'

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

export default function FinanceScreen() {
  const { transactions, loading, addTransaction, editTransaction, setStatus } = useTransactions()
  const { clients } = useClients()
  const { projects } = useProjects()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [showAdd, setShowAdd] = useState(false)
  const [editTx, setEditTx] = useState(null)

  const monthTxs = useMemo(
    () =>
      transactions.filter((t) => {
        if (t.deleted_at) return false
        const d = new Date(t.date)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }),
    [transactions, month],
  )

  const summary = useMemo(() => {
    const conf = monthTxs.filter((t) => t.status === 'confirmed')
    const income = conf.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expenses = conf.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expenses, net: income - expenses }
  }, [monthTxs])

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{monthTxs.length} תנועות</p>
              <span className="lbl dot">·</span>
              <p className="lbl">תמונת מצב</p>
            </div>
            <p className="lbl-sm">הפעולות שלך יוצרות תוצאות טובות.</p>
          </div>
          <p className="t-screen">כסף</p>
        </header>
        <button className="cta-add" type="button" aria-label="הוסף תנועה" onClick={() => setShowAdd(true)}>הוסף תנועה +</button>
      </div>

      <MonthSummary
        month={month}
        onPrev={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
        onNext={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        income={summary.income}
        expenses={summary.expenses}
        net={summary.net}
      />

      <section className="f-list">
        {loading ? (
          <div className="empty"><p className="empty-text">טוען תנועות…</p></div>
        ) : (
          <TransactionList
            transactions={monthTxs}
            clients={clients}
            projects={projects}
            onApprove={(id) => setStatus(id, 'confirmed')}
            onSkip={(id) => setStatus(id, 'skipped')}
            onUnskip={(id) => setStatus(id, 'pending')}
            onEdit={setEditTx}
          />
        )}
      </section>

      <AddTransactionModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        clients={clients}
        projects={projects}
        onSave={async (tx) => {
          const row = await addTransaction(tx)
          setMonth(startOfMonth(new Date(row.date)))
        }}
      />
      <EditTransactionModal
        key={editTx?.id}
        open={!!editTx}
        onClose={() => setEditTx(null)}
        tx={editTx}
        clients={clients}
        projects={projects}
        onSave={editTransaction}
      />
    </div>
  )
}
