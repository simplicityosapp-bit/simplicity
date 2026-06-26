/* ════════════════════════════════════════════════════════════════
   SITE PAGE TEMPLATES — ready-made starter layouts.
   ════════════════════════════════════════════════════════════════
   A static catalog of pre-designed pages built from the existing block
   engine. When a coach creates a new page they pick a template (or blank);
   the template's `theme` + `sections` are cloned into a fresh site_page,
   then fully editable. Content is Hebrew seed copy (the coach edits it),
   like every block's defaultProps. Template NAMES are translated (the
   picker UI), keyed by `templates.<id>`.

   Each template: { id, kind, theme, sections:[{id,type,props,style}] }. */

import { DEFAULT_THEME, DEFAULT_FIELDS } from './sitePageSchema'

const theme = (over) => ({ ...DEFAULT_THEME, ...over })
const FIELDS = () => structuredClone(DEFAULT_FIELDS)

export const TEMPLATES = [
  /* ── Landing ─────────────────────────────────────────────────────────── */
  {
    id: 'coaching', kind: 'landing',
    theme: theme({ brandColor: '#C97B5E', background: { type: 'scene', value: 'clients' }, cardOpacity: 92 }),
    sections: [
      { id: 's1', type: 'hero', style: {}, props: { eyebrow: 'ליווי אישי', heading: 'הצעד הראשון לחיים שאתם רוצים', subheading: 'תהליך קואצ׳ינג ממוקד שמחזיר לכם בהירות, ביטחון וכיוון.', ctaLabel: 'לשיחת היכרות חינם', ctaAction: { type: 'scrollToForm', url: '' } } },
      { id: 's2', type: 'iconText', style: {}, props: { items: [
        { icon: 'Compass', title: 'כיוון ברור', body: 'נמצא יחד לאן אתם רוצים להגיע ואיך.' },
        { icon: 'Target', title: 'יעדים מעשיים', body: 'צעדים קטנים שמצטברים לשינוי אמיתי.' },
        { icon: 'Heart', title: 'יחס אישי', body: 'תהליך שמותאם בדיוק לכם, בקצב שלכם.' },
      ] } },
      { id: 's3', type: 'testimonial', style: {}, props: { quote: 'תוך שלושה חודשים הרגשתי שינוי שלא האמנתי שאפשרי. ההקשבה והכלים עשו את ההבדל.', author: 'מאיה ל.', role: 'לקוחה', avatar: '' } },
      { id: 's4', type: 'form', style: {}, props: { heading: 'מעוניינים? השאירו פרטים ואחזור אליכם', submitLabel: 'שליחה', fields: FIELDS() } },
    ],
  },
  {
    id: 'workshop', kind: 'landing',
    theme: theme({ brandColor: '#8BA888', background: { type: 'scene', value: 'goals' }, cardOpacity: 94 }),
    sections: [
      { id: 's1', type: 'hero', style: {}, props: { eyebrow: 'סדנה אונליין', heading: 'הסדנה שתשנה את הדרך שבה אתם עובדים', subheading: 'מפגש מעשי של שעתיים — כלים שאפשר ליישם כבר מחר בבוקר.', ctaLabel: 'להרשמה', ctaAction: { type: 'scrollToForm', url: '' } } },
      { id: 's2', type: 'cards', style: {}, props: { columns: 'auto', items: [
        { icon: 'BookOpen', title: 'תוכן מעשי', body: 'בלי תיאוריות — רק מה שעובד.', link: '' },
        { icon: 'Zap', title: 'יישום מיידי', body: 'תרגול חי במהלך המפגש.', link: '' },
        { icon: 'Award', title: 'חומרים נלווים', body: 'מצגת וסיכום נשלחים אליכם.', link: '' },
      ] } },
      { id: 's3', type: 'faq', style: {}, props: { items: [
        { q: 'מתי הסדנה?', a: 'התאריך הקרוב יישלח לנרשמים. ההקלטה זמינה גם בדיעבד.' },
        { q: 'צריך ניסיון קודם?', a: 'לא. הסדנה בנויה כך שכל אחד יכול להצטרף וליישם.' },
        { q: 'כמה זה עולה?', a: 'המפגש הראשון חינם. פרטים מלאים יישלחו לאחר ההרשמה.' },
      ] } },
      { id: 's4', type: 'form', style: {}, props: { heading: 'הרשמה לסדנה', submitLabel: 'אני רוצה להירשם', fields: FIELDS() } },
    ],
  },
  {
    id: 'service', kind: 'landing',
    theme: theme({ brandColor: '#B5634E', background: { type: 'scene', value: 'finance' }, cardOpacity: 90 }),
    sections: [
      { id: 's1', type: 'hero', style: {}, props: { eyebrow: 'שירות מקצועי', heading: 'הפתרון שחיכיתם לו', subheading: 'ניסיון, מקצועיות ויחס אישי — הכל במקום אחד.', ctaLabel: 'דברו איתי', ctaAction: { type: 'scrollToForm', url: '' } } },
      { id: 's2', type: 'iconText', style: {}, props: { items: [
        { icon: 'Shield', title: 'אמינות', body: 'שקיפות מלאה לאורך כל הדרך.' },
        { icon: 'Clock', title: 'זמינות', body: 'מענה מהיר ויחס אישי.' },
        { icon: 'Star', title: 'איכות', body: 'תוצאות שמדברות בעד עצמן.' },
        { icon: 'Users', title: 'ניסיון', body: 'מאות לקוחות מרוצים.' },
      ] } },
      { id: 's3', type: 'testimonial', style: {}, props: { quote: 'מקצועיות ברמה אחרת. ממליצה בחום לכל מי שמחפש שירות אמין.', author: 'דנה כ.', role: '', avatar: '' } },
      { id: 's4', type: 'form', style: {}, props: { heading: 'השאירו פרטים לקבלת הצעה', submitLabel: 'שליחה', fields: FIELDS() } },
    ],
  },
  {
    id: 'simple', kind: 'landing',
    theme: theme({ font: 'rubik', brandColor: '#C97B5E', background: { type: 'flat', value: '#f7f3ee' }, textAlign: 'center', cardOpacity: 100 }),
    sections: [
      { id: 's1', type: 'hero', style: {}, props: { eyebrow: '', heading: 'בואו נתחיל', subheading: 'משפט אחד שמסביר בדיוק מה אתם מציעים ולמי.', ctaLabel: 'אני רוצה לשמוע עוד', ctaAction: { type: 'scrollToForm', url: '' } } },
      { id: 's2', type: 'text', style: {}, props: { text: 'כאן מקום לספר בקצרה על מי אתם, מה אתם עושים, ולמה כדאי ליצור איתכם קשר. שמרו על זה פשוט וברור.' } },
      { id: 's3', type: 'form', style: {}, props: { heading: 'השאירו פרטים', submitLabel: 'שליחה', fields: FIELDS() } },
    ],
  },
  /* ── Lead capture ────────────────────────────────────────────────────── */
  {
    id: 'quickLead', kind: 'lead',
    theme: theme({ brandColor: '#C97B5E', background: { type: 'scene', value: 'leads' }, cardOpacity: 95 }),
    sections: [
      { id: 's1', type: 'hero', style: {}, props: { eyebrow: '', heading: 'בואו נדבר', subheading: 'השאירו פרטים ואחזור אליכם בהקדם.', ctaLabel: '', ctaAction: { type: 'scrollToForm', url: '' } } },
      { id: 's2', type: 'form', style: {}, props: { heading: 'השאירו פרטים', submitLabel: 'שליחה', fields: FIELDS() } },
    ],
  },
  {
    id: 'leadMagnet', kind: 'lead',
    theme: theme({ brandColor: '#8BA888', background: { type: 'scene', value: 'reports' }, cardOpacity: 94 }),
    sections: [
      { id: 's1', type: 'hero', style: {}, props: { eyebrow: 'מתנה בשבילכם', heading: 'המדריך החינמי שיחסוך לכם זמן', subheading: 'כל מה שצריך לדעת — במקום אחד, חינם.', ctaLabel: '', ctaAction: { type: 'scrollToForm', url: '' } } },
      { id: 's2', type: 'cards', style: {}, props: { columns: 'auto', items: [
        { icon: 'Check', title: 'מעשי', body: 'צעד אחר צעד.', link: '' },
        { icon: 'Clock', title: 'קצר', body: 'קריאה של 10 דקות.', link: '' },
        { icon: 'Gift', title: 'חינם', body: 'נשלח ישר למייל.', link: '' },
      ] } },
      { id: 's3', type: 'form', style: {}, props: { heading: 'קבלו את המדריך למייל', submitLabel: 'שלחו לי את המדריך', fields: FIELDS() } },
    ],
  },
]

/* Templates offered for a given page kind. */
export const templatesForKind = (kind) => TEMPLATES.filter((tpl) => tpl.kind === kind)
