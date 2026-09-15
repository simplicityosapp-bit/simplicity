/* ════════════════════════════════════════════════════════════════
   LEADS ON THE PHONE — review, follow-up, search
   ════════════════════════════════════════════════════════════════
   The review strip showed a name and a phone, so whatever the person
   wrote on the page was invisible until the lead was approved blind,
   and reject was one tap on a real enquiry. A follow-up date could only
   be changed through the full lead editor. Search matched the name,
   case-sensitively.

   Pinned: every submitted answer with the page's label; reject asks;
   the follow-up presets write local dates and "done" clears; search is
   core matchLead (pinned in core) reaching phone and source.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import PendingLeadsSection, { pendingRows } from '../src/screens/leads/PendingLeadsSection'
import LeadFollowupSheet from '../src/screens/leads/LeadFollowupSheet'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const wrap = (node) => render(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const lead = { id: 'l1', name: 'רותם', phone: '0521234567', page_id: 'pg', data: { f_time: 'בערבים', f_goal: 'גמישות' } }
const page = { id: 'pg', title: 'שיעור ניסיון', fields: [{ key: 'f_time', label: 'מתי נוח?' }] }

describe('pending review', () => {
  it('lists every answer, labelled the way the page asked', () => {
    const rows = pendingRows(lead, page)
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      [i18n.t('leads:pending.fName'), 'רותם'],
      [i18n.t('leads:pending.fPhone'), '0521234567'],
      ['מתי נוח?', 'בערבים'],
      ['f_goal', 'גמישות'],
    ])
  })

  it('shows the source page and asks before rejecting', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onReject = jest.fn()
    const onApprove = jest.fn()
    wrap(<PendingLeadsSection pending={[lead]} pages={[page]} onApprove={onApprove} onReject={onReject} />)
    expect(screen.getByText(i18n.t('leads:pending.from', { page: 'שיעור ניסיון' }))).toBeTruthy()

    fireEvent.press(screen.getByLabelText(i18n.t('leads:pending.reject')))
    expect(onReject).not.toHaveBeenCalled()
    alert.mock.calls[0][2].find((b) => b.style === 'destructive').onPress()
    expect(onReject).toHaveBeenCalledWith(lead)

    fireEvent.press(screen.getByText(i18n.t('leads:pending.approve')))
    expect(onApprove).toHaveBeenCalledWith(lead)
    alert.mockRestore()
  })
})

describe('follow-up from the card', () => {
  it('sets tomorrow as a local date and closes', async () => {
    const onSave = jest.fn(async () => {})
    const onClose = jest.fn()
    wrap(<LeadFollowupSheet open lead={{ name: 'רותם' }} onSave={onSave} onClose={onClose} />)
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('leads:followup.tomorrow'))) })
    const d = new Date(); d.setDate(d.getDate() + 1)
    expect(onSave).toHaveBeenCalledWith(ymd(d))
    expect(onClose).toHaveBeenCalled()
  })

  it('offers "done" only when a date is set, and it clears the date', async () => {
    const onSave = jest.fn(async () => {})
    const { rerender } = wrap(<LeadFollowupSheet open lead={{ name: 'x' }} onSave={onSave} onClose={jest.fn()} />)
    expect(screen.queryByText(i18n.t('leads:followup.markDone'))).toBeNull()
    rerender(<SafeAreaProvider initialMetrics={METRICS}><LeadFollowupSheet open lead={{ name: 'x', follow_up_date: '2026-09-20' }} onSave={onSave} onClose={jest.fn()} /></SafeAreaProvider>)
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('leads:followup.markDone'))) })
    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('keeps the sheet open and says so when saving fails', async () => {
    const onClose = jest.fn()
    wrap(<LeadFollowupSheet open lead={{ name: 'x' }} onSave={async () => { throw new Error('offline') }} onClose={onClose} />)
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('leads:followup.week'))) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(i18n.t('leads:followup.saveFailed', { error: 'offline' }))).toBeTruthy()
  })
})
