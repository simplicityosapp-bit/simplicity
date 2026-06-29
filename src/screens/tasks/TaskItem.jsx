import { memo } from 'react'
import { Check, Pencil } from 'lucide-react'
import { useT } from '../../i18n/useT'

function TaskItem({ task, project, clientName, dotColor, onToggle, onEdit, index, taskStatus, category, dueLabel }) {
  const { t } = useT('tasks')
  const isDone = task.status === 'done'
  const meta = [dueLabel, clientName, project?.name].filter(Boolean).join(' · ')

  return (
    <div className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <button
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => onToggle(task.id)}
        aria-pressed={isDone}
        aria-label={isDone ? t('item.uncheck') : t('item.checkTask')}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <div className="tc-body">
        <p className="tc-title">{task.title}</p>
        {meta && <p className="tc-meta">{meta}</p>}
        {(taskStatus || category) && (
          <div className="tc-tags">
            {taskStatus && (
              <span className="tc-tag">
                <span className="tc-tag-dot" style={{ background: taskStatus.color || 'var(--stone)' }} />
                {taskStatus.display_name}
              </span>
            )}
            {category && (
              <span className="tc-tag">
                <span className="tc-tag-dot" style={{ background: category.color || 'var(--stone)' }} />
                {category.name}
              </span>
            )}
          </div>
        )}
      </div>
      {onEdit && (
        <button type="button" className="tc-edit" onClick={() => onEdit(task)} aria-label={t('item.editTask')}>
          <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <span className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </div>
  )
}

export default memo(TaskItem)
