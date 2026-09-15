/* ════════════════════════════════════════════════════════════════
   LEAD SEARCH — lives in @simplicity/core/domain/leadSearch now.
   ════════════════════════════════════════════════════════════════
   The phone's board had kept the case-sensitive, name-only search this
   module was written to replace. One implementation for both boards;
   re-exported here because this is where the screen and its test import it.
   ════════════════════════════════════════════════════════════════ */
export { matchLead, leadLookups } from '@simplicity/core'
