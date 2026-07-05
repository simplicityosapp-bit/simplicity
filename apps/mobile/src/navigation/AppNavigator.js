import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, Users, ClipboardList, Wallet, Menu } from 'lucide-react-native'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import HomeScreen from '../screens/HomeScreen'
import ClientsScreen from '../screens/ClientsScreen'
import TasksScreen from '../screens/TasksScreen'
import FinanceScreen from '../screens/FinanceScreen'
import GoalsScreen from '../screens/GoalsScreen'
import LeadsScreen from '../screens/LeadsScreen'
import CalendarScreen from '../screens/CalendarScreen'
import MenuScreen from '../screens/MenuScreen'
import StubScreen from '../screens/StubScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// Bottom bar matches the web: clients · tasks · home · finance · תפריט. Each tab
// screen carries its own header; feature screens off the bar (Goals/Leads/
// Calendar/Moon) are pushed onto the root stack (from the Menu tab or a widget).
const TAB_ICON = { Home, Clients: Users, Tasks: ClipboardList, Finance: Wallet, Menu }
const tabTitle = (key, fallback) => i18n.t(`nav:items.${key}`, { defaultValue: fallback })

function Tabs() {
  return (
    <Tab.Navigator
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
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: tabTitle('home', 'בית') }} />
      <Tab.Screen name="Clients" component={ClientsScreen} options={{ title: tabTitle('clients', 'לקוחות') }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: tabTitle('tasks', 'משימות') }} />
      <Tab.Screen name="Finance" component={FinanceScreen} options={{ title: tabTitle('finance', 'כסף') }} />
      <Tab.Screen name="Menu" component={MenuScreen} options={{ title: i18n.t('nav:menu', { defaultValue: 'תפריט' }) }} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Leads" component={LeadsScreen} />
        <Stack.Screen name="Calendar" component={CalendarScreen} />
        <Stack.Screen name="Moon" component={StubScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
