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

export const navigationRef = createNavigationContainerRef()

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

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
        <Tab.Screen name="Clients" component={ClientsScreen} />
        <Tab.Screen name="Tasks" component={TasksScreen} />
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Finance" component={FinanceScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      {/* Same reasoning as the tabs: a native stack keeps the screens below the
          top one mounted, and a dozen of them re-rendering behind the one on
          screen is paid for on every transition. */}
      <Stack.Navigator screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Leads" component={LeadsScreen} />
        <Stack.Screen name="Calendar" component={CalendarScreen} />
        <Stack.Screen name="Moon" component={MoonScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Trash" component={TrashScreen} />
        <Stack.Screen name="Projects" component={ProjectsScreen} />
        <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
        <Stack.Screen name="Reports" component={ReportsScreen} />
        <Stack.Screen name="Insights" component={InsightsScreen} />
        <Stack.Screen name="Pages" component={PagesScreen} />
        <Stack.Screen name="Connections" component={ConnectionsScreen} />
        <Stack.Screen name="Help" component={HelpScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
