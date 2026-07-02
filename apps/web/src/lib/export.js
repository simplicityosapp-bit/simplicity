/* ════════════════════════════════════════════════════════════════
   EXPORT — CSV generation + browser-triggered download.
   ════════════════════════════════════════════════════════════════
   UTF-8 BOM is prepended so Excel on Windows opens the file in the
   right encoding (Hebrew survives the round-trip). Each cell is
   wrapped in double quotes and any embedded quotes are escaped per
   RFC 4180.
   Headers, sheet names and enum values resolve via i18n (the 'export'
   namespace, self-registered below) so the file is written in the active
   language. The CSV importer recognises both Hebrew AND English column /
   value synonyms (see sheetMapper/statusImport), so a Hebrew- or English-
   language export still re-imports cleanly (round-trip); a Spanish export
   reads naturally for humans but the importer has no Spanish synonyms yet.
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'
import heExport from '../i18n/locales/he/export.json'
import enExport from '../i18n/locales/en/export.json'
import esExport from '../i18n/locales/es/export.json'
import frExport from '../i18n/locales/fr/export.json'
import { isEncrypted } from './crypto'
import { questionText } from '@simplicity/core'

/* Self-register the 'export' namespace (he/en/es/fr). Idempotent — no central
   i18n init change needed. */
i18n.addResourceBundle('he', 'export', heExport, true, false)
i18n.addResourceBundle('en', 'export', enExport, true, false)
i18n.addResourceBundle('es', 'export', esExport, true, false)
i18n.addResourceBundle('fr', 'export', frExport, true, false)

/* Column header / sheet name, in the active language. */
const h = (k) => i18n.t(`export:headers.${k}`)
const sheet = (k) => i18n.t(`export:sheets.${k}`)
/* Enum value → localized label (raw key kept for forward-compat; '' for unset). */
const vlabel = (group, k) => (k ? i18n.t(`export:${group}.${k}`, { defaultValue: k }) : '')

/* Neutralize spreadsheet formula injection (CWE-1236). A cell whose first
   character is = + - @ or a leading TAB/CR is interpreted as a live formula
   by Excel / Google Sheets / LibreOffice (e.g. =HYPERLINK(...), =cmd|... DDE,
   =WEBSERVICE(...)), so an attacker-influenced value (a client/lead name, a
   note, a transaction desc — often originating from an imported file) can
   exfiltrate adjacent cells or trigger a command prompt when the coach opens
   their own export. Prefix such string cells with a single quote so the app
   treats them as text. Applied to BOTH the CSV and XLSX export paths; numbers
   and dates are untouched. */
export function neutralizeFormula(s) {
  if (!/^[=+@\t\r-]/.test(s)) return s
  /* Don't mangle legitimate phone numbers (+972…) or negative numbers: a value
     made ONLY of digits and phone/number punctuation can't carry an injection
     payload (HYPERLINK/WEBSERVICE/cmd/DDE all need a letter or '('), so it's
     safe to leave as-is and the export stays clean + re-importable. */
  if (/^[+-]?[\d\s()./-]+$/.test(s)) return s
  return `'${s}`
}

function esc(v) {
  const s = v == null ? '' : neutralizeFormula(String(v))
  return `"${s.replace(/"/g, '""')}"`
}

function fmtAmount(n) {
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

function fmtDate(d) {
  if (!d) return ''
  const x = new Date(d)
  const dd = String(x.getDate()).padStart(2, '0')
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${x.getFullYear()}`
}

function nameById(arr, id) {
  if (!id) return ''
  const row = (arr || []).find((r) => r.id === id)
  return row?.name || ''
}

function ymd(date) {
  const d = date || new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/* Build a CSV string (BOM + quoted cells) from a header row + data rows,
   then trigger a download under `filename`. */
function downloadCsv(headers, rows, filename) {
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  /* Defer revoke so the download has time to start in all browsers. */
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* Transactions — caller passes the month so the filename reads, e.g.,
   "mangata-2026-05.csv". */
export function exportTransactionsCSV({ transactions, clients, projects, categories, monthDate }) {
  const headers = [h('date'), h('type'), h('amount'), h('desc'), h('status'), h('client'), h('project'), h('category')]
  const rows = (transactions || []).map((t) => [
    fmtDate(t.date),
    vlabel('txType', t.type),
    fmtAmount(Number(t.amount || 0)),
    t.desc || '',
    vlabel('txStatus', t.status),
    nameById(clients, t.client_id),
    nameById(projects, t.project_id),
    nameById(categories, t.category_id),
  ])
  const yy = monthDate.getFullYear()
  const mm = String(monthDate.getMonth() + 1).padStart(2, '0')
  downloadCsv(headers, rows, `mangata-${yy}-${mm}.csv`)
}

/* Clients — round-trip-friendly columns (re-importable). */
export function exportClientsCSV({ clients, projects, now }) {
  const headers = [h('name'), h('phone'), h('email'), h('address'), h('birthDate'), h('project'), h('status'), h('sessions'), h('pricePerSession'), h('notes')]
  const rows = (clients || [])
    .filter((c) => !c.deleted_at)
    .map((c) => [
      c.name || '',
      c.phone || '',
      c.email || '',
      c.address || '',
      c.birth_date || '',
      nameById(projects, c.project_id),
      vlabel('clientStatus', c.status_meta),
      c.sessions != null ? String(c.sessions) : '',
      fmtAmount(Number(c.price_per_session || 0)),
      decOrFlag(c.notes),
    ])
  downloadCsv(headers, rows, `mangata-clients-${ymd(now)}.csv`)
}

/* Projects — name + colour (re-importable; colour is ignored on import). */
export function exportProjectsCSV({ projects, now }) {
  const headers = [h('name'), h('color')]
  const rows = (projects || [])
    .filter((p) => !p.deleted_at)
    .map((p) => [p.name || '', p.color || ''])
  downloadCsv(headers, rows, `mangata-projects-${ymd(now)}.csv`)
}

/* id → row map, for resolving foreign keys to readable names in export sheets. */
function mapById(arr) {
  const m = new Map()
  for (const r of arr || []) m.set(r.id, r)
  return m
}

/* Encrypted fields arrive already-decrypted from the api layer; if decryption
   failed the value is still an "ENC:" blob (lib/crypto.js returns the raw value
   on failure, never throws). Never write that to the file — show a marker. */
function decOrFlag(v) {
  if (isEncrypted(v)) return i18n.t('export:decryptFail')
  return v == null ? '' : String(v)
}

/* FULL EXPORT — everything in ONE file: a multi-sheet Excel workbook with a
   sheet per entity (transactions, clients, projects, leads, tasks,
   categories). Uses SheetJS (already a dependency, dynamically imported for
   the same reason the importer does — keeps it out of the main bundle). */
export async function exportAllXLSX({ transactions, clients, projects, categories, leads, tasks, now, sensitive }) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const addSheet = (name, headers, rows) => {
    /* Defense-in-depth: neutralize formula-leading string cells before they
       reach the workbook (matches the CSV path). */
    const clean = rows.map((r) => r.map((c) => (typeof c === 'string' ? neutralizeFormula(c) : c)))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...clean])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet(sheet('transactions'),
    [h('date'), h('type'), h('amount'), h('desc'), h('status'), h('client'), h('project'), h('category')],
    (transactions || []).filter((t) => !t.deleted_at).map((t) => [
      fmtDate(t.date), vlabel('txType', t.type), fmtAmount(Number(t.amount || 0)),
      t.desc || '', vlabel('txStatus', t.status),
      nameById(clients, t.client_id), nameById(projects, t.project_id), nameById(categories, t.category_id),
    ]))

  addSheet(sheet('clients'),
    [h('name'), h('phone'), h('email'), h('address'), h('birthDate'), h('project'), h('status'), h('sessions'), h('pricePerSession'), h('notes')],
    (clients || []).filter((c) => !c.deleted_at).map((c) => [
      c.name || '', c.phone || '', c.email || '', c.address || '', c.birth_date || '', nameById(projects, c.project_id), vlabel('clientStatus', c.status_meta),
      c.sessions != null ? String(c.sessions) : '', fmtAmount(Number(c.price_per_session || 0)), decOrFlag(c.notes),
    ]))

  addSheet(sheet('projects'),
    [h('name'), h('color')],
    (projects || []).filter((p) => !p.deleted_at).map((p) => [p.name || '', p.color || '']))

  addSheet(sheet('leads'),
    [h('name'), h('phone'), h('status'), h('inquiryDate'), h('notes')],
    (leads || []).filter((l) => !l.deleted_at).map((l) => [
      l.name || '', l.phone || '', vlabel('leadStatus', l.status_meta),
      fmtDate(l.inquiry_date), l.notes || '',
    ]))

  addSheet(sheet('tasks'),
    [h('title'), h('status'), h('priority'), h('dueDate')],
    (tasks || []).filter((t) => !t.deleted_at).map((t) => [
      t.title || '', vlabel('taskStatus', t.status), vlabel('priority', t.priority),
      fmtDate(t.due_date),
    ]))

  addSheet(sheet('categories'),
    [h('name'), h('color')],
    (categories || []).filter((c) => !c.deleted_at).map((c) => [c.name || '', c.color || '']))

  /* ── Sensitive categories (opt-in; present only for the boxes the user
     checked). Data arrives already-decrypted via the api layer; decOrFlag
     guards any field that failed to decrypt so a raw ENC: blob never reaches
     the file. Existing sheets above are untouched. */
  if (sensitive) {
    const clientsById = mapById(clients)
    const groupsById = mapById(sensitive.groups)
    const goalCatsById = mapById(sensitive.goalCategories)
    const projectsById = mapById(projects)
    const questionsById = mapById(sensitive.questions)

    if (sensitive.sessions) {
      addSheet(sheet('sessions'),
        [h('date'), h('subject'), h('sessionNum'), h('notes'), h('summary')],
        sensitive.sessions.filter((s) => !s.deleted_at).map((s) => [
          fmtDate(s.date),
          s.group_id ? (groupsById.get(s.group_id)?.name || i18n.t('export:groupFallback')) : (clientsById.get(s.client_id)?.name || ''),
          s.num != null ? String(s.num) : '',
          decOrFlag(s.notes),
          decOrFlag(s.summary),
        ]))
    }

    if (sensitive.goals) {
      addSheet(sheet('goals'),
        [h('goal'), h('category'), h('timeFrame'), h('targetValue'), h('targetDate'), h('importance'), h('project')],
        sensitive.goals.filter((g) => !g.deleted_at).map((g) => [
          g.label || '',
          goalCatsById.get(g.category_id)?.name || '',
          vlabel('timeFrame', g.time_frame),
          g.target_value != null ? String(g.target_value) : '',
          fmtDate(g.target_date),
          g.importance != null ? String(g.importance) : '',
          projectsById.get(g.project_id)?.name || '',
        ]))
    }

    if (sensitive.goalEntries) {
      addSheet(sheet('goalEntries'),
        [h('date'), h('category'), h('value'), h('note'), h('project')],
        sensitive.goalEntries.filter((e) => !e.deleted_at).map((e) => [
          fmtDate(e.date),
          goalCatsById.get(e.category_id)?.name || '',
          e.value != null ? String(e.value) : '',
          e.note || '',
          projectsById.get(e.project_id)?.name || '',
        ]))
    }

    if (sensitive.dailyAnswers) {
      addSheet(sheet('dailyAnswers'),
        [h('date'), h('question'), h('answer'), h('note')],
        sensitive.dailyAnswers.filter((a) => !a.deleted_at).map((a) => {
          const q = questionsById.get(a.user_question_id)
          return [
            fmtDate(a.date),
            q ? questionText(q, sensitive.gender) : '',
            a.value_num != null ? String(a.value_num) : (a.value_text || ''),
            a.note || '',
          ]
        }))
    }

    if (sensitive.moonSnapshots) {
      addSheet(sheet('reflections'),
        [h('date'), h('reflection'), h('score')],
        sensitive.moonSnapshots
          .filter((m) => m.reflection != null && m.reflection !== '')
          .map((m) => [fmtDate(m.date), decOrFlag(m.reflection), m.score != null ? String(m.score) : '']))
    }
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mangata-full-${ymd(now)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
