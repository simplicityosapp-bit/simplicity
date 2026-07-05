import { createContext, useContext, useState } from 'react'

// App-level "עוד" drawer open state, shared between the bottom bar's תפריט
// button (opens it) and the App-level DrawerHost overlay (renders it above the
// whole navigator). Avoids RN Modal portal quirks.
const DrawerContext = createContext({ open: false, setOpen: () => {} })

export function DrawerProvider({ children }) {
  const [open, setOpen] = useState(false)
  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>
}

export const useDrawer = () => useContext(DrawerContext)
