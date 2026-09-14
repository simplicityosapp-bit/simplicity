/* The group-membership rule lives in @simplicity/core (domain/groupMembership)
   so the phone applies the same one — its add and edit forms wrote the
   client's group tag and never a group_members row, the drift this rule was
   written to end. Re-exported here because every web caller, and the tests,
   import it from this path. */
export {
  newMembership,
  groupMembershipPlan,
  membershipQuota,
  membershipDues,
  packageUnitPrice,
  renewedCard,
  nextGroupTag,
} from '@simplicity/core'
