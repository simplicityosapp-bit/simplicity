import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, Users, ClipboardList, Wallet, Menu } from 'lucide-react-native'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { useDrawer } from '../lib/drawer'
import HomeScreen from '../screens/HomeScreen'
import ClientsScreen from '../screens/ClientsScreen'
import TasksScreen from '../screens/TasksScreen'
import FinanceScreen from '../screens/FinanceScreen'
import GoalsScreen from '../screens/GoalsScreen'
import LeadsScreen from '../screens/LeadsScreen'
import CalendarScreen from '../screens/CalendarScreen'
import QuestionsScreen from '../screens/QuestionsScreen'
import StubScreen from '../screens/StubScreen'

export const navigationRef = createNavigationContainerRef()

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// Bottom bar mirrors the web BOTTOM_NAV: clients · tasks · HOME(center) ·
// finance · תפריט. Declared in that order so Home sits centre (and flips
// correctly on an RTL device). תפריט opens the Drawer overlay, not a tab.
const TAB_ICON = { Home, Clients: Users, Tasks: ClipboardList, Finance: Wallet, Menu }
const tabTitle = (key, fallback) => i18n.t(`nav:items.${key}`, { defaultValue: fallback })
const EmptyScreen = () => null

function Tabs() {
  const { setOpen } = useDrawer()
  return (
    <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textSub,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 60, paddingBottom: 6, paddingTop: 6 },
          tabBarLabelStyle: { fontSize: 11 },
          tabBarIcon: ({ color, size }) => {
            const Icon = TAB_ICON[route.name]
            return Icon ? <Icon size={size ?? 22} color={color} strokeWidth={1.6} /> : null
          },
        })}
      >
        <Tab.Screen name="Clients" component={ClientsScreen} options={{ title: tabTitle('clients', 'לקוחות') }} />
        <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: tabTitle('tasks', 'משימות') }} />
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: tabTitle('home', 'בית') }} />
        <Tab.Screen name="Finance" component={FinanceScreen} options={{ title: tabTitle('finance', 'כסף') }} />
        <Tab.Screen
          name="Menu"
          component={EmptyScreen}
          options={{ title: i18n.t('nav:menu', { defaultValue: 'תפריט' }), tabBarIcon: ({ color, size }) => <Menu size={size ?? 22} color={color} strokeWidth={1.6} /> }}
          listeners={{ tabPress: (e) => { e.preventDefault(); setOpen(true) } }}
        />
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
        <Stack.Screen name="Moon" component={StubScreen} />
        <Stack.Screen name="Questions" component={QuestionsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
