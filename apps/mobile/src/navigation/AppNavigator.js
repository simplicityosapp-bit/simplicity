import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import i18n from '../lib/i18n'
import BottomBar from '../components/BottomBar'
import HomeScreen from '../screens/HomeScreen'
import ClientsScreen from '../screens/ClientsScreen'
import TasksScreen from '../screens/TasksScreen'
import FinanceScreen from '../screens/FinanceScreen'
import GoalsScreen from '../screens/GoalsScreen'
import LeadsScreen from '../screens/LeadsScreen'
import CalendarScreen from '../screens/CalendarScreen'
import QuestionsScreen from '../screens/QuestionsScreen'
import MoonScreen from '../screens/MoonScreen'
import SettingsScreen from '../screens/SettingsScreen'
import TrashScreen from '../screens/TrashScreen'
import ProjectsScreen from '../screens/ProjectsScreen'
import ProjectDetailScreen from '../screens/ProjectDetailScreen'
import ReportsScreen from '../screens/ReportsScreen'
import InsightsScreen from '../screens/InsightsScreen'

export const navigationRef = createNavigationContainerRef()

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// Bottom bar mirrors the web BOTTOM_NAV: clients · tasks · HOME(center) ·
// finance · תפריט. Rendered by the custom dark-glass BottomBar (per-tab colored
// chips); תפריט opens the Drawer overlay, not a tab.
const EmptyScreen = () => null

function Tabs() {
  return (
    <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <BottomBar {...props} />}
      >
        <Tab.Screen name="Clients" component={ClientsScreen} />
        <Tab.Screen name="Tasks" component={TasksScreen} />
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Finance" component={FinanceScreen} />
        <Tab.Screen name="Menu" component={EmptyScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Leads" component={LeadsScreen} />
        <Stack.Screen name="Calendar" component={CalendarScreen} />
        <Stack.Screen name="Moon" component={MoonScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Questions" component={QuestionsScreen} />
        <Stack.Screen name="Trash" component={TrashScreen} />
        <Stack.Screen name="Projects" component={ProjectsScreen} />
        <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
        <Stack.Screen name="Reports" component={ReportsScreen} />
        <Stack.Screen name="Insights" component={InsightsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
