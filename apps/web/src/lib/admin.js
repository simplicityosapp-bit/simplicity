/* Who is an admin — see packages/core/src/domain/admin.ts.

   Moved to core when the phone got its own console: both apps have to
   gate on exactly the same rule, and two copies of "who may see this"
   drift in the one direction nobody notices. This file stays as the
   import path the web app already uses. */
export { ADMIN_EMAIL, isOwnerUser, isAdminUser, adminPerms } from '@simplicity/core'
