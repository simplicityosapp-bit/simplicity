import { memo } from 'react'
import { Check } from 'lucide-react'

function TaskItem({ task, project, clientName, dotColor, onToggle, index }) {
  const isDone = task.status === 'done'
  const meta = [clientName, project?.name].filter(Boolean).join(' · ')

  return (
    <div className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <button
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => onToggle(task.id)}
        aria-pressed={isDone}
        aria-label={isDone ? 'בטל סימון' : 'סמן כבוצע'}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <div className="tc-body">
        <p className="tc-title">{task.title}</p>
        {meta && <p className="tc-meta">{meta}</p>}
      </div>
      <span className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </div>
  )
}

export default memo(TaskItem)
