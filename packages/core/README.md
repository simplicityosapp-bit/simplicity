# @simplicity/core

Platform-agnostic business logic shared by `apps/web` and `apps/mobile`.

TypeScript, **no build step** — the package exposes raw `.ts` from `src/` via the
`exports` map, and each consuming app's bundler (Vite for web, Metro for mobile)
transpiles it. This is the "internal / just-in-time" package pattern.

## What lives here (migrated incrementally)

| Module     | Contents                                                        |
| ---------- | --------------------------------------------------------------- |
| `domain/`  | Pure logic: billing, money, dates, analytics formulas          |
| `api/`     | Supabase client factory, data-access, pagination               |
| `hooks/`   | React Query hooks (both apps are React)                         |
| `i18n/`    | Shared locales (he/en/es/fr) + namespaces                       |

Rules: no DOM, no React Native, no `window`/`document`. Anything imported here
must run unchanged on both platforms.

## Scripts

```sh
pnpm --filter @simplicity/core typecheck
```
