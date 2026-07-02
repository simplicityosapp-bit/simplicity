import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from '../screens/HomeScreen'
import StubScreen from '../screens/StubScreen'

// Authenticated stack. Home is the root; each screen carries its own header
// (headerShown: false) to keep the Mångata look. The feature screens are stubs
// for now — they give the home widgets real navigation targets and get fleshed
// out (real content) in later increments.
const Stack = createNativeStackNavigator()

const FEATURE_SCREENS = ['Finance', 'Calendar', 'Clients', 'Goals', 'Tasks', 'Leads']

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        {FEATURE_SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} component={StubScreen} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
