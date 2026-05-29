import { Sparkles, MessageCircle } from 'lucide-react'

/* Step 9 — finish. Quick widget overview + an optional feedback panel
   stub. The actual feedback panel is a separate feature; here we just
   reserve the slot and explain it. The primary CTA flips
   onboarding.completed_at and lands the user on /home. */
const WIDGET_OVERVIEW = [
  { title: 'מבט על',          body: 'הציון המשוקלל של היעדים שלך — תצוגה אחת על הכל.' },
  { title: 'מה איתך היום',    body: 'השאלה היומית שלך + רצף תשובות.' },
  { title: 'תנועה / עדכון מהיר', body: 'הוספת תנועה כספית או עדכון מהיר ללקוח.' },
  { title: 'דרושה תשומת לב',   body: 'פגישות לאישור, תשלומים ממתינים, לקוחות שלא טופלו.' },
  { title: 'תזכורות קרובות',   body: 'מה צריך לקרות בימים הקרובים.' },
  { title: 'המשימות הבאות',    body: 'מסומנות לפי דחיפות.' },
  { title: 'כרטיסי-מצב',       body: 'לקוחות פעילים, נטו החודש, משימות פתוחות.' },
]

export default function Step9Finish({ ob, onDone }) {
  return (
    <>
      <p className="ob-intro">
        <Sparkles size={16} strokeWidth={1.7} aria-hidden="true" /> סיימת — הפרקטיקה שלך בנויה.
      </p>
      <p className="ob-intro-sub">מסך הבית בנוי מווידג&apos;טים, ואת/ה בוחר/ת מה מופיע ובאיזה סדר. אפשר תמיד לחזור להגדיר מההגדרות.</p>

      <div className="ob-field">
        <p className="ob-label">מה תראה/י במסך הבית</p>
        <ul style={{ margin: 0, paddingInlineStart: 18, fontFamily: 'var(--mg-font)', fontSize: 13, lineHeight: 1.65 }}>
          {WIDGET_OVERVIEW.map((w) => (
            <li key={w.title}><strong>{w.title}</strong> — <span style={{ color: 'var(--stone)' }}>{w.body}</span></li>
          ))}
        </ul>
      </div>

      <div className="ob-pre-fill-banner" role="region" aria-label="פידבק">
        <MessageCircle size={14} strokeWidth={1.7} aria-hidden="true" />
        <span>
          המערכת נבנית עבורך. כל פידבק מעצב אותה — חלונית פידבק תיפתח בקרוב.
        </span>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="ob-btn primary" onClick={onDone}>
          הפרקטיקה שלך מוכנה ←
        </button>
      </div>
    </>
  )
}
