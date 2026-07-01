/* ════════════════════════════════════════════════════════════════
   SITE BUILDER NAMESPACE — self-registering i18n bundle.
   ════════════════════════════════════════════════════════════════
   There is no central `siteBuilder` namespace in src/i18n/index.js, so this
   tiny side-effect module registers it the same way bookingI18n.js does:
   import the locale JSONs and addResourceBundle (deep+overwrite false →
   idempotent no-op if already present). Imported for its side effect at the
   top of every page-builder screen (site-pages hub + Editor + the public
   site-page + SiteRenderer) so the bundle is live before any of them renders,
   and components can `useT('siteBuilder')`.

   he is the source; en + es + fr are full. (i18next falls back to its
   base/EN resolution if a locale is later requested without a bundle.)
   ════════════════════════════════════════════════════════════════ */
import i18n from '../../i18n'
import heSiteBuilder from '../../i18n/locales/he/siteBuilder.json'
import enSiteBuilder from '../../i18n/locales/en/siteBuilder.json'
import esSiteBuilder from '../../i18n/locales/es/siteBuilder.json'
import frSiteBuilder from '../../i18n/locales/fr/siteBuilder.json'

i18n.addResourceBundle('he', 'siteBuilder', heSiteBuilder, true, false)
i18n.addResourceBundle('en', 'siteBuilder', enSiteBuilder, true, false)
i18n.addResourceBundle('es', 'siteBuilder', esSiteBuilder, true, false)
i18n.addResourceBundle('fr', 'siteBuilder', frSiteBuilder, true, false)
