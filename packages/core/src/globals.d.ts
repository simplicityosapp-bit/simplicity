/* ════════════════════════════════════════════════════════════════
   AMBIENT GLOBALS — the platform surface this package is allowed.
   ════════════════════════════════════════════════════════════════
   tsconfig here sets `lib: ["ES2022"]` and `types: []` deliberately:
   @simplicity/core is shared by the web app and the Expo app, so the
   typechecker must reject anything browser-only that creeps in. That
   guard is why `tsc --noEmit` did not know `console` either, and why
   the package's typecheck has been failing on the one console.warn it
   contains.

   Adding "DOM" to `lib` would have silenced it by handing the package
   every browser API at once — removing the guard rather than satisfying
   it. So: declare the one global actually used, and only the methods
   used. Anything else still fails to compile, which is the point.

   `console` is not in any ES lib, but every runtime this package runs
   in — browser, Node, Hermes — provides it.
   ════════════════════════════════════════════════════════════════ */

declare const console: {
  warn(...data: unknown[]): void
  error(...data: unknown[]): void
}
