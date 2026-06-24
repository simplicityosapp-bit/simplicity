/* ════════════════════════════════════════════════════════════════
   BOOKING NAMESPACE — self-registering i18n bundle.
   ════════════════════════════════════════════════════════════════
   There is no central `booking` namespace in src/i18n/index.js, so this
   tiny side-effect module registers it the same way goalPresets.js does:
   import the locale JSONs and addResourceBundle (deep+overwrite false →
   idempotent no-op if already present). Imported for its side effect at
   the top of BOTH booking screens (booking-pages + booking-page) so the
   bundle is live before either renders, and components can `useT('booking')`.

   he is the source; en + es + fr are full. (i18next falls back to its
   base/EN resolution if a locale is later requested without a bundle.)
   ════════════════════════════════════════════════════════════════ */
import i18n from '../../i18n'
import heBooking from '../../i18n/locales/he/booking.json'
import enBooking from '../../i18n/locales/en/booking.json'
import esBooking from '../../i18n/locales/es/booking.json'
import frBooking from '../../i18n/locales/fr/booking.json'

i18n.addResourceBundle('he', 'booking', heBooking, true, false)
i18n.addResourceBundle('en', 'booking', enBooking, true, false)
i18n.addResourceBundle('es', 'booking', esBooking, true, false)
i18n.addResourceBundle('fr', 'booking', frBooking, true, false)
