import { memo } from 'react'
import { Check, Pencil } from 'lucide-react'
import { useT } from '../../i18n/useT'
import InlineTitle from './InlineTitle'
import { Box, Txt, Btn } from '../../components/ui'

function TaskItem({ task, project, clientName, dotColor, onToggle, onEdit, onRename, index, taskStatus, category, dueLabel }) {
  const { t } = useT('tasks')
  const isDone = task.status === 'done'
  const meta = [dueLabel, clientName, project?.name].filter(Boolean).join(' · ')

  return (
    <Box className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <Btn
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => onToggle(task.id)}
        aria-pressed={isDone}
        aria-label={isDone ? t('item.uncheck') : t('item.checkTask')}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </Btn>
      <Box className="tc-body">
        <InlineTitle
          className="tc-title"
          title={task.title}
          onRename={onRename ? (next) => onRename(task.id, next) : undefined}
        />
        {meta && <Txt as="p" className="tc-meta">{meta}</Txt>}
        {(taskStatus || category) && (
          <Box className="tc-tags">
            {taskStatus && (
              <Txt className="tc-tag">
                <Txt className="tc-tag-dot" style={{ background: taskStatus.color || 'var(--stone)' }} />
                {taskStatus.display_name}
              </Txt>
            )}
            {category && (
              <Txt className="tc-tag">
                <Txt className="tc-tag-dot" style={{ background: category.color || 'var(--stone)' }} />
                {category.name}
              </Txt>
            )}
          </Box>
        )}
      </Box>
      {onEdit && (
        <Btn type="button" className="tc-edit" onClick={() => onEdit(task)} aria-label={t('item.editTask')}>
          <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
        </Btn>
      )}
      <Txt className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </Box>
  )
}

export default memo(TaskItem)
