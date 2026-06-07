/* Brand splash shown while the auth session is being resolved or any
   route is waiting on initial data. The logo IS a heart with a two-step
   "lub-dub" scale rhythm, encircled by the brand ensō, which draws
   itself around the logo while loading. Theme picks the white-on-dark
   or black-on-light logo variant via CSS. */
export default function LoadingSplash({ label, transparent = false }) {
  return (
    <div className={`splash${transparent ? ' splash--transparent' : ''}`} role="status" aria-live="polite">
      <div className="splash-emblem">
        <img className="splash-enso" src="/loading-enso.png" alt="" aria-hidden="true" />
        <div className="splash-logo-wrap">
          <img className="splash-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
          <img className="splash-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
        </div>
      </div>
      {label && <p className="splash-label">{label}</p>}
    </div>
  )
}
