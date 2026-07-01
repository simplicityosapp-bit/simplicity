# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Security maintenance (OD-11)

- **`xlsx` (SheetJS) is pinned to a CDN tarball**, not the npm registry — so `npm audit` does NOT cover it. SheetJS publishes only via their CDN (the npm-registry build is stale), so the pin is correct, but a future advisory won't surface automatically. **Set a recurring (e.g. monthly) reminder** to check <https://cdn.sheetjs.com/> / SheetJS advisories and bump `package.json` when a security release lands. Install with `npm ci` so the lockfile's integrity hash is enforced.
- **Test/audit accounts:** prefer ephemeral accounts — `node supabase/create-test-user.mjs` to create, then `node supabase/delete-test-user.mjs` to tear down — instead of keeping a permanent `claude-audit@` user on the production project.

Full security review and decisions: `docs/security-review-2026-06.md`.
