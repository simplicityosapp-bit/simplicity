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
import { useInvestments } from '../../hooks/useInvestments'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { exportTransactionsCSV } from '../../lib/export'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import { toLocalDate, fmtMonthYear } from '@simplicity/core'
import MonthSummary from './MonthSummary'
import FinanceChart from './FinanceChart'
import InvestmentRow from './InvestmentRow'
import PendingSection from './PendingSection'
import InvoiceImports from './InvoiceImports'
import TransactionList from './TransactionList'
import RecurringSection from './RecurringSection'
import CategoriesSection from './CategoriesSection'
import IncomeByProject from './IncomeByProject'
import ExpensesByCategory from './ExpensesByCategory'
import TransactionSearch from './TransactionSearch'
import { searchTransactions } from './searchTransactions'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EditTransactionModal from '../../modals/EditTransactionModal'
import RecurringModal from '../../modals/RecurringModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import CollapsibleSection from '../../components/CollapsibleSection'
import { Repeat, Tag, Wallet } from 'lucide-react'
import { useT } from '../../i18n/useT'
import './FinanceScreen.css'
import '../../components/CollapsibleSection.css'
import { Box, Txt, Btn } from '../../components/ui'

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
/* transactions.date is a DATE column ('YYYY-MM-DD'). toLocalDate reads it as a
   calendar day in the local zone — `new Date()` would parse it as UTC midnight
   and the local getters below would then file the 1st of the month under the
   previous month for anyone west of Greenwich. */
const sameMonth = (dateStr, month) => {
  const d = toLocalDate(dateStr)
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
}

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
  /* Deleting the EXPENSE that an investment created has to take the
     investment record with it. The pair is what «השקעתי» wrote; leaving the
     record behind kept the widget claiming money had been set aside with no
     outgoing anywhere to show for it. undoInvestment owns both sides — it
     soft-deletes the transaction silently and registers ONE undo for the
     pair — so the delete is routed through it whenever a record points at the
     row being removed, and left alone for every ordinary transaction. */
  const { investments, undoInvestment } = useInvestments()
  const dropTransaction = (id) => {
    const linked = (investments || []).find((r) => r.transaction_id === id)
    return linked ? undoInvestment(linked.id) : removeTransaction(id)
  }
  const showSkipped = prefs?.financeShowSkipped !== false
  const setShowSkipped = (v) => updatePrefs?.({ financeShowSkipped: v })
  /* Which management sections are expanded. Both start closed — they are
     setup, not daily reading — and the choice persists like showSkipped does,
     so someone who works with recurring templates every day isn't made to
     re-open the section on every visit. */
  const openSections = prefs?.financeSections || {}
  const toggleSection = (key) => (open) => updatePrefs?.({ financeSections: { ...openSections, [key]: open } })
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [showAdd, setShowAdd] = useState(false)
  /* Which side the add-modal opens on. The first-run card offers both, and
     "record an expense" that opens on income would just be a trap. */
  const [addType, setAddType] = useState('income')
  const openAdd = (type = 'income') => { setAddType(type); setShowAdd(true) }
  const [editTx, setEditTx] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState('all')
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
      transactions.filter((t) => !t.deleted_at && sameMonth(t.date, month)),
    [transactions, month],
  )

  /* Pending lives in its own attention section above the main list.
     Sorted ascending by date so the oldest "you owe me a decision" rows
     are at the top — matches the prototype's f-pending-section. */
  const pendingTxs = useMemo(
    () => monthTxs.filter((t) => t.status === 'pending').sort((a, b) => toLocalDate(a.date) - toLocalDate(b.date)),
    [monthTxs],
  )
  const skippedCount = useMemo(() => monthTxs.filter((t) => t.status === 'skipped').length, [monthTxs])

  const prevMonthTxs = useMemo(() => {
    const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1)
    return transactions.filter((t) => !t.deleted_at && sameMonth(t.date, prev))
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

  /* "Never recorded anything" is a different situation from "nothing in the
     month you happened to navigate to", and only the first one deserves to
     take over the screen. The second is just an empty list. */
  const hasAnyTx = useMemo(() => transactions.some((tx) => !tx.deleted_at), [transactions])
  const firstRun = !loading && !error && !hasAnyTx

  /* Typing a query leaves month scope — "what has Dana paid me" can't be
     answered by making you guess the month first. A type chip on its own does
     NOT: that is narrowing what you are already looking at, and jumping to
     all-time because someone tapped "הכנסות" would be startling. */
  const searching = searchQuery.trim().length > 0
  const listRows = useMemo(
    () => searchTransactions(searching ? transactions : monthTxs, {
      query: searchQuery, type: searchType, clients, projects, categories,
    }),
    [searching, transactions, monthTxs, searchQuery, searchType, clients, projects, categories],
  )
  const clearSearch = () => { setSearchQuery(''); setSearchType('all') }

  return (
    <Box className="screen f-screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <Wallet size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('title')}
          </Txt>
        </Box>
        <Coachmark id="add-transaction" radius="50%">
          <Btn className="cta-add" type="button" aria-label={t('newTxAria')} onClick={() => openAdd()}>{t('newTx')}</Btn>
        </Coachmark>
      </Box>

      {firstRun ? (
        <>
        {/* Staged invoices live in their own table, so someone who connected a
            provider before recording anything has a queue waiting while
            hasAnyTx is still false. Leaving it out of this branch would strand
            exactly the migrating user it exists to help — and it doesn't
            contradict "nothing recorded yet", it offers the way out of it.
            (Renders null when the queue is empty, so the usual first-run
            screen is unchanged.) */}
        <InvoiceImports />
        {/* Six empty cards ("no classified income", "no categories yet", a flat
           chart…) read as a broken screen rather than a new one. Until there
           is a single transaction, the screen is one invitation. */}
        <Box className="mg-firstrun">
          <Txt as="p" className="mg-firstrun-title">{t('firstRun.title')}</Txt>
          <Txt as="p" className="mg-firstrun-sub">{t('firstRun.sub')}</Txt>
          <Btn type="button" className="empty-action" onClick={() => openAdd('income')}>
            <Wallet size={18} strokeWidth={1.6} aria-hidden="true" /> {t('firstRun.addIncome')}
          </Btn>
          <Btn type="button" className="mg-firstrun-alt" onClick={() => openAdd('expense')}>
            {t('firstRun.addExpense')}
          </Btn>
        </Box>
        </>
      ) : (
        <>
          {/* Everything above the list measures the SELECTED MONTH. A query
              spans all of history, so leaving those cards on screen would put
              July's net above results from March — the exact mismatch the
              merged overview card exists to prevent. They come back the moment
              the query is cleared. */}
          {!searching && (
          <>
          {/* One card: month nav → the numbers → the line they describe. The
              chart plots net, so it ends on the same figure printed above it. */}
          <Box className="f-overview">
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
          </Box>

          {/* One line, directly under the numbers it is computed from. */}
          <InvestmentRow month={month} />

          {/* Everything that wants a decision, directly under the summary —
              this used to sit below two management blocks, four screens down. */}
          <PendingSection
            transactions={pendingTxs}
            clients={clients}
            projects={projects}
            categories={categories}
            onApprove={(id) => setStatus(id, 'confirmed')}
            onSkip={(id) => setStatus(id, 'skipped')}
            onEdit={setEditTx}
          />

          <InvoiceImports />

          <Box className="f-mid">
            <IncomeByProject monthTxs={monthTxs} clients={clients} projects={projects} />
            <ExpensesByCategory monthTxs={monthTxs} categories={categories} />
          </Box>

          {/* Setup, not daily reading — collapsed to a strip each so they stop
              costing a screenful of scrolling on the way to the list. */}
          <CollapsibleSection
            id="recurring"
            icon={<Repeat size={15} strokeWidth={1.5} />}
            title={t('recurring.title')}
            count={templates.filter((tpl) => !tpl.deleted_at).length}
            open={!!openSections.recurring}
            onToggle={toggleSection('recurring')}
          >
            <RecurringSection
              templates={templates}
              onAdd={() => setShowAddRec(true)}
              onEdit={setEditRec}
              onDelete={setPendingDeleteRec}
              onToggleActive={(t) => updateRecurring(t.id, { active: !t.active })}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="categories"
            icon={<Tag size={15} strokeWidth={1.5} />}
            title={t('categories.title')}
            count={categories.filter((c) => !c.deleted_at).length}
            open={!!openSections.categories}
            onToggle={toggleSection('categories')}
          >
            <CategoriesSection
              categories={categories}
              onAdd={addCategory}
              onDelete={(c) => removeCategory(c.id)}
            />
          </CollapsibleSection>
          </>
          )}

          <TransactionSearch
            query={searchQuery}
            onQuery={setSearchQuery}
            type={searchType}
            onType={setSearchType}
            active={searching}
            resultCount={listRows.length}
            monthLabel={fmtMonthYear(month)}
            onClear={clearSearch}
          />

          <Box as="section" className="f-list">
            {loading ? (
              <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
            ) : error ? (
              <Box className="empty"><Txt as="p" className="empty-text">{t('loadError', { error })}</Txt></Box>
            ) : (
              <>
                {/* The skipped toggle is a month-list affordance; in results
                    mode every match is shown regardless of status. */}
                {!searching && skippedCount > 0 && (
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
                  transactions={listRows}
                  clients={clients}
                  projects={projects}
                  categories={categories}
                  showSkipped={showSkipped}
                  flat={searching}
                  emptyText={searching
                    ? t('search.noResults', { query: searchQuery.trim() })
                    : (searchType !== 'all' ? t('search.noneOfType') : undefined)}
                  onApprove={(id) => setStatus(id, 'confirmed')}
                  onSkip={(id) => setStatus(id, 'skipped')}
                  onUnskip={(id) => setStatus(id, 'pending')}
                  onEdit={setEditTx}
                  onDelete={dropTransaction}
                />
              </>
            )}
          </Box>

          {/* Rare action, and it only ever exported the visible month — which
              the old label never said. Sits after the thing it exports. */}
          {!searching && monthTxs.length > 0 && (
            <Box className="f-export-row">
              <Btn
                type="button"
                className="f-export-btn"
                onClick={() => exportTransactionsCSV({ transactions: monthTxs, clients, projects, categories, monthDate: month })}
                aria-label={t('exportCsvAria')}
              >
                {t('exportCsvMonth', { month: fmtMonthYear(month) })}
              </Btn>
            </Box>
          )}
        </>
      )}

      <AddTransactionModal
        /* Remount on type change so the form's initial state actually picks up
           defaultType — it is only read in the useState initialiser. */
        key={addType}
        open={showAdd}
        defaultType={addType}
        onClose={() => setShowAdd(false)}
        clients={clients}
        projects={projects}
        categories={categories}
        members={members}
        groups={groups}
        onCreateCategory={(name) => addCategory({ name, color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] })}
        onSave={async (tx) => {
          const row = await addTransaction(tx)
          setMonth(startOfMonth(toLocalDate(row.date)))
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
        onDelete={dropTransaction}
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
