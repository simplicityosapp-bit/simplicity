// @simplicity/core
//
// Platform-agnostic business logic shared by apps/web and apps/mobile.
// Real modules are migrated here incrementally, in this planned order:
//   - domain/  pure logic: billing, money, dates, analytics formulas
//   - api/     Supabase client factory + data-access + pagination
//   - hooks/   React Query hooks (both apps are React)
//   - i18n/    shared locales he/en/es/fr + namespaces
//
// Nothing consumes this package yet — the existing web build is untouched.

export {};
