/* ════════════════════════════════════════════════════════════════
   CLIENTS ON THE PHONE — templates, groups, sub-statuses
   ════════════════════════════════════════════════════════════════
   · WhatsApp: the coach could edit message templates on the phone and
     nothing on the phone used them. useWhatsAppMessage is web's hook.
   · Grouping by group: a 'group' grouping set on web came back as
     status here. A client in two groups appears under both; a client in
     none lands under "no group"; list keys stay unique.
   · The card names the client's group.
   · Sub-statuses: grouped under all four statuses, renamed by tapping
     the name, added per group.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/drawers/ClientDrawer', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddClientModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: {} }),
  useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
  useFocusEffect: () => {},
}))

const mockPrefs = { current: {} }
jest.mock('../src/lib/preferences', () => ({
  usePreferences: () => ({ prefs: mockPrefs.current, update: (patch) => { Object.assign(mockPrefs.current, patch) } }),
}))
jest.mock('../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ prefs: mockPrefs.current, update: (patch) => { Object.assign(mockPrefs.current, patch) } }),
}))

const client = (id, name) => ({ id, name, project_id: null, status_meta: 'active', status_overridden: true, created_at: '2026-01-01', billing_mode: 'none' })
jest.mock('../src/hooks/useClientsList', () => ({
  useClientsList: () => ({
    clients: [client('c1', 'נופר'), client('c2', 'רעות'), client('c3', 'שירה')],
    transactions: [], sessions: [], tasks: [], reminders: [],
    groups: [
      { id: 'g1', name: 'בוקר', color: '#8BA888', billing_mode: 'none' },
      { id: 'g2', name: 'ערב', color: '#D4A574', billing_mode: 'none' },
    ],
    members: [
      { id: 'm1', client_id: 'c1', group_id: 'g1' },
      { id: 'm2', client_id: 'c1', group_id: 'g2' },
      { id: 'm3', client_id: 'c2', group_id: 'g2' },
    ],
    loading: false, error: null, refetch: jest.fn(),
    addClient: jest.fn(), addTransaction: jest.fn(), addSession: jest.fn(), updateClient: jest.fn(), deleteClient: jest.fn(),
    updateSession: jest.fn(), deleteSession: jest.fn(), updateTask: jest.fn(), deleteTask: jest.fn(),
    updateTransaction: jest.fn(), deleteTransaction: jest.fn(), restoreTransaction: jest.fn(),
    updateReminder: jest.fn(), deleteReminder: jest.fn(), updateMember: jest.fn(),
  }),
}))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ projects: [], categories: [] }) }))
const mockTax = {
  clientStatuses: [
    { id: 's1', meta_category: 'active', display_name: 'בתהליך', is_default: true },
    { id: 's2', meta_category: 'no_status', display_name: 'ממתין', is_default: false },
  ],
  addClientStatus: jest.fn(async () => ({})),
  updateClientStatus: jest.fn(async () => {}),
  removeClientStatus: jest.fn(), clientIdsWithStatus: jest.fn(async () => []),
  reassignClientsStatusByIds: jest.fn(), restoreClientStatus: jest.fn(),
}
jest.mock('../src/hooks/useConfigTaxonomy', () => ({ useConfigTaxonomy: () => mockTax }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import ClientsScreen from '../src/screens/ClientsScreen'
import { useWhatsAppMessage } from '../src/hooks/useWhatsAppMessage'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderClients = () => render(<SafeAreaProvider initialMetrics={METRICS}><ClientsScreen /></SafeAreaProvider>)

beforeEach(() => { mockPrefs.current = {} })

describe('WhatsApp templates', () => {
  it('fills the coach\'s own template when one is saved', () => {
    mockPrefs.current = { whatsapp: { templates: { payment: 'היי {{name}}, נשאר {{balance}}' } } }
    const { result } = renderHook(() => useWhatsAppMessage())
    expect(result.current('payment', { name: 'דנה', balance: '₪200' })).toBe('היי דנה, נשאר ₪200')
  })

  it('falls back to the default text for the key', () => {
    const { result } = renderHook(() => useWhatsAppMessage())
    expect(result.current('lead', { name: 'דנה' })).toBe(i18n.t('components:whatsapp.defaults.lead', { name: 'דנה' }))
  })
})

describe('grouping by group', () => {
  it('files a client under each of their groups, and the rest under "no group"', () => {
    mockPrefs.current = { clientsGroupBy: 'group' }
    renderClients()
    // Group headings, in the groups' own order, then the "none" bucket.
    expect(screen.getAllByText('בוקר').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ערב').length).toBeGreaterThan(0)
    expect(screen.getByText(i18n.t('clients:groupBy.noGroup'))).toBeTruthy()
    // נופר is in both groups, so her card appears twice.
    expect(screen.getAllByText('נופר')).toHaveLength(2)
    expect(screen.getAllByText('שירה')).toHaveLength(1)
  })

  it('names the group on the card — one by name, several by count', () => {
    renderClients()
    expect(screen.getByText(i18n.t('clients:card.groupCount', { count: 2 }))).toBeTruthy()
    expect(screen.getAllByText('ערב').length).toBeGreaterThan(0)
  })
})

describe('sub-status editor', () => {
  const open = () => {
    renderClients()
    act(() => { fireEvent.press(screen.getByText(i18n.t('clients:statuses.link'))) })
  }

  it('lists sub-statuses under all four status groups, no_status included', () => {
    open()
    expect(screen.getByText('בתהליך')).toBeTruthy()
    expect(screen.getByText('ממתין')).toBeTruthy()
    expect(screen.getByPlaceholderText(i18n.t('clients:statuses.placeholder', { meta: i18n.t('clients:status.noStatus') }))).toBeTruthy()
  })

  it('renames by tapping the name', async () => {
    open()
    act(() => { fireEvent.press(screen.getByLabelText(i18n.t('clients:statuses.renameAria', { name: 'בתהליך' }))) })
    fireEvent.changeText(screen.getByDisplayValue('בתהליך'), 'בליווי')
    await act(async () => { fireEvent.press(screen.getByLabelText(i18n.t('clients:statuses.saveName'))) })
    expect(mockTax.updateClientStatus).toHaveBeenCalledWith('s1', { display_name: 'בליווי' })
  })

  it('adds under the group whose field was used', async () => {
    open()
    const field = screen.getByPlaceholderText(i18n.t('clients:statuses.placeholder', { meta: i18n.t('clients:status.past') }))
    fireEvent.changeText(field, 'סיימו')
    await act(async () => { fireEvent(field, 'submitEditing') })
    expect(mockTax.addClientStatus).toHaveBeenCalledWith('סיימו', 'past')
  })

  it('offers delete on a default sub-status too', () => {
    open()
    expect(screen.getByLabelText(i18n.t('clients:statuses.deleteAria', { name: 'בתהליך' }))).toBeTruthy()
  })
})
