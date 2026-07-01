import TransactionCard from './TransactionCard'
import { useT } from '../../i18n/useT'
import { Box, Txt } from '../../components/ui'

/* Pending lives in its own section now (see PendingSection). The main list
   shows confirmed + (optionally) skipped. */
const GROUP_KEYS = ['confirmed', 'skipped']

export default function TransactionList({ transactions, clients, projects, categories, showSkipped = true, onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const { t } = useT('finance')
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
                onDelete={onDelete}
              />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
