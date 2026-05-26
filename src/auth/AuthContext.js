import { createContext, useContext } from 'react'

/* Auth context — kept in a JS (non-component) file so fast-refresh stays happy. */
export const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)
