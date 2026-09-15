import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import HomeScreen from '../screens/HomeScreen'
import ClientsScreen from '../screens/ClientsScreen'
import TasksScreen from '../screens/TasksScreen'
import FinanceScreen from '../screens/FinanceScreen'
import GoalsScreen from '../screens/GoalsScreen'
import LeadsScreen from '../screens/LeadsScreen'
import CalendarScreen from '../screens/CalendarScreen'
import MoonScreen from '../screens/MoonScreen'
import SettingsScreen from '../screens/SettingsScreen'
import TrashScreen from '../screens/TrashScreen'
import ProjectsScreen from '../screens/ProjectsScreen'
import ProjectDetailScreen from '../screens/ProjectDetailScreen'
import ReportsScreen from '../screens/ReportsScreen'
import InsightsScreen from '../screens/InsightsScreen'
import PagesScreen from '../screens/PagesScreen'
import ConnectionsScreen from '../screens/ConnectionsScreen'
import HelpScreen from '../screens/HelpScreen'
import AdminScreen from '../screens/AdminScreen'
import { withScreenBoundary } from '../components/ScreenBoundary'
import { linking } from './linking'

export const navigationRef = createNavigationContainerRef()

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

/* Every screen behind its own boundary (components/ScreenBoundary), so one
   screen's render bug leaves the rest of the app usable. Wrapped once, here,
   so the components keep a stable identity. */
const S = {
  Home: withScreenBoundary(HomeScreen),
  Clients: withScreenBoundary(ClientsScreen),
  Tasks: withScreenBoundary(TasksScreen),
  Finance: withScreenBoundary(FinanceScreen),
  Goals: withScreenBoundary(GoalsScreen),
  Leads: withScreenBoundary(LeadsScreen),
  Calendar: withScreenBoundary(CalendarScreen),
  Moon: withScreenBoundary(MoonScreen),
  Settings: withScreenBoundary(SettingsScreen),
  Trash: withScreenBoundary(TrashScreen),
  Projects: withScreenBoundary(ProjectsScreen),
  ProjectDetail: withScreenBoundary(ProjectDetailScreen),
  Reports: withScreenBoundary(ReportsScreen),
  Insights: withScreenBoundary(InsightsScreen),
  Pages: withScreenBoundary(PagesScreen),
  Connections: withScreenBoundary(ConnectionsScreen),
  Help: withScreenBoundary(HelpScreen),
  Admin: withScreenBoundary(AdminScreen),
}

// The 4 primary tab routes. The bottom bar itself is rendered ONCE at the App
// level (see components/BottomBar) as a persistent overlay over every screen, so
// here the tab navigator's own bar is suppressed (tabBar → null). Order mirrors
// web BOTTOM_NAV: clients · tasks · HOME(center) · finance (תפריט = drawer).
function Tabs() {
  return (
    <Tab.Navigator
        initialRouteName="Home"
        /* freezeOnBlur: a tab navigator keeps every visited screen MOUNTED, so
           without this any state a shared hook publishes re-renders all four of
           them, on every change, forever. react-native-screens is already a
           dependency; this is the switch that makes it stop rendering the three
           nobody is looking at. */
        screenOptions={{ headerShown: false, freezeOnBlur: true }}
        tabBar={() => null}
      >
        <Tab.Screen name="Clients" component={S.Clients} />
        <Tab.Screen name="Tasks" component={S.Tasks} />
        <Tab.Screen name="Home" component={S.Home} />
        <Tab.Screen name="Finance" component={S.Finance} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {/* Same reasoning as the tabs: a native stack keeps the screens below the
          top one mounted, and a dozen of them re-rendering behind the one on
          screen is paid for on every transition. */}
      <Stack.Navigator screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="Goals" component={S.Goals} />
        <Stack.Screen name="Leads" component={S.Leads} />
        <Stack.Screen name="Calendar" component={S.Calendar} />
        <Stack.Screen name="Moon" component={S.Moon} />
        <Stack.Screen name="Settings" component={S.Settings} />
        <Stack.Screen name="Trash" component={S.Trash} />
        <Stack.Screen name="Projects" component={S.Projects} />
        <Stack.Screen name="ProjectDetail" component={S.ProjectDetail} />
        <Stack.Screen name="Reports" component={S.Reports} />
        <Stack.Screen name="Insights" component={S.Insights} />
        <Stack.Screen name="Pages" component={S.Pages} />
        <Stack.Screen name="Connections" component={S.Connections} />
        <Stack.Screen name="Help" component={S.Help} />
        <Stack.Screen name="Admin" component={S.Admin} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
