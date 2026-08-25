import { useCallback, useState } from 'react'
import { isr } from '@simplicity/core'
import TransactionCard from './TransactionCard'
import ConfirmModal from '../../modals/ConfirmModal'
import { useT } from '../../i18n/useT'
import { Box, Txt } from '../../components/ui'

/* Pending lives in its own section now (see PendingSection). The main list
   shows confirmed + (optionally) skipped. */
const GROUP_KEYS = ['confirmed', 'skipped']

/* `flat` — search-results mode. The rows come from across the whole history
   and from every status (a pending row in March has to be findable too, and
   the month-scoped pending card can't show it), so they render as one list
   ordered by date rather than grouped by status, with full dates. */
/* `activeRuleIds` — ids of the recurring templates that are still generating.
   A transaction one of them owns cannot simply be deleted (the rule refills
   the slot), so its delete carries a different dialog and a different action;
   see lib/recurringTx.js. */
export default function TransactionList({ transactions, clients, projects, categories, showSkipped = true, flat = false, emptyText, activeRuleIds, onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const { t } = useT('finance')
  /* Deleting money is a two-step now, like deleting a category or a recurring
     template. The dialog lives here rather than in the card so a list of 80
     transactions still mounts exactly one of them — and so the memoised card
     keeps a stable onDelete identity. */
  const [pendingDelete, setPendingDelete] = useState(null)
  const requestDelete = useCallback((tx) => setPendingDelete(tx), [])
  const ruleBacked = !!(pendingDelete?.recurring_id && activeRuleIds?.has(pendingDelete.recurring_id))

  const visible = flat
    ? transactions
    : transactions.filter((tx) => tx.status !== 'pending' && (showSkipped || tx.status !== 'skipped'))
  if (!visible.length) {
    return (
      <Box className="empty">
        <Txt as="p" className="empty-text">{emptyText || t('list.empty')}</Txt>
      </Box>
    )
  }
  return (
    <Box className="f-tx-groups">
      {flat && (
        <Box className="f-tx-group">
          {visible.map((tx) => (
            <TransactionCard
              key={tx.id}
              tx={tx}
              clients={clients}
              projects={projects}
              categories={categories}
              fullDate
              onApprove={onApprove}
              onSkip={onSkip}
              onUnskip={onUnskip}
              onEdit={onEdit}
              onDelete={onDelete ? requestDelete : undefined}
            />
          ))}
        </Box>
      )}
      {!flat && GROUP_KEYS.map((key) => {
        if (key === 'skipped' && !showSkipped) return null
        const items = visible.filter((tx) => tx.status === key)
        if (!items.length) return null
        return (
          <Box key={key} className="f-tx-group">
            <Txt as="p" className="f-section-lbl">
              {t(`list.${key}`)} <Txt className="f-group-count">{items.length}</Txt>
            </Txt>
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
                onDelete={onDelete ? requestDelete : undefined}
              />
            ))}
          </Box>
        )
      })}

      {/* A row a live rule still owns gets the other dialog: deleting it
          pauses the rule, and saying so is the only way the choice between
          "delete" and "skip" can be made knowingly. */}
      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t(ruleBacked ? 'deleteTx.recurringTitle' : 'deleteTx.title')}
        message={pendingDelete
          ? t(ruleBacked ? 'deleteTx.recurringMessage' : 'deleteTx.message', {
              desc: pendingDelete.desc || t('tx.noDesc'),
              amount: isr(pendingDelete.amount),
            })
          : ''}
        confirmLabel={t(ruleBacked ? 'deleteTx.recurringConfirm' : 'deleteTx.confirm')}
        danger
        onConfirm={() => { if (pendingDelete) return onDelete(pendingDelete.id) }}
      />
    </Box>
  )
}
