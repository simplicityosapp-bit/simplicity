/* ════════════════════════════════════════════════════════════════
   GROUPS ON THE PHONE — a weekly slot, a new card, a delete that asks
   ════════════════════════════════════════════════════════════════
   Pinned:
     · the group form writes the weekly slot, and clears its times and
       dates when no day is picked;
     · a new card previews the quota and the money before saving, and
       saves core renewedCard's numbers;
     · the delete sheet offers a choice only for what exists, and hands
       back the chosen keeps.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import AddGroupModal from '../src/modals/AddGroupModal'
import AddMemberSessionsModal from '../src/modals/AddMemberSessionsModal'
import DeleteGroupModal from '../src/modals/DeleteGroupModal'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const wrap = (node) => render(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>)

describe('group form', () => {
  const group = { id: 'g1', name: 'בוקר', billing_mode: 'none', recurring_day: 2, recurring_time: '18:00:00', recurring_end_time: null }

  it('saves the weekly slot', async () => {
    const onSave = jest.fn(async () => {})
    wrap(<AddGroupModal open group={group} onClose={jest.fn()} onSave={onSave} />)
    fireEvent.changeText(screen.getByLabelText(i18n.t('modalsClient:editGroup.endTime')), '19:30')
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsClient:common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ recurring_day: 2, recurring_time: '18:00', recurring_end_time: '19:30' }))
  })

  it('clears the slot with the day', async () => {
    const onSave = jest.fn(async () => {})
    wrap(<AddGroupModal open group={group} onClose={jest.fn()} onSave={onSave} />)
    fireEvent.press(screen.getByText(i18n.t('modalsClient:common.day2')))
    fireEvent.press(screen.getAllByText(i18n.t('modalsClient:common.none')).at(-1))
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsClient:common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ recurring_day: null, recurring_time: null, recurring_end_time: null }))
  })
})

describe('a new card for one member', () => {
  it('previews quota and money, then saves renewedCard\'s numbers', async () => {
    const onSave = jest.fn(async () => {})
    wrap(<AddMemberSessionsModal open onClose={jest.fn()} onSave={onSave} memberName="נופר" groupName="בוקר" unitPrice={100} currentQuota={10} currentTotal={1000} />)
    fireEvent.changeText(screen.getByLabelText(i18n.t('modalsClient:memberSessions.howMany')), '5')
    expect(screen.getByText(i18n.t('modalsClient:memberSessions.previewQuota', { from: 10, to: 15 }))).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsClient:common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quota: 15, total: 1500, count: 5 }))
  })

  it('asks for a count', async () => {
    const onSave = jest.fn()
    wrap(<AddMemberSessionsModal open onClose={jest.fn()} onSave={onSave} unitPrice={100} />)
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsClient:common.save'))) })
    expect(screen.getByText(i18n.t('modalsClient:memberSessions.countRequired'))).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('the delete sheet', () => {
  it('offers only what exists and returns the choices', async () => {
    const onConfirm = jest.fn(async () => {})
    wrap(<DeleteGroupModal open group={{ id: 'g1', name: 'בוקר' }} counts={{ members: 2, futureMeetings: 0, pastSessions: 3, reminders: 0 }} onClose={jest.fn()} onConfirm={onConfirm} />)
    expect(screen.queryByText(i18n.t('modalsClient:deleteGroup.futureMeetings', { count: 0 }))).toBeNull()
    fireEvent.press(screen.getByText(i18n.t('modalsClient:deleteGroup.membersDelete')))
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsClient:deleteGroup.confirm'))) })
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ keepMembers: false, keepPastSessions: true }))
  })
})
