/* Consent versions and helpers — from @simplicity/core/domain/legal, the one
   source both apps read. This file used to hold its own copy of the three
   versions under a "keep in sync with web" comment, and the phone had no
   re-acceptance gate, so a phone-only user never saw a policy change. The gate
   is components/ConsentGate now; this stays as the import path the app uses. */
export {
  PRIVACY_VERSION,
  DPA_VERSION,
  TERMS_VERSION,
  buildConsent,
  buildReacceptance,
  needsReacceptance,
  consentRowsFromMetadata,
} from '@simplicity/core'
