/* The wa.me helpers live in @simplicity/core (domain/whatsapp) so the phone
   builds the same links — its own copies sent Israeli numbers in their local
   0-prefixed form, which WhatsApp cannot resolve. Re-exported here because
   every web caller, and the tests, import them from this path. */
export {
  normalizeIsraeliPhone,
  waLink,
  fillTemplate,
  resolveMessage,
} from '@simplicity/core'
