# Design-language audit & cleanup — 2026-06-16

Deep sweep of every screen, sub-screen, modal, drawer, widget, and form control
against the Mångata design language (`desingh.checklist.md` + `src/styles/tokens.css`).

**Method:** 21 read-only audit agents (one per UI area) produced 402 structured
findings — 146 "clear" (mechanical, no judgment) and 256 "ambiguous" (need a
design call). Clear fixes were applied (some down-graded to questions where they
turned out to be intentional). Ambiguous findings are consolidated into the
decision list below.

**Verification after fixes:** `vite build` ✓ · `vitest` 210/210 ✓ ·
`eslint` unchanged (41 pre-existing problems, **0 introduced**) · app boots with
no console errors · representative fixes confirmed live via computed styles
(`.m-select` chevron + radius 18, `.s-hero` 20px, `.t-screen` = espresso).

Changes are left **uncommitted in the working tree** (55 files) for review — not pushed.

---

## ✅ Applied (clear, mechanical — bringing chrome onto the language)

- **Selects now have a dropdown affordance.** Added a Lucide chevron (RTL-left,
  light/dark) to the shared `.m-select` (fixes every modal select + ClientFormFields
  app-wide) and to the bespoke selects `.ob-select`, `.conn-event-select`,
  `.mg-ov-select`, `.inv-act-select`, `.usi-select` (`appearance:none` + chevron).
- **Unstyled native segmented control fixed.** `AddGroupModal`/`EditGroupModal`
  billing picker used `.m-seg`/`.m-seg-btn` (undefined → rendered as raw OS buttons);
  switched to the existing `.m-pills`/`.m-pill`.
- **Shared checkbox.** Added reusable `.m-check` (terracotta accent); applied to the
  RecurringModal "פעילה" bare native checkbox.
- **Legacy text tokens → canonical** in shared primitives (`screens.css`:
  `--t1→--espresso`, `--t2/--t3→--stone`) and `MenuDrawer.css` (all `--t1/3/4`,
  plus below-range `font-weight:300 → 400`).
- **Radius / height to spec** (18 / 48) on: admin buttons + delete input, legal
  close/back buttons, connections inputs/buttons, finance `.cat-add-input`,
  `project-detail .gc-sess-date`, `InvoiceActions`, `.s-hero` (24→20). DateField
  given 48px min-height + terracotta/blush focus.
- **Raw hex / raw-rgba-of-a-token → tokens / `color-mix`**: index.css `#030e06→var(--bg)`,
  onboarding `#1a1a1a→var(--ink)`, landing dark knob, `AccountDeletionPending`,
  `UndoToast`, auth error, finance/leads/projects/calendar/connections/home neutral
  greys + sage/clay/espresso tints, InsightsScreen blush, dropped `var(--token,#hex)`
  fallbacks. Pure-black shadows → espresso-based.
- **Pure white in cards → tokens**: HomeScreen insights slider (`#fff→--pure-white`/
  `--on-accent`), `.ins-yn-btn` border → `--mg-card-border`.
- **Decorative emoji removed** from copy/comments (🎉 in CalendarDuplicate/ProfileHealth,
  comment dingbats in MeetingConfirmList) and converted to Lucide where decorative
  (🔁→Repeat, ↪→CornerDownLeft in OnboardingReviewWizard).
- **Text-glyph icons → Lucide**: arrows `←`/`‹`→ArrowLeft/ChevronLeft (calendar, clients,
  finance, reports), carets `▲▼`→ChevronUp/Down (UnifiedSheetImporter), braille `⠿`→
  GripVertical (project-detail).
- **Icon stroke normalized to 1.5** across BottomNav, Sidebar, LegalModal,
  DeleteAccount/ResetAccount, OnboardingShell, tasks, reminders.
- **Legacy color tokens**: `--amber→--amber-warn` (review-wizard badge), dark
  `--danger→--clay` (settings). Currency `₪{price}`→`{price} ₪` (InvoiceActions).

### ⚠️ Audit false-positive caught — NOT changed
`פעיל׌` / `לקוח׌` etc. The `׌` (U+05CC) is the app's **dual-gender ligature glyph**
(`address.js` maps `ה→׌`; `index.css`/`helpContent.js` document it). It renders
"פעיל/ה" via the AlefMG font. One audit agent misread it as garbled — **left intact**.

---

## ❓ Open decisions for the morning (deferred — these "leak" but the call is yours)

Each is a single decision that resolves a whole cluster of findings.

1. **Onboarding sub-theme.** Onboarding deliberately uses **sage** as its
   selection/active/focus accent and **clay** as the primary "הלאה/סיום" CTA, with
   softer 12–14px radii and 700-weight titles (OnboardingReviewWizard is sage too).
   → Sanction the sage/clay forest identity as an official sub-theme, or normalize to
   canonical (terracotta CTA + focus, 18px, 600)? *(I left it untouched pending this.)*

2. **Moon sub-theme bleeding off the moon screen.** `--moon-deep/--moon-hi` are used as
   the active-toggle / link / accent on the home "מה איתך היום" daily-question widget
   (incl. a gradient slider + collapse button), the Insights & Reports toggles/links,
   the Settings widget toggle, and the generic `.mg-toggle`. → Is the blue "reflective"
   accent intentional wherever the daily-question motif appears, or revert to terracotta?

3. **Per-screen color-coding on the nav** (BottomNav + Sidebar + MenuDrawer). Each nav
   item is tinted with one of the 5 brand colors; the sidebar uses a 5-color gradient
   blur; avatars use a purple→cyan gradient; menu links use teal/purple/gold icon chips;
   the theme switch is a sun↔moon gradient. → Keep the per-screen accent system (looks
   deliberate) or flatten to neutral stone-on-glass?

4. **"Assistant" display titles at weight 700.** Screen titles, modal titles, drawer/card
   titles, brand wordmarks, auth titles, help/tour/feedback titles all use Assistant 700.
   The scale officially tops at 600. → Sanction Assistant-700 as the display style, or
   normalize to Heebo 600? (Also: avatar initials & home quote use Assistant — keep?)

5. **Data-viz / category color palette (housekeeping).** The category/project/goal/status
   color swatches are the same raw-hex array duplicated across ~8 modals + `CATEGORY_COLORS`
   + `goalPresets.js`; charts use `--purple/--teal/--gold…`. These legitimately distinguish
   series. → OK to centralize into one shared token-referencing palette (no visual change)?
   Sub-question: income chart line uses `--clay` (danger) and "urgent" task dot uses `--sage`
   (positive) — both read semantically inverted. Reassign?

6. **Iconography system = emoji.** Questions / goals / goal-categories / lead-statuses /
   client-sub-statuses store an **emoji** as their icon (`🫧⚡🌙🎯…`), shown in pickers
   (AddQuestion/AddGoal/AddGoalCategory/… ) and in `<option>` labels, with `🫧`/`⭐`/`📝`
   fallbacks. Checklist says zero emoji. → Keep emoji as user content, or migrate the whole
   system to Lucide (needs a per-icon mapping **and** a data migration of stored values)?
   *(Left untouched — too coupled to the data model to do piecemeal.)*

7. **Attention-tinted cards.** `PendingSection` (amber card+border) and `InvoiceImports`
   (sage card+border) tint the whole card to signal state; the checklist says cards = uniform
   glass. → Sanction semantic attention cards, or revert to glass + signal another way?

8. **Compact-control sizes.** Many small controls use one-off radii (7/8/9/10/11/12/14) and
   heights (28–46px) instead of 18/48 — calendar chips/cells, nav chips, circular 30–34px
   icon-buttons, toasts, coachmark, drill rows. Most are legitimately compact. → Define a
   small set of sanctioned compact tokens (chip-radius, icon-button-size) and snap these to it?

9. **Legacy auth screens.** ResetPassword/UpdatePassword still use a parallel
   `.auth-input/.auth-card` system (radius 12/22, **sage** focus, 52px buttons) and a generic
   `<Moon>` brand mark instead of the logo PNGs. → Migrate them to the canonical field/brand
   system? (Also: should auth fields focus terracotta instead of sage-green?) *(Heights left
   at 52px pending this; radii were normalized to 18.)*

10. **Dashed borders** on the admin subscriber toggle (off), calendar all-day chip, and
    "load more" button. Not in the language. → Keep as deliberate affordance or make solid?

11. **`+`/`−` sign glyphs** as leading marks on income/expense type pills
    (AddTransaction/EditTransaction/Recurring). Math signs, not icons — keep, replace with
    Lucide Plus/Minus, or rely on the sage/clay state color alone?

12. **New tokens to add.** A few raw values genuinely have no token: a legible dark-mode clay
    text (`--clay-on-dark`), a `-soft` tint family (admin/landing washes), nav-surface tokens.
    → OK to add a small derived-token set to `tokens.css`?

Full per-finding detail was generated during the audit; ask if you want the raw list for any area.

---

## Round 2 — owner decisions applied (2026-06-17)

Walked the 12 questions with the owner. Outcomes:

**Sanctioned as-is (documented, not changed):**
- **Onboarding sub-theme** — sage accent + clay CTA + soft 12–14px radii + 700 titles are an official onboarding sub-theme.
- **Per-screen nav color-coding** — the 5 brand-color nav tints, the sidebar 5-color gradient, and the sun↔moon theme switch stay.
- **Attention-tinted cards** — amber `PendingSection` / sage `InvoiceImports` are sanctioned semantic attention cards.
- **Dashed borders** (admin toggle-off, calendar all-day chip, "load more") — kept as deliberate affordance.
- **`+`/`−` sign glyphs** on income/expense pills — kept (numeric signs, not icons).
- **Display titles use `Assistant` 700** — sanctioned for true display titles + wordmarks. Weight scale doc now allows 700 for display titles.
- **Fonts**: text = `Alef` (dual-gender), numbers = `HeeboNum`, via `--mg-font`. Confirmed correct.

**Implemented in round 2:**
- **Moon sub-theme** — kept only where it's the reflection/daily-question motif (home "מה איתך היום" widget, Insights, and links to מבט-ירח). Generic toggles (`.mg-toggle`, Reports customize, Settings widget) → terracotta.
- **Nav off-palette fixes** — avatar purple→cyan gradient → flat terracotta; menu teal/purple/gold icon chips → stone/amber-warn (tint-moon kept, gradient flattened); green atmospheric glow → terracotta tint. Avatar initials + home quote → `var(--mg-font)`.
- **Data-viz palette** — duplicated swatch array centralized into `src/lib/palette.js` (`CATEGORY_SWATCHES`), imported by 8 files (no visual change). Income chart line clay→terracotta; urgent task dot sage→clay (regular stays amber).
- **Compact tokens** — added `--mg-chip-radius` (10px) + `--mg-icon-btn` (34px); applied to calendar chips/cells.
- **Legacy auth screens** — Reset/Update password migrated to the canonical `.auth-field` pattern + real logo lockup; auth focus sage→terracotta+blush (all auth fields).
- **New tokens** — `--clay-on-dark` (legible danger text on dark) + the compact tokens above.
- **Reports table fix (2026-06-17)** — months table marginally overflowed the card (summary column cut on the RTL-left edge); tightened metric column (130→112px) + cell padding (12→8px) + cell min-width (60→54px) so the default range fits cleanly; larger ranges still scroll inside the card.

**Still a separate project (NOT done — touches stored data):**
- **Emoji → Lucide iconography migration.** Questions / goals / goal-categories / lead-statuses / client-sub-statuses store an emoji as their icon. Owner approved migrating the whole system to Lucide line-icons — this needs a per-icon mapping, picker-UI changes, and a data migration of existing stored `icon` values. To be planned separately with migration logic that preserves user data.
