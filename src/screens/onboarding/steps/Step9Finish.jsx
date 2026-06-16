import { useEffect } from 'react'
import { Sparkles, Folder, Users, Target, Repeat } from 'lucide-react'
import { addressUser } from '../../../lib/address'
import { useProjects } from '../../../hooks/useProjects'
import { useClients } from '../../../hooks/useClients'
import { useGoals } from '../../../hooks/useGoals'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { useRecurring } from '../../../hooks/useRecurring'

/* Step 9 — finish + final confirmation. The manual onboarding path creates
   each entity LIVE as the user advances (project on step 3, clients on 4,
   questions on 5, goal on 6, recurring on 7), so there is nothing left to
   "create" here — but the user never saw a closing confirmation of what was
   set up. This step now SUMMARISES the live result (read-only, no second
   write, so nothing can double-create) and the primary CTA flips
   onboarding.completed_at and lands the user on /home.
   (No skip button on this last step — see OnboardingShell.) */
export default function Step9Finish({ ob, onDone, setCTA }) {
  const addr = (v) => addressUser(ob.state.answers?.profile?.gender, v)
  const { projects } = useProjects()
  const { clients } = useClients()
  const { goals } = useGoals()
  const { questions } = useUserQuestions()
  const { templates: recurring } = useRecurring()

  useEffect(() => {
    setCTA({ onNext: onDone, canAdvance: true, busy: false, hint: null, nextLabel: 'שנתחיל?' })
  }, [onDone]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Live counts of what onboarding actually created — only non-empty rows
     are shown, so a user who skipped a step doesn't see a row of zeros. */
  const summary = [
    { key: 'projects',  icon: Folder,   label: 'פרויקטים',       count: (projects || []).length },
    { key: 'clients',   icon: Users,    label: 'לקוחות',          count: (clients || []).length },
    { key: 'goals',     icon: Target,   label: 'יעדים',           count: (goals || []).length },
    { key: 'questions', icon: Sparkles, label: 'שאלות יומיות',    count: (questions || []).filter((q) => q.active !== false).length },
    { key: 'recurring', icon: Repeat,   label: 'הוצאות קבועות',   count: (recurring || []).length },
  ].filter((s) => s.count > 0)

  return (
    <>
      <p className="ob-intro" style={{ justifyContent: 'center' }}>
        <Sparkles size={16} strokeWidth={1.7} aria-hidden="true" /> סיימת! הכל מוכן
      </p>

      {summary.length > 0 ? (
        <div className="ob-field">
          <p className="ob-label" style={{ display: 'inline-block' }}>מה הגדרנו יחד</p>
          <div className="ob-finish-summary">
            {summary.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.key} className="ob-finish-row">
                  <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
                  <span className="ob-finish-label">{s.label}</span>
                  <span className="ob-finish-count mono">{s.count}</span>
                </div>
              )
            })}
          </div>
          <p className="ob-empty-hint" style={{ marginTop: 8 }}>
            הכל כבר נשמר — {addr({ male: 'תוכל', female: 'תוכלי', neutral: 'תוכל/י' })} להוסיף, לערוך או למחוק בכל רגע ממסך הבית.
          </p>
        </div>
      ) : (
        <p className="ob-empty-hint" style={{ textAlign: 'center' }}>
          אפשר להוסיף לקוחות, יעדים, משימות והכל — בקלות ממסך הבית, מתי {addr({ male: 'שתרצה', female: 'שתרצי', neutral: 'שתרצה/י' })}.
        </p>
      )}

      <div className="ob-field" style={{ textAlign: 'center' }}>
        <p className="ob-label" style={{ display: 'inline-block' }}>חשוב לדעת</p>
        <div className="ob-about" style={{ fontFamily: 'var(--mg-font)', fontSize: 'calc(13.5px * var(--text-scale))', lineHeight: 1.75, color: 'var(--espresso)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px' }}>המערכת הזאת נבנית בשבילך — כדי שיהיה כמה שיותר קל וכמה שיותר מזין לנהל את העסק שלך.</p>
          <p style={{ margin: '0 0 10px' }}>{addr({ male: 'תוכל', female: 'תוכלי', neutral: 'תוכל/י' })} ממסך הבית והתפריט להשאיר לנו פידבקים, בקשות ודיוקים כדי שהמערכת תתאים את עצמה אפילו עוד יותר אליך.</p>
          <p style={{ margin: '0 0 10px' }}>אכפת לנו ממך — אז {addr({ male: 'תרשה', female: 'תרשי', neutral: 'תרשה/י' })} לעצמך לפעול {addr({ male: 'כמלך', female: 'כמלכה', neutral: 'כמלך/כמלכה' })} ולבקש כל מה ש{addr({ male: 'תרצה', female: 'תרצי', neutral: 'תרצה/י' })}.</p>
          <p style={{ margin: '0 0 10px' }}>אנחנו יותר ממקווים שסימפליסיטי תהפוך לבית חם עבור העסק שלך — ומאחלים לך הגשמה מלאה ומספקת.</p>
          <p style={{ margin: 0, fontWeight: 600 }}>בהצלחה!</p>
        </div>
      </div>

    </>
  )
}
