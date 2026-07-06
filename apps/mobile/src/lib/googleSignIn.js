// Google Sign-In — DEFAULT (web + test/Node) stub.
//
// The real implementation lives in googleSignIn.native.js and pulls in
// @react-native-google-signin/google-signin, a native module that does NOT exist
// on react-native-web or under the Node test runner. Metro resolves the
// `.native.js` variant for iOS/Android and falls back to THIS file everywhere
// else, so the native import never reaches web/Node and the RN-web smoke build
// (and any core tests) stay green.
//
// `googleAvailable` is false here, so LoginScreen renders the Google button
// inert (disabled) on web instead of executing native code.

export const googleAvailable = false

// eslint-disable-next-line no-unused-vars
export async function signInWithGoogle() {
  // Never reached in practice — the button is disabled when !googleAvailable.
  return { error: null }
}
