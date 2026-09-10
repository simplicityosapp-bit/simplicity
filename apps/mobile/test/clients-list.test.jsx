/* ════════════════════════════════════════════════════════════════
   THE CLIENTS LIST — what a window must still show.
   ════════════════════════════════════════════════════════════════
   This screen used to render every client card at once inside a
   ScrollView. It is now a FlatList, which is a bigger change than it
   looks: the whole header — title, controls, status tabs, search, the
   summary card — became a prop, and the project grouping stopped being
   a wrapper around each group and became rows in the data.

   Three things that break silently if someone refactors this back:

     · the header is passed as an ELEMENT. Pass a component (or an
       inline arrow) instead and FlatList renders it as <Header />, so
       its type changes every render and the search field inside is
       unmounted and rebuilt between keystrokes. The screen looks
       perfect; typing just loses the cursor after one character.
     · the project view has to keep its group headings, which now only
       exist because they were pushed into the data.
     · a list with nothing in it must still show the header. An empty
       state that swallows the search box is a dead end — you cannot
       clear the query that emptied the list.

   Rendered through jest-expo, so this is the real FlatList.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

/* Leaves with no bearing on the list: the frame reaches for a background
   photo and preferences, the drawer and the add sheet for half the app. */
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/drawers/ClientDrawer', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddClientModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: {} }),
  useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
  useFocusEffect: () => {},
}))

const client = (id, name, projectId = null) => ({
  id, name, project_id: projectId, status_meta: 'active', status_overridden: true, created_at: '2026-01-01',
})

const CLIENTS = [
  client('c1', 'נופר אדמון', 'p1'),
  client('c2', 'רעות מדיון', 'p1'),
  client('c3', 'שירה כהן', null),
]

const prefs = { clientsGroupBy: 'status' }
/* Mutable holders so a test can change what the mocked hooks return. The
   'mock' prefix is what lets jest's hoist plugin allow them inside a factory. */
const mockClients = { current: CLIENTS }
const mockPrefs = { current: { ...prefs } }
jest.mock('../src/hooks/useClientsList', () => ({
  useClientsList: () => ({
    clients: mockClients.current, transactions: [], sessions: [], members: [], groups: [], tasks: [], reminders: [],
    loading: false, error: null, refetch: jest.fn(),
    addClient: jest.fn(), addTransaction: jest.fn(), addSession: jest.fn(), updateClient: jest.fn(), deleteClient: jest.fn(),
    updateSession: jest.fn(), deleteSession: jest.fn(), updateTask: jest.fn(), deleteTask: jest.fn(),
    updateTransaction: jest.fn(), deleteTransaction: jest.fn(), restoreTransaction: jest.fn(),
    updateReminder: jest.fn(), deleteReminder: jest.fn(), updateMember: jest.fn(),
  }),
}))
jest.mock('../src/lib/formOptions', () => ({
  useFormOptions: () => ({ projects: [{ id: 'p1', name: 'טיפול פרטני', color: '#8BA888' }], categories: [] }),
}))
jest.mock('../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ prefs: mockPrefs.current, update: (patch) => { Object.assign(mockPrefs.current, patch) } }),
}))
jest.mock('../src/hooks/useConfigTaxonomy', () => ({
  useConfigTaxonomy: () => ({ clientStatuses: [], addClientStatus: jest.fn(), removeClientStatus: jest.fn(), updateClientStatus: jest.fn() }),
}))


// eslint-disable-next-line import/first
import ClientsScreen from '../src/screens/ClientsScreen'


/* ScreenHead reads useSafeAreaInsets, which throws with no provider above it.
   Fixed metrics rather than a device probe, so the header lands in the same
   place every run. */
const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderScreen = () => render(
  <SafeAreaProvider initialMetrics={METRICS}><ClientsScreen /></SafeAreaProvider>,
)
beforeEach(() => {
  mockClients.current = CLIENTS
  mockPrefs.current = { ...prefs }
})

describe('clients list', () => {
  it('renders the header and the client cards together', () => {
    renderScreen()

    // Header survived the move into a list prop…
    expect(screen.getByPlaceholderText(/./)).toBeTruthy()
    // …and the rows are there.
    expect(screen.getByText('נופר אדמון')).toBeTruthy()
    expect(screen.getByText('שירה כהן')).toBeTruthy()
  })

  /* The trap. If the header is ever passed as a component instead of an
     element, this input is a different node after the re-render that
     typing causes — and on a device that is a lost cursor per keystroke. */
  it('keeps the very same search field across a re-render', () => {
    renderScreen()
    const before = screen.getByPlaceholderText(/./)

    act(() => { fireEvent.changeText(before, 'נופר') })

    const after = screen.getByPlaceholderText(/./)
    expect(after).toBe(before)
  })

  it('filters to the typed name and back', () => {
    renderScreen()
    const input = screen.getByPlaceholderText(/./)

    act(() => { fireEvent.changeText(input, 'נופר') })
    expect(screen.getByText('נופר אדמון')).toBeTruthy()
    expect(screen.queryByText('שירה כהן')).toBeNull()

    act(() => { fireEvent.changeText(input, '') })
    expect(screen.getByText('שירה כהן')).toBeTruthy()
  })

  it('still shows the header when the list comes back empty', () => {
    renderScreen()

    act(() => { fireEvent.changeText(screen.getByPlaceholderText(/./), 'אין כזה לקוח') })

    // The search box is the only way out of an empty result.
    expect(screen.getByPlaceholderText(/./)).toBeTruthy()
    expect(screen.queryByText('נופר אדמון')).toBeNull()
  })

  it('keeps the project headings in the project view', () => {
    mockPrefs.current = { clientsGroupBy: 'project' }
    renderScreen()

    /* Both headings are rows in the data now, not wrappers around a group.
       The un-projected bucket is the unambiguous one: a client card only
       prints a project chip when it HAS a project, so 'ללא פרויקט' can only
       have come from a heading row. */
    expect(screen.getByText('ללא פרויקט')).toBeTruthy()
    // The named group: once as its heading, once on each of its two cards.
    expect(screen.getAllByText('טיפול פרטני')).toHaveLength(3)
    expect(screen.getByText('נופר אדמון')).toBeTruthy()
    expect(screen.getByText('שירה כהן')).toBeTruthy()
  })
})
