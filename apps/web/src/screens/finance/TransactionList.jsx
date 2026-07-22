import { useCallback, useState } from 'react'
import { isr } from '@simplicity/core'
import TransactionCard from './TransactionCard'
import ConfirmModal from '../../modals/ConfirmModal'
import { useT } from '../../i18n/useT'
import { Box, Txt } from '../../components/ui'

/* Pending lives in its own section now (see PendingSection). The main list
   shows confirmed + (optionally) skipped. */
const GROUP_KEYS = ['confirmed', 'skipped']

export default function TransactionList({ transactions, clients, projects, categories, showSkipped = true, onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const { t } = useT('finance')
  /* Deleting money is a two-step now, like deleting a category or a recurring
     template. The dialog lives here rather than in the card so a list of 80
     transactions still mounts exactly one of them — and so the memoised card
     keeps a stable onDelete identity. */
  const [pendingDelete, setPendingDelete] = useState(null)
  const requestDelete = useCallback((tx) => setPendingDelete(tx), [])

  const visible = transactions.filter((tx) => tx.status !== 'pending' && (showSkipped || tx.status !== 'skipped'))
  if (!visible.length) {
    return (
      <Box className="empty">
        <Txt as="p" className="empty-text">{t('list.empty')}</Txt>
      </Box>
    )
  }
  return (
    <Box className="f-tx-groups">
      {GROUP_KEYS.map((key) => {
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

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('deleteTx.title')}
        message={pendingDelete
          ? t('deleteTx.message', {
              desc: pendingDelete.desc || t('tx.noDesc'),
              amount: isr(pendingDelete.amount),
            })
          : ''}
        confirmLabel={t('deleteTx.confirm')}
        danger
        onConfirm={() => { if (pendingDelete) return onDelete(pendingDelete.id) }}
      />
    </Box>
  )
}
