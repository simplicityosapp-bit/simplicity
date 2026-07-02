import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from '../screens/HomeScreen'
import StubScreen from '../screens/StubScreen'
import TasksScreen from '../screens/TasksScreen'

// Authenticated stack. Home is the root; each screen carries its own header
// (headerShown: false) to keep the Mångata look. The feature screens are stubs
// for now — they give the home widgets real navigation targets and get fleshed
// out (real content) in later increments.
const Stack = createNativeStackNavigator()

// Still-stub feature screens (Tasks is now real).
const STUB_SCREENS = ['Finance', 'Calendar', 'Clients', 'Goals', 'Leads', 'Moon']

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Tasks" component={TasksScreen} />
        {STUB_SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} component={StubScreen} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
