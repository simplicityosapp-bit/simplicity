/* Brand splash shown while the auth session is being resolved or any
   route is waiting on initial data. The logo IS a heart with a two-step
   "lub-dub" scale rhythm, encircled by the brand ensō, which draws
   itself around the logo while loading. Theme picks the white-on-dark
   or black-on-light logo variant via CSS. */
import { Box, Txt } from './ui'

export default function LoadingSplash({ label, transparent = false }) {
  return (
    <Box className={`splash${transparent ? ' splash--transparent' : ''}`} role="status" aria-live="polite">
      <Box className="splash-emblem">
        <img className="splash-enso" src="/loading-enso.png" alt="" aria-hidden="true" />
        <Box className="splash-logo-wrap">
          <img className="splash-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
          <img className="splash-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
        </Box>
      </Box>
      {label && <Txt as="p" className="splash-label">{label}</Txt>}
    </Box>
  )
}
