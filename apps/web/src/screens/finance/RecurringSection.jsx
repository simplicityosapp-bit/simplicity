import RecurringCard from './RecurringCard'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* The body of the "תבניות חוזרות" section. The title, the icon and the count
   live on the CollapsibleSection header that wraps this, so all that is left
   here is the add button and the list — repeating the title inside would read
   as a heading nested under itself. */
export default function RecurringSection({ templates, onAdd, onEdit, onDelete, onToggleActive }) {
  const { t } = useT('finance')
  const live = templates.filter((tpl) => !tpl.deleted_at)
  return (
    <Box as="section" className="rec-section">
      <Box className="rec-section-head">
        <Btn type="button" className="rec-section-add" onClick={onAdd}>
          {t('recurring.add')}
        </Btn>
      </Box>
      {live.length === 0 ? (
        <Txt as="p" className="rec-section-empty">{t('recurring.empty')}</Txt>
      ) : (
        <Box className="rec-section-list">
          {live.map((tpl) => (
            <RecurringCard
              key={tpl.id}
              template={tpl}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
