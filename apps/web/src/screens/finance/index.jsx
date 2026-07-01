import { useMemo, useState } from 'react'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useRecurring } from '../../hooks/useRecurring'
import { useRecurringGeneration } from '../../hooks/useRecurringGeneration'
import { useCategories } from '../../hooks/useCategories'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { exportTransactionsCSV } from '../../lib/export'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import MonthSummary from './MonthSummary'
import FinanceChart from './FinanceChart'
import PendingSection from './PendingSection'
import InvoiceImports from './InvoiceImports'
import TransactionList from './TransactionList'
import RecurringSection from './RecurringSection'
import CategoriesSection from './CategoriesSection'
import IncomeByProject from './IncomeByProject'
import ExpensesByCategory from './ExpensesByCategory'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EditTransactionModal from '../../modals/EditTransactionModal'
import RecurringModal from '../../modals/RecurringModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import { useT } from '../../i18n/useT'
import './FinanceScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

export default function FinanceScreen() {
  const { t } = useT('finance')
  const { transactions, loading, error, addTransaction, editTransaction, setStatus, removeTransaction, refetch } = useTransactions()
  const { clients, addClient } = useClients()
  const { projects } = useProjects()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const { templates, addRecurring, updateRecurring, removeRecurring } = useRecurring()
  const { categories, addCategory, removeCategory } = useCategories()
  const { meetings: scheduledMeetings, loading: scheduledMeetingsLoading } = useScheduledMeetings()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const showSkipped = prefs?.financeShowSkipped !== false
  const setShowSkipped = (v) => updatePrefs?.({ financeShowSkipped: v })
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [showAdd, setShowAdd] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [showAddRec, setShowAddRec] = useState(false)
  const [editRec, setEditRec] = useState(null)
  const [pendingDeleteRec, setPendingDeleteRec] = useState(null)

  /* Generate pending transactions for any active template still
     missing rows for past due-dates. Idempotent — runs whenever
     templates or transactions change and exits immediately when
     nothing's owed. */
  useRecurringGeneration({
    templates,
    transactions,
    addTransaction,
    scheduledMeetings,
    transactionsLoading: loading,
    scheduledMeetingsLoading,
  })

  const monthTxs = useMemo(
    () =>
      transactions.filter((t) => {
        if (t.deleted_at) return false
        const d = new Date(t.date)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }),
    [transactions, month],
  )

  /* Pending lives in its own attention section above the main list.
     Sorted ascending by date so the oldest "you owe me a decision" rows
     are at the top — matches the prototype's f-pending-section. */
  const pendingTxs = useMemo(
    () => monthTxs.filter((t) => t.status === 'pending').sort((a, b) => new Date(a.date) - new Date(b.date)),
    [monthTxs],
  )
  const skippedCount = useMemo(() => monthTxs.filter((t) => t.status === 'skipped').length, [monthTxs])

  const prevMonthTxs = useMemo(() => {
    const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1)
    return transactions.filter((t) => {
      if (t.deleted_at) return false
      const d = new Date(t.date)
      return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()
    })
  }, [transactions, month])

  const sumConfirmed = (rows) => {
    // Credited (cancelled by a credit note) transactions drop out of the totals.
    const conf = rows.filter((t) => t.status === 'confirmed' && !t.invoice_credited_at)
    const income = conf.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expenses = conf.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expenses, net: income - expenses }
  }

  const summary = useMemo(() => sumConfirmed(monthTxs), [monthTxs])
  const prevSummary = useMemo(() => sumConfirmed(prevMonthTxs), [prevMonthTxs])

  return (
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Box>
            <Box className="screen-head-meta">
              <Txt as="p" className="lbl">{t('countLabel', { count: monthTxs.length })}</Txt>
              <Txt className="lbl dot">·</Txt>
              <Txt as="p" className="lbl">{t('snapshot')}</Txt>
            </Box>
            <Txt as="p" className="lbl-sm">{t('tagline')}</Txt>
          </Box>
          <Txt as="p" className="t-screen">{t('title')}</Txt>
        </Box>
        <Coachmark id="add-transaction" radius="50%">
          <Btn className="cta-add" type="button" aria-label={t('newTxAria')} onClick={() => setShowAdd(true)}>{t('newTx')}</Btn>
        </Coachmark>
      </Box>

      <Box className="f-export-row">
        <Btn
          type="button"
          className="f-export-btn"
          onClick={() => exportTransactionsCSV({ transactions: monthTxs, clients, projects, categories, monthDate: month })}
          disabled={monthTxs.length === 0}
          aria-label={t('exportCsvAria')}
        >
          {t('exportCsv')}
        </Btn>
      </Box>

      <MonthSummary
        month={month}
        onPrev={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
        onNext={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        income={summary.income}
        expenses={summary.expenses}
        net={summary.net}
        prevIncome={prevSummary.income}
        prevExpenses={prevSummary.expenses}
        prevNet={prevSummary.net}
      />

      <FinanceChart month={month} />

      <Box className="f-mid">
        <IncomeByProject monthTxs={monthTxs} clients={clients} projects={projects} />
        <ExpensesByCategory monthTxs={monthTxs} categories={categories} />

        <RecurringSection
          templates={templates}
          onAdd={() => setShowAddRec(true)}
          onEdit={setEditRec}
          onDelete={setPendingDeleteRec}
          onToggleActive={(t) => updateRecurring(t.id, { active: !t.active })}
        />

        <CategoriesSection
          categories={categories}
          onAdd={addCategory}
          onDelete={(c) => removeCategory(c.id)}
        />
      </Box>

      <InvoiceImports />

      <PendingSection
        transactions={pendingTxs}
        clients={clients}
        projects={projects}
        categories={categories}
        onApprove={(id) => setStatus(id, 'confirmed')}
        onSkip={(id) => setStatus(id, 'skipped')}
        onEdit={setEditTx}
      />

      <Box as="section" className="f-list">
        {loading ? (
          <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
        ) : error ? (
          <Box className="empty"><Txt as="p" className="empty-text">{t('loadError', { error })}</Txt></Box>
        ) : (
          <>
            {skippedCount > 0 && (
              <Box className="f-skipped-toggle">
                <Btn
                  type="button"
                  className={`f-skipped-btn${showSkipped ? ' on' : ''}`}
                  onClick={() => setShowSkipped(!showSkipped)}
                  aria-pressed={showSkipped}
                >
                  {showSkipped ? t('hideSkipped') : t('showSkipped', { count: skippedCount })}
                </Btn>
              </Box>
            )}
            <TransactionList
              transactions={monthTxs}
              clients={clients}
              projects={projects}
              categories={categories}
              showSkipped={showSkipped}
              onApprove={(id) => setStatus(id, 'confirmed')}
              onSkip={(id) => setStatus(id, 'skipped')}
              onUnskip={(id) => setStatus(id, 'pending')}
              onEdit={setEditTx}
              onDelete={removeTransaction}
            />
          </>
        )}
      </Box>

      <AddTransactionModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        clients={clients}
        projects={projects}
        categories={categories}
        members={members}
        groups={groups}
        onCreateCategory={(name) => addCategory({ name, color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] })}
        onSave={async (tx) => {
          const row = await addTransaction(tx)
          setMonth(startOfMonth(new Date(row.date)))
          return row // let the modal issue a document for the new income when asked
        }}
      />
      <EditTransactionModal
        key={editTx?.id}
        open={!!editTx}
        onClose={() => setEditTx(null)}
        tx={editTx}
        clients={clients}
        projects={projects}
        categories={categories}
        onSave={editTransaction}
        onIssued={refetch}
        onDelete={removeTransaction}
        onSaveAsClient={async (tx) => {
          /* Promote an ad-hoc receipt recipient into a real ACTIVE client, then
             link the transaction to it. status + status_meta are NOT NULL on
             clients (no DB default), and a freshly-saved client should be active
             like one added via the normal form — so both are set explicitly.
             (tax id isn't a client field — name/email/phone only.) */
          const c = await addClient({ name: tx.recipient_name, email: tx.recipient_email || null, phone: tx.recipient_phone || null, status: 'active', status_meta: 'active' })
          if (c?.id) await editTransaction(tx.id, { client_id: c.id })
          refetch()
        }}
      />

      <RecurringModal
        open={showAddRec}
        onClose={() => setShowAddRec(false)}
        onSave={addRecurring}
        clients={clients}
        projects={projects}
        categories={categories}
      />
      <RecurringModal
        key={editRec?.id}
        open={!!editRec}
        onClose={() => setEditRec(null)}
        template={editRec}
        onSave={(patch) => updateRecurring(editRec.id, patch)}
        clients={clients}
        projects={projects}
        categories={categories}
      />
      <ConfirmModal
        open={!!pendingDeleteRec}
        onClose={() => setPendingDeleteRec(null)}
        title={t('deleteRecurring.title')}
        message={pendingDeleteRec ? t('deleteRecurring.message', { name: pendingDeleteRec.desc || (pendingDeleteRec.type === 'income' ? t('deleteRecurring.income') : t('deleteRecurring.expense')) }) : ''}
        confirmLabel={t('deleteRecurring.confirm')}
        danger
        onConfirm={() => { if (pendingDeleteRec) removeRecurring(pendingDeleteRec.id) }}
      />
    </Box>
  )
}
