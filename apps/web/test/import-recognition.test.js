/* ════════════════════════════════════════════════════════════════
   IMPORT-RECOGNITION SUITE — regression net for the CSV/Excel import
   detection engine (the part that recognises many field names, value
   shapes, statuses, period/matrix layouts, and file structures).
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import * as csv from '../src/lib/csvImport'
import * as col from '../src/lib/columnDetect'
import * as st from '../src/lib/statusImport'
import * as pv from '../src/lib/pivotImport'
import * as sm from '../src/lib/sheetMapper'
import { buildReviewFromSheets } from '../src/lib/importFlow'
import { parsePayMethod } from '@simplicity/core'

/* header→field for the flat path (blank value isolates header mapping). */
const flatField = (h) => csv.buildParsedFromRows([[h], ['']], 'p.csv').mapping[0] || null
const cBucket = (v) => st.mapValueToMetaConfident(v, 'client')
const lBucket = (v) => st.mapValueToMetaConfident(v, 'lead')

describe('flat header synonyms', () => {
  const cases = {
    'שם הלקוח': 'name', 'שם מלא': 'name', 'שם פרטי': 'name', 'שם ומשפחה': 'name',
    'מטופל': 'name', 'מטופלת': 'name', 'חניך': 'name', 'חניכה': 'name', 'שם העסק': 'name',
    'מתאמן': 'name', 'מודרך': 'name', 'קליינט': 'name', 'Full Name': 'name', 'Client Name': 'name',
    'טלפון': 'phone', 'נייד': 'phone', "מס' טלפון": 'phone', 'מס׳ נייד': 'phone',
    'פלאפון': 'phone', 'טל': 'phone', 'סלולרי': 'phone', 'וואטסאפ': 'phone', 'Phone': 'phone', 'Mobile': 'phone',
    'אימייל': 'email', 'מייל': 'email', 'דוא"ל': 'email', 'דוא״ל': 'email', 'כתובת מייל': 'email', 'Email': 'email',
    'מספר פגישות': 'sessions', 'כמות פגישות': 'sessions', 'מס פגישות': 'sessions', 'מפגשים': 'sessions',
    'כרטיסיה': 'sessions', 'כניסות': 'sessions', 'שיעורים': 'sessions',
    'מחיר לפגישה': 'price', 'מחיר': 'price', 'עלות': 'price', 'תעריף': 'price', 'מחיר למפגש': 'price',
    'סכום': 'amount', 'תשלום': 'amount', 'הכנסה': 'amount', 'תקבול': 'amount',
    'תאריך': 'date', 'תאריך תשלום': 'date', 'תאריך פגישה': 'date', 'מועד': 'date',
    'סטטוס': 'status', 'מצב': 'status', 'סטאטוס': 'status', 'שלב': 'status',
    'קטגוריה': 'category', 'קטגוריית הוצאה': 'category', 'סוג הוצאה': 'category',
    'הערות': 'notes', 'תיאור': 'notes', 'פירוט': 'notes',
    'כתובת': 'address', 'כתובת מגורים': 'address', 'מען': 'address', 'Address': 'address',
    'תאריך לידה': 'birth_date', 'יום הולדת': 'birth_date', 'Date of Birth': 'birth_date', 'DOB': 'birth_date',
  }
  for (const [h, want] of Object.entries(cases)) {
    it(`"${h}" → ${want}`, () => expect(flatField(h)).toBe(want))
  }
})

describe('flat header guards (deliberate non-mappings)', () => {
  it("'שולם' is not a transaction amount", () => expect(flatField('שולם')).toBe(null))
  it("'paid' is not a transaction amount", () => expect(flatField('paid')).toBe(null))
  it("'סה\"כ' total column is not a transaction amount", () => expect(flatField('סה"כ')).toBe(null))
  it("'סיכום' total column is not a transaction amount", () => expect(flatField('סיכום')).toBe(null))
  it("'שם הפרויקט' → project, not name", () => expect(flatField('שם הפרויקט')).toBe('project'))
  it("'סוג' → type", () => expect(flatField('סוג')).toBe('type'))
  it("numeric 'שולם' column is not content-mapped to amount", () => {
    const p = csv.buildParsedFromRows([['שולם'], ['1200'], ['350']], 'p.csv')
    expect(p.mapping[0]).toBe(null)
  })
})

describe('content classification (by values)', () => {
  const cases = [
    [['052.123.4567', '054.987.6543'], 'phone'],
    [['052-1234567', '054-9876543'], 'phone'],
    [['0521234567', '0546667777'], 'phone'],
    [['+972-52-1234567'], 'phone'],
    [['dana@gmail.com', 'x@y.co.il'], 'email'],
    [['12/05/2026', '01/01/2025'], 'date'],
    [['₪1,200', '₪ 350'], 'amount'],
    [['פעיל', 'לא פעיל', 'לשעבר'], 'status'],
    [['דנה כהן', 'יוסי לוי'], 'name'],
  ]
  for (const [vals, want] of cases) {
    it(`${want}: [${vals.join(', ')}]`, () => expect(col.classifyColumnValues(vals).type).toBe(want))
  }
  it('content fallback rescues unknown name/phone headers', () => {
    const p = csv.buildParsedFromRows([['??', 'xyz'], ['דנה כהן', '052-1234567'], ['יוסי לוי', '054-9999999']], 'p.csv')
    expect(p.mapping[0]).toBe('name')
    expect(p.mapping[1]).toBe('phone')
  })
})

describe('client status → meta bucket', () => {
  const cases = {
    'פעיל': 'active', 'פעילה': 'active', 'לא פעיל': 'past', 'לשעבר': 'past', 'ביניים': 'wandering',
    'נודד': 'wandering', 'סיים': 'past', 'נשר': 'past', 'עזב': 'past', 'הוקפא': 'wandering',
    'בהקפאה': 'wandering', 'מוקפא': 'wandering', 'בוגר': 'past', 'פרש': 'past', 'מנוי הסתיים': 'past',
    'מזדמן': 'wandering', 'חד פעמי': 'wandering', 'ניסיון': 'wandering', 'חופשת לידה': 'wandering',
    'שוטף': 'active', 'במעקב': 'active', 'לקוח קבוע': 'active', 'ריטיינר': 'active',
  }
  for (const [v, want] of Object.entries(cases)) {
    it(`"${v}" → ${want}`, () => expect(cBucket(v).meta).toBe(want))
  }
})

describe('lead status → meta bucket', () => {
  const cases = {
    'חדש': 'in_process', 'בתהליך': 'in_process', 'חם': 'in_process', 'קר': 'in_process',
    'תיאום פגישה': 'in_process', 'הצעת מחיר': 'in_process', 'ממתין להחלטה': 'in_process',
    'פנייה ראשונית': 'in_process', 'שיחת היכרות': 'in_process', 'מעוניין': 'in_process', 'מתלבט': 'in_process',
    'נסגר': 'converted', 'הומר': 'converted', 'התחיל טיפול': 'converted', 'רכש חבילה': 'converted', 'חתם חוזה': 'converted',
    'לא רלוונטי': 'not_relevant', 'לא ענה': 'not_relevant', 'התחרט': 'not_relevant', 'בחר מתחרה': 'not_relevant',
    'ספאם': 'not_relevant', 'רחוק מדי': 'not_relevant', 'פנייה כפולה': 'not_relevant', 'לא מעוניין': 'not_relevant',
  }
  for (const [v, want] of Object.entries(cases)) {
    it(`"${v}" → ${want}`, () => expect(lBucket(v).meta).toBe(want))
  }
  it('recognised stages are confident, not fallback guesses', () => {
    expect(lBucket('תיאום פגישה').confident).toBe(true)
    expect(lBucket('הצעת מחיר').confident).toBe(true)
    expect(cBucket('הוקפא').confident).toBe(true)
    expect(cBucket('נשר').confident).toBe(true)
  })
})

describe('period header detection (matrix cross-tabs)', () => {
  const cases = {
    'ינואר': 1, 'דצמבר': 12, 'ינו': 1, 'פבר': 2, 'אפר': 4, 'אוג': 8,
    'Jan': 1, 'January': 1, 'Feb': 2, 'Dec': 12, 'ינואר 2026': 1, 'דצמבר 2025': 12,
    '01/2026': 1, '2026-01': 1, '1': 1,
    "ינו' 26": 1, 'פבר׳ 26': 2, 'ינו-26': 1, 'מרץ 26': 3, 'Jan-26': 1, 'Feb 2026': 2,
    'מרץ׳26': 3, '2026 ינואר': 1, '01/26': 1, '1.26': 1,
    'רבעון 1': 1, 'רבעון 2': 4, 'Q1 2026': 1, 'Q3': 7, 'ר1': 1, 'ר3': 7, 'רבעון א׳': 1, 'רבעון ראשון': 1, 'רבעון 1/2026': 1,
    'H1': 1, 'H2': 7, 'חציון 1': 1, 'מחצית א׳': 1, 'מחצית ראשונה': 1, 'מחצית ב': 7,
    'חודש 1': 1, 'תקופה 2': 2, 'מחזור 3': 3, 'מחזור ינואר': 1,
  }
  for (const [h, want] of Object.entries(cases)) {
    it(`"${h}" → month ${want}`, () => {
      const r = pv.classifyPeriodHeader(h)
      expect(r ? r.month : null).toBe(want)
    })
  }
  it('summary/total columns are NOT periods', () => {
    for (const s of ['סה״כ 2026', 'סיכום שנתי 2026', 'ממוצע חודשי', 'עד כה 2026', 'שנת 2026', 'הכנסה 2026', 'סהכ']) {
      expect(pv.classifyPeriodHeader(s)).toBe(null)
    }
  })
  it('guards: bare year / 13 / single stray month col are not periods/matrices', () => {
    expect(pv.classifyPeriodHeader('2026')).toBe(null)
    expect(pv.classifyPeriodHeader('13')).toBe(null)
    expect(pv.detectMatrix(['שם', 'טלפון', 'מאי', 'הערות']).isMatrix).toBe(false)
  })
  it('matrix detection across English / month-year / quarter / abbrev headers', () => {
    expect(pv.detectMatrix(['פרויקט', 'Jan', 'Feb', 'Mar', 'Apr']).isMatrix).toBe(true)
    expect(pv.detectMatrix(['שם', 'ינואר 2026', 'פברואר 2026', 'מרץ 2026']).isMatrix).toBe(true)
    expect(pv.detectMatrix(['קטגוריה', 'Q1', 'Q2', 'Q3', 'Q4']).isMatrix).toBe(true)
    expect(pv.detectMatrix(['פרויקט', "ינו' 26", "פבר' 26", "מרץ' 26"]).isMatrix).toBe(true)
  })
})

describe('sheet-type routing', () => {
  const cases = [
    ['לקוחות', ['שם', 'טלפון', 'סטטוס'], 'clients'],
    ['רשימת מטופלים', ['שם מלא', 'נייד'], 'clients'],
    ['לידים', ['שם', 'מקור', 'סטטוס'], 'leads'],
    ['הכנסות 2026', ['פרויקט', 'ינואר', 'פברואר', 'מרץ'], 'matrix'],
    ['תשלומים', ['לקוח', 'סכום', 'תאריך'], 'transactions'],
    ['יומן פגישות', ['לקוח', 'תאריך', 'סיכום'], 'sessions'],
  ]
  for (const [name, headers, want] of cases) {
    it(`"${name}" → ${want}`, () => expect(sm.guessSheetType(name, headers, [headers.map(() => 'x')])).toBe(want))
  }
})

describe('date + amount parsing', () => {
  const dates = { '2026-05-12': '2026-05-12', '12/05/2026': '2026-05-12', '12.5.26': '2026-05-12', '2026-13-01': null }
  for (const [d, want] of Object.entries(dates)) {
    it(`date "${d}" → ${want}`, () => expect(csv.normalizeDate(d)).toBe(want))
  }
  const amts = { '₪1,200': 1200, '1.234,56': 1234.56, '(500)': -500, '12,5': 12.5 }
  for (const [a, want] of Object.entries(amts)) {
    it(`amount "${a}" → ${want}`, () => expect(col.parseAmount(a)).toBe(want))
  }
})

describe('layout robustness', () => {
  it('flat path detects the header row past a title banner', () => {
    const p = csv.buildParsedFromRows([
      ['רשימת הלקוחות שלי — 2026', '', ''],
      ['שם', 'טלפון', 'סטטוס'],
      ['דנה', '052-1234567', 'פעיל'],
      ['יוסי', '054-9999999', 'לשעבר'],
    ], 'p.csv')
    expect(p.headers.join('|')).toBe('שם|טלפון|סטטוס')
    expect(p.mapping[0]).toBe('name')
    expect(p.clients.length).toBe(2)
  })
})

describe('unified flow (importFlow): sheets → review', () => {
  it('projects + merges multi-sheet workbook into a review object', () => {
    const clients = sm.buildSheetMapping('wb.xlsx', 'לקוחות', [['שם', 'טלפון', 'סטטוס', 'מספר פגישות', 'מחיר לפגישה'], ['דנה', '052-1234567', 'פעיל', '10', '350']])
    const leads = sm.buildSheetMapping('wb.xlsx', 'לידים', [['שם', 'מקור', 'סטטוס'], ['רון', 'אינסטגרם', 'ליד חדש']])
    const r = buildReviewFromSheets({ kind: 'csv', file_name: 'wb.xlsx', sheets: [clients, leads] })
    expect(r.clients.length).toBe(1)
    expect(r.leads.length).toBe(1)
    expect(r.clients[0].name).toBe('דנה')
  })
  it('returns null when nothing is reviewable', () => {
    expect(buildReviewFromSheets({ kind: 'csv', sheets: [] })).toBe(null)
  })
})

describe('clients entity: real per-session price column', () => {
  it('maps "מחיר לפגישה" to price_per_session and keeps the real rate', () => {
    const sheet = sm.buildSheetMapping('c.xlsx', 'לקוחות', [
      ['שם', 'מספר פגישות', 'מחיר לפגישה'],
      ['דנה', '10', '350'],
    ])
    const i = sheet.headers.indexOf('מחיר לפגישה')
    expect(sheet.mapping[i]).toBe('price_per_session')
    const { clients } = sm.projectSheet(sheet)
    expect(clients[0].price_per_session).toBe(350) /* the rate itself, not income÷sessions=35 */
    expect(clients[0].sessions).toBe(10)
  })
  it('still derives price from income÷sessions when no rate column exists', () => {
    const sheet = sm.buildSheetMapping('c.xlsx', 'לקוחות', [
      ['שם', 'מספר פגישות', 'סך הכנסה'],
      ['יוסי', '10', '3500'],
    ])
    const { clients } = sm.projectSheet(sheet)
    expect(clients[0].price_per_session).toBe(350)
  })
})

describe('payment method: free-text → PAY_METHODS key (import-safe)', () => {
  const cases = {
    'מזומן': 'cash', 'cash': 'cash',
    'העברה': 'bank_transfer', 'העברה בנקאית': 'bank_transfer', 'Bank Transfer': 'bank_transfer',
    'אשראי': 'credit_card', 'כרטיס אשראי': 'credit_card', 'Visa': 'credit_card',
    'ביט': 'app', 'bit': 'app', 'פייבוקס': 'app', 'אפליקציה': 'app',
  }
  for (const [raw, want] of Object.entries(cases)) {
    it(`"${raw}" → ${want}`, () => expect(parsePayMethod(raw)).toBe(want))
  }
  it('unrecognized non-empty → other (never violates the DB CHECK)', () => expect(parsePayMethod("צ'ק")).toBe('other'))
  it('empty → null (not set)', () => { expect(parsePayMethod('')).toBe(null); expect(parsePayMethod(null)).toBe(null) })
})

describe('single sheet → clients + enriched payment (#3)', () => {
  it('a clients sheet recognizes payment method + date columns', () => {
    const sheet = sm.buildSheetMapping('all.xlsx', 'לקוחות', [
      ['שם', 'שולם', 'אמצעי תשלום', 'תאריך תשלום'],
      ['דנה', '1200', 'העברה בנקאית', '2026-03-01'],
    ])
    expect(sheet.type).toBe('clients')
    expect(sheet.mapping[sheet.headers.indexOf('אמצעי תשלום')]).toBe('payment_method')
    expect(sheet.mapping[sheet.headers.indexOf('תאריך תשלום')]).toBe('payment_date')
    const { clients } = sm.projectSheet(sheet)
    expect(clients[0].paid).toBe(1200)
    expect(clients[0].pay_method).toBe('bank_transfer') /* mapped to a key, not raw text */
    expect(clients[0].pay_date).toBe('2026-03-01')
  })
  it('a transactions sheet carries the payment method as a key', () => {
    const sheet = sm.buildSheetMapping('inc.xlsx', 'תשלומים', [
      ['תאריך', 'סכום', 'אמצעי תשלום'],
      ['2026-03-01', '500', 'מזומן'],
    ])
    expect(sheet.type).toBe('transactions')
    const { transactions } = sm.projectSheet(sheet)
    expect(transactions[0].amount).toBe(500)
    expect(transactions[0].payment_method).toBe('cash')
  })
})

describe('recognition wizard summary (sheetRecognitionInfo)', () => {
  it('a clients sheet with payment columns reads as "includes payments" + method', () => {
    const sheet = sm.buildSheetMapping('all.xlsx', 'לקוחות', [
      ['שם', 'שולם', 'אמצעי תשלום', 'תאריך תשלום'],
      ['דנה', '1200', 'מזומן', '2026-03-01'],
    ])
    const info = sm.sheetRecognitionInfo(sheet)
    expect(info.yieldCount).toBe(1)
    expect(info.empty).toBe(false)
    expect(info.hasPayments).toBe(true)
    expect(info.hasMethod).toBe(true)
  })
  it('a name-only clients sheet has no payment signals', () => {
    const sheet = sm.buildSheetMapping('c.xlsx', 'לקוחות', [['שם'], ['דנה']])
    const info = sm.sheetRecognitionInfo(sheet)
    expect(info.hasPayments).toBe(false)
    expect(info.hasMethod).toBe(false)
    expect(info.empty).toBe(false)
  })
  it('flags a sheet that yields nothing as empty (wrong type)', () => {
    const sheet = sm.buildSheetMapping('e.xlsx', 'לקוחות', [['שם', 'שולם'], ['', '100']])
    const info = sm.sheetRecognitionInfo(sheet)
    expect(info.yieldCount).toBe(0)
    expect(info.empty).toBe(true)
  })
})

describe('clients sheet: number-of-installments column (#2b import)', () => {
  it('recognizes "מספר תשלומים" and projects it onto the client', () => {
    const sheet = sm.buildSheetMapping('p.xlsx', 'לקוחות', [
      ['שם', 'סה״כ לתשלום', 'מספר תשלומים'],
      ['דנה', '3600', '6'],
    ])
    expect(sheet.type).toBe('clients')
    expect(sheet.mapping[sheet.headers.indexOf('מספר תשלומים')]).toBe('num_installments')
    const { clients } = sm.projectSheet(sheet)
    expect(clients[0].num_installments).toBe(6)
    expect(clients[0].total_due).toBe(3600)
  })
})
