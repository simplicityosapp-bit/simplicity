import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { addressUser } from '../../../lib/address'

/* Step 9 — finish. A short, centered "good to know" note, and the primary
   CTA that flips onboarding.completed_at and lands the user on /home.
   (No skip button on this last step — see OnboardingShell.) */
export default function Step9Finish({ ob, onDone, setCTA }) {
  const addr = (v) => addressUser(ob.state.answers?.profile?.gender, v)
  useEffect(() => {
    setCTA({ onNext: onDone, canAdvance: true, busy: false, hint: null, nextLabel: 'שנתחיל?' })
  }, [onDone]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <p className="ob-intro" style={{ justifyContent: 'center' }}>
        <Sparkles size={16} strokeWidth={1.7} aria-hidden="true" /> סיימת! הכל מוכן
      </p>

      <div className="ob-field" style={{ textAlign: 'center' }}>
        <p className="ob-label" style={{ display: 'inline-block' }}>חשוב לדעת</p>
        <div className="ob-about" style={{ fontFamily: 'var(--mg-font)', fontSize: 13.5, lineHeight: 1.75, color: 'var(--espresso)', textAlign: 'center' }}>
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
