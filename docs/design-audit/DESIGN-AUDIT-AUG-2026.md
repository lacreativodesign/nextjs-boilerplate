# Bizosto platform-wide design consistency audit — August 2026

**Scope:** every page under `app/` (259 `page.tsx` files, excluding `app/api/**`) plus all of
`components/`.
**Method:** four benchmark modules read in full to extract the canon, then ripgrep/AST-lite sweeps
across the whole tree. No application code was modified by this audit.
**Baseline:** measured at `f0d3ce4`; status re-checked at `2f97100` (see Post-audit status below).

**CI safety note.** `.github/workflows/test.yml` (Quality Gates, runs on `pull_request`) contains
two steps that validate `docs/`, but both target a _single named file_ —
`git diff --exit-code -- docs/api/openapi.yaml` (DOC-01) and
`git diff --exit-code -- docs/database/collections.generated.md` (DOC-02). Neither scans the
`docs/` tree, so a new file at `docs/design-audit/` cannot trip them. The one gate that does reach
this file is `npm run format:check` (`prettier --check .`); there is no `.prettierignore`, so this
document is Prettier-formatted to match.

**Post-audit status — updated 2026-08-24, baseline `94caba7`.** The sweep below was taken against
`f0d3ce4`. While this report was in review, PR #939 (`design(S1): design-system baseline — one
stylesheet, motion tokens, global focus + reduced-motion`) landed on `main` and resolved five of its
findings. Those rows are marked **RESOLVED** in §3 and carry the commit that closed them; every
count elsewhere in this document is as-measured at `f0d3ce4` unless a row says otherwise. What #939
changed:

| Finding                    | Change                                                                                | Status                              |
| -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| F-2 (dead CSS)             | Deleted `styles.css` (409 lines) and `styles/globals.css` (33 lines)                  | Resolved                            |
| F-3 (orphan tokens)        | `--header-bg`, `--header-text`, `--sidebar-bg` removed with the dead sheet            | Resolved                            |
| F-26 (dead loading branch) | Inner `{loading ? 'Loading activity…' …}` removed from `app/admin/finance/page.tsx`   | Resolved                            |
| F-30 (a11y)                | `aria-label="Close bug report"` added at `components/support/BugReportButton.tsx:238` | Resolved                            |
| F-42 (motion)              | `--motion-fast/base/slow/ease` added to `app/globals.css:204–207`                     | Tokens added; call sites unmigrated |

It also added two things this audit did not call out and should have: a global
`:focus-visible` ring on `a, button, select, textarea, summary, [tabindex]`, and a global
`prefers-reduced-motion` guard (previously scoped to three `.admin-shell` selectors).

Separately, #939 **removed the `sa-tickets` "Support Tickets" nav entry** that §5 was asked to
locate. §5 records both the original position and the current state.

**Second wave — updated 2026-08-24, baseline `2f97100`.** Three further PRs landed, working
through the §4 ranking. They close three more findings outright and ship the shared primitives for
five others — but **the primitives are not yet adopted**, so the call-site counts in §3 still stand:

| Finding                     | Change                                                                                                                               | Status                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| F-31 (tabular-nums)         | `font-variant-numeric: tabular-nums` added at `app/globals.css:708–710`; `TablePager` uses the class                                 | Resolved                                                                        |
| F-34 (breadcrumbs)          | `<Breadcrumbs>` now rendered from `components/layout/AppShell.tsx` (#940)                                                            | Resolved                                                                        |
| F-41 (tailwind tokens)      | `theme.extend` now carries `colors`, `borderColor`, `boxShadow`, `transitionDuration`, `transitionTimingFunction`, `maxWidth` (#940) | Resolved                                                                        |
| F-13 / F-14 / F-15 (badges) | `components/ui/StatusBadge.tsx` + `lib/ui/status-tone.ts` shipped (#941)                                                             | Primitive ready; **0 adopters** — 5 palettes and 231 inline pills unchanged     |
| F-35 (alert/confirm)        | `components/ui/ConfirmDialog.tsx` + `ConfirmProvider`, wired at `app/layout.tsx:62` (#941)                                           | Primitive ready and mounted; **0 of 36 call sites migrated**                    |
| F-37 (modals)               | `components/ui/Modal.tsx` shipped (#942)                                                                                             | Primitive ready; **1 adopter** (ConfirmDialog) — the 15 ad-hoc modals unchanged |
| F-36 (pagination)           | `components/ui/TablePager.tsx` + `lib/ui/paginate.ts` shipped (#942)                                                                 | Primitive ready; **0 adopters** — 89 unpaginated tables unchanged               |

**A correction this audit owes #940.** F-34 said the Breadcrumbs component was "fully implemented"
and needed only wiring up. That was wrong in a way that mattered: `getBreadcrumbs` walked the nav
depth-first and returned on the _first_ prefix match, so `/admin/finance/invoices` resolved to
`Home / Overview` — every admin route produced the same two crumbs. Wiring the component up as this
report recommended would have shipped visibly broken breadcrumbs. #940 rewrote the resolution to
collect every prefix match shallowest-first and derive the remaining crumbs from the URL, stopping
at the first non-word-like segment. The finding was right that the component was unused; the
remediation was incomplete.

Still open and unchanged at `2f97100`: the four `duration-*` class values, and every adoption count
in §3 — the second wave built the tools, it has not yet applied them.

---

## 1. Canonical pattern reference

Extracted from `app/admin/finance/**`, `app/super_admin/payments/**`, `app/admin/users/**`,
`app/admin/leads/**`, the shell (`components/layout/AppShell.tsx`, `Sidebar.tsx`, `Header.tsx`,
`Breadcrumbs.tsx`), `tailwind.config.js`, and `app/globals.css`.

### 1.0 Where styling actually comes from

`tailwind.config.js` has an **empty `theme.extend`** — no custom colors, spacing, radii, or
durations. Every design decision lives in `app/globals.css` (1,546 lines) as CSS custom properties
plus hand-written component classes. Tailwind is used only for its stock utilities and arbitrary
values (`bg-[var(--surface-card)]`).

`app/globals.css` is the **only stylesheet imported anywhere** (`app/layout.tsx:1`).

Key tokens (`app/globals.css:139–201`):

| Token                     | Light value                     |
| ------------------------- | ------------------------------- |
| `--page-max-width`        | `1400px`                        |
| `--page-padding-x` / `-y` | `24px` / `24px`                 |
| `--card-padding`          | `20px`                          |
| `--sidebar-width`         | `260px` (collapsed `64px`)      |
| `--surface-card`          | `#ffffff`                       |
| `--surface-muted`         | `#f8fafc`                       |
| `--text-primary`          | `#0f172a`                       |
| `--text-muted`            | `#64748b`                       |
| `--text-soft`             | `#94a3b8`                       |
| `--border-subtle`         | `rgba(15, 23, 42, 0.08)`        |
| `--border-strong`         | `rgba(15, 23, 42, 0.12)`        |
| `--erp-blue`              | `#2563eb`                       |
| `--success` / `--danger`  | `#10b981` / `#ef4444`           |
| `--warning`               | `#f59e0b`                       |
| `--table-header-bg`       | `#f1f5f9`                       |
| `--table-row-hover`       | `rgba(37, 99, 235, 0.04)`       |
| `--table-row-alt`         | `rgba(15, 23, 42, 0.02)`        |
| `--focus-ring`            | `0 0 0 3px rgba(37,99,235,.18)` |

All are redefined for dark mode under both `@media (prefers-color-scheme: dark)` and `.dark`
(`darkMode: 'class'`).

### 1.1 Page wrapper (padding, max-width)

The shell already supplies the frame. `components/layout/AppShell.tsx:157–161`:

```jsx
<main className="flex-1 py-[var(--page-padding-y)]">
  <PullToRefresh>
    <div className="page-frame">{children}</div>
  </PullToRefresh>
</main>
```

`.page-frame` (`app/globals.css:395`) = `width: min(1400px, 100%); margin: 0 auto;` plus
`--page-padding-x` left/right.

**CANON:** a page inside `AppShell` adds **no** padding or max-width of its own. Its root element is
purely a vertical rhythm container: `<div className="space-y-6">`. This is what
`app/super_admin/payments/page.tsx:249` and `app/admin/finance/page.tsx:77` do, and it is the
plurality pattern platform-wide (90 of 226 resolvable page roots).

Full-bleed table pages that predate the shell frame use `<div style={{ width: '100%' }}>`
(`app/admin/users/page.tsx:298`, `app/admin/leads/page.tsx:135`) or `<div className="w-full">`
(`app/admin/finance/layout.tsx:22`). These are equivalent in effect but are a second dialect.

### 1.2 Page header block

Two co-equal shapes exist in the benchmarks:

**(a) Module-level, in the `layout.tsx`** — `app/admin/finance/layout.tsx:24–30`,
`app/admin/users/layout.tsx:20–23`:

```jsx
<div className="mb-4">
  <h2 className="section-title mb-1">Finance</h2>
  <p className="section-subtitle">Monitor revenue, cash flow, payroll, and finance operations.</p>
</div>
<div className="tabs-bar">…<Link className="tab-pill active">…</Link></div>
```

**(b) Page-level** — `app/admin/users/page.tsx:298–318`, `app/admin/leads/page.tsx:136–146`:

```jsx
<div className="page-header">
  <div>
    <h1 className="page-title">All Users</h1>
    <p className="page-subtitle">…</p>
  </div>
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    <button className="btn" style={{ borderRadius: 999, padding: '10px 20px' }}>
      + Add User
    </button>
  </div>
</div>
```

**CANON:**

- `h1` is **always** `className="page-title"` — `clamp(24px, 2.4vw, 34px)`, `font-weight: 900`,
  `letter-spacing: -0.01em` (`app/globals.css:378`).
- Subtitle is `<p className="page-subtitle">` — `14px`, `var(--text-muted)`, `margin: 0`
  (`app/globals.css:383`).
- The pair is wrapped in `.page-header` — `display:flex; justify-content:space-between;
align-items:center; gap:12px; flex-wrap:wrap` (`app/globals.css:388`).
- The primary action is the **last flex child** of `.page-header`, a `<button className="btn">`
  with `borderRadius: 999` applied inline.
- `section-title` (22px/700) and `section-subtitle` (13px) are for **sub-sections and module
  layouts**, not for the page `h1`.

### 1.3 Filter / search bar

**CANON** — `app/admin/leads/page.tsx:148–186`: a `.card` whose grid is
`minmax(220px, 1.2fr) repeat(auto-fit, minmax(180px, 1fr))`, `gap: 12`, containing:

1. `<SmartSearchBar value={query} onChange={setQuery} />` (`components/search/SmartSearchBar.tsx`)
2. one or more `<select className="input">`
3. a live result count: `{loading ? 'Loading...' : `${filtered.length} lead(s)`}`

`app/globals.css:620–635` already ships this exact grid as `.filter-bar` / `.filter-bar--search`,
collapsing to one column below 768px. **`.filter-bar` is the intended canonical class**; the leads
page reimplements it inline.

`app/admin/finance/invoices/page.tsx:290–316` uses a looser variant —
`<div className="mt-4 flex flex-wrap gap-3">` with `SmartSearchBar` + three `MasterSelect`
components + a `Reset Filters` button.

### 1.4 Table

**CANON** — the shell is a `.table-shell` (`app/globals.css:636`): `border-radius: 18px`,
`1px solid var(--border-subtle)`, `background: var(--surface-card)`, `box-shadow: var(--shadow-md)`,
`overflow-x: auto`.

Inside it, **bare element selectors in `app/globals.css:652–701` already style every table**, so a
plain `<table>` is correct:

| Part       | Canonical style (source)                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `table`    | `width:100%; border-collapse:collapse; font-size:14px; color:var(--text-primary)`                                    |
| `th`/`td`  | `padding: 12px 16px !important; border-bottom: 1px solid var(--border-subtle)`                                       |
| `th`       | `11px; letter-spacing:.08em; uppercase; font-weight:700; color:var(--text-muted); background:var(--table-header-bg)` |
| row (even) | `background: var(--table-row-alt)`                                                                                   |
| row hover  | `background: var(--table-row-hover)`                                                                                 |
| sortable   | `<button className="table-sort">` — inherits font, transparent, `cursor:pointer`                                     |
| numeric    | `.table-cell-right`; centered: `.table-cell-center`                                                                  |
| empty      | `.table-empty` — `padding: 32px 24px; text-align:center; color:var(--text-muted); background:var(--surface-muted)`   |
| loading    | `<SkeletonTable rows={6} columns={7} />` (`components/ui/Skeleton.tsx`)                                              |
| responsive | `.table-card` — below 768px collapses rows into stacked cards with `::before` labels                                 |

Sort-affordance canon (`app/admin/users/page.tsx:277–290`): a fixed-width 14px slot always renders
`▲` / `▼` / `•` so the header never reflows when sort changes.

**Pagination:** `app/super_admin/payments/page.tsx:65,226–229,401–423` is the only fully worked
example — `PAGE_SIZE = 20`, client-side `slice`, and a footer
`<div className="mt-4 flex items-center justify-between text-sm">` with `Page {page} of {totalPages}`
and Prev/Next buttons styled `rounded-xl border border-[var(--border-subtle)] px-3 py-1
disabled:opacity-40`. Cursor pagination for external data uses a centered `Load More` button
(same file, 468–480).

### 1.5 Status badge

**There is no shared status-badge component.** The closest thing to a canon is
`renderStatus()` in `app/admin/finance/invoices/page.tsx:487–512`:

```
base = 'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold min-w-[80px]'
paid | completed | approved | active   → bg-green-500/10  text-green-600
overdue | failed | rejected | void     → bg-red-500/10    text-red-500
pending | draft | processing | sent    → bg-amber-500/10  text-amber-600
partial                                → bg-purple-500/10 text-purple-600
fallback                               → bg-[var(--surface-muted)] text-[var(--text-muted)]
```

Shape canon: pill (`rounded-full`), `px-3 py-1`, `text-xs`, `font-semibold`, `min-w-[80px]`, 10%
tinted background over a 500-weight hue, 500/600-weight text.

`app/super_admin/payments/page.tsx:120–134` runs a **second, incompatible** map at `/15` opacity
with `-300` text (dark-mode-tuned, illegible on light surfaces), and adds plan colors
(`starter`→blue, `pro`→purple, `enterprise`→amber).

`app/globals.css:895` defines `.badge-success` / `.pill-active` using `color-mix(… var(--chart-series-2) 14% …)`
— a third scheme, used in only 3 files.

### 1.6 Button variants and sizes

`.btn` (`app/globals.css:824–913`) is the platform button and the only variant system with dark-mode
tokens:

| Variant | Class                                                                                                                                                                       | Definition                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Primary | `.btn`                                                                                                                                                                      | `bg: var(--erp-blue)`, white text, `9px 20px`, `radius 10px`, `13.5px/600`, layered shadow |
| Ghost   | `.btn.ghost`                                                                                                                                                                | transparent, `1.5px solid var(--border-strong)`, hovers to blue                            |
| Subtle  | `.btn.subtle`                                                                                                                                                               | `bg: var(--surface-muted)`, `var(--text-secondary)`                                        |
| Danger  | `.btn.danger` / `.btn-danger`                                                                                                                                               | `bg: var(--danger)`                                                                        |
| Loading | `<LoadingButton className="btn" loading loadingText="…">` (`components/ui/LoadingButton.tsx`) — sets `aria-busy`, swaps children for `<Spinner size="sm" />` without reflow |

Hover `translateY(-1px)`; active returns to `0`; disabled `opacity: .55`.
Transition: `background 140ms, box-shadow 140ms, transform 100ms, opacity 140ms`.

**Sizing is not a variant** — every call site overrides inline. The two recurring shapes are
pill primary (`style={{ borderRadius: 999, padding: '10px 20px', fontWeight: 600 }}`,
`app/admin/users/page.tsx:311`) and pill ghost (`style={{ padding: '8px 14px', borderRadius: 999,
fontWeight: 500 }}`, same file line 397).

### 1.7 Modal / drawer

**CANON** — the CSS-class drawer (`app/globals.css:1039–1085`), used by
`app/admin/users/page.tsx:436–438`:

```jsx
<div className="drawer-overlay" onClick={close}>
  <div className="drawer-panel drawer-panel--sm" onClick={(e) => e.stopPropagation()}>
    …
  </div>
</div>
```

Widths: `--sm` / `--md` / `--lg`; all collapse to full-width below 640px.
Header canon: title `20px/900`, subtitle `12px var(--text-muted)`, `<button className="btn ghost"
style={{ height: 34, borderRadius: 999 }}>Close</button>` right-aligned.
Body sections are nested `.card` blocks on `var(--surface-muted)` (`.card .card` drops the shadow).
Titles `.drawer-title` / `.drawer-subtitle` exist but the benchmarks inline their own.

There is **no shared `<Modal>` primitive**.

### 1.8 Form field

**CANON** — `.input` (`app/globals.css:914–972`): `width:100%`, `padding:10px 12px`,
`radius 12px`, `1px solid var(--input-border)`, `background: var(--input-bg)`. Focus:
`border-color: var(--erp-blue)` + `box-shadow: var(--focus-ring)`, `outline: none`. Disabled:
muted surface + `not-allowed`. `select.input` gets an inlined SVG chevron and `padding-right: 42px`.
Labels: `label.field-label` — `var(--text-primary)`, `font-weight: 500`.

Multi-field forms group into `.form-section` (`app/globals.css:578`) — same visual weight as `.card`
with `--card-padding`.

### 1.9 Numeric formatting

**CANON** — `components/finance/financeUtils.ts`:

```ts
formatUsd(v); // toLocaleString('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 })  → "$1,234.56"
formatPkr(v); // `Rs. ${toLocaleString('en-PK', { maximumFractionDigits: 0 })}`                          → "Rs. 1,234"
formatDate(iso); // "Aug 24, 2026"
formatDateTime(iso); // "Aug 24, 2026, 09:30 AM"
```

Both coerce `null`/`NaN` to a zero-value string rather than rendering `NaN`.
Numeric cells are right-aligned via `.table-cell-right` or `textAlign: 'right'`.

**`tabular-nums` is not part of the canon and is used zero times in the entire repository** — see
finding F-J1. Locale-aware alternatives exist in `lib/i18n/format.ts` (`formatCurrency`,
`formatNumber`) and `lib/finance/currencies.ts` (`formatCurrency(amount, currency)`), giving three
parallel currency helpers before per-file redefinitions are counted.

---

## 2. Consistency score per module

Score = adherence to §1 across six weighted axes: page header (25), page wrapper (10), table +
empty + loading (25), status badge (15), color tokens vs. hardcoded (15), interaction primitives —
modals, toasts vs. `alert()`, pagination (10).

| Module            | Pages |  Score | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ----: | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **super_admin**   |    19 | **88** | 19/19 `h1` use `.page-title`; 16/19 canonical wrapper; zero hardcoded hex/rgba outside 6 token-referencing spots; the only module with real pagination. Loses points for the second badge palette in `payments/page.tsx:120–134` and **10 raw `alert()`/`confirm()` calls** — the highest count in the platform.                                                                                                                                                                                |
| **approvals**     |     3 | **85** | All three role routes are 12-line wrappers around one shared `components/approvals/ApprovalsPage.tsx`, which uses `.page-header` + `.page-title` + `.page-subtitle` + `.kpis` + `.table-shell` + `.drawer-overlay` correctly. Deduction only for the inline `style={{ marginBottom: 16 }}` / `borderRadius: 999` overrides the canon itself carries.                                                                                                                                            |
| **hr**            |    26 | **72** | Best wrapper discipline on the platform (19/26 `page-frame space-y-6`) and only 3 `h1` total, all canonical. Dropped by 13 pages with hand-rolled inline `<table>` markup, 11 bare-text empty states, 10 pages with a loading flag and no visual, and two local `formatPkr` redefinitions (`app/hr/employees/page.tsx:93`, `app/admin/hr/employees/page.tsx:783`).                                                                                                                              |
| **reports**       |    14 | **68** | 10/14 canonical wrappers, 3/4 `h1` canonical. Weak on state: 7 of 14 pages have a loading flag but render nothing for it, 2 table pages have no empty state at all. 15 inline pill badges and a local `formatCurrency` at `app/admin/reports/reports/…:49`.                                                                                                                                                                                                                                     |
| **client_portal** |    16 | **66** | 11/15 `h1` canonical, `drawer-overlay` used correctly in all four `app/client/*` drawers. Undermined by `app/billing/terminal/BillingTerminalContent.tsx` (own `formatMoney` + own `statusClass`), `app/billing/page.tsx` (own `formatCurrency`), 14 inline pills, and `app/pay/[invoiceId]/page.tsx` running two non-canonical inline-styled `h1`s on one page.                                                                                                                                |
| **notifications** |     3 | **60** | Only 3 pages, but `app/notifications/page.tsx` and `app/dashboard/notifications/page.tsx` are **byte-identical 207-line duplicates**, and both use `h1.text-2xl font-bold` instead of `.page-title`. `components/notifications/NotificationDrawer.tsx` correctly uses the drawer canon.                                                                                                                                                                                                         |
| **finance**       |    20 | **58** | The benchmark module, yet only 5/8 `h1` canonical and 2/20 canonical wrappers. `app/admin/finance/page.tsx` builds its entire dashboard from inline `style={{}}` objects including two raw `rgba()` bar colors (lines 163, 169). `app/admin/finance/invoices/page.tsx` carries 74 inline style objects and a page-local `h3` where the canon wants `h1.page-title`. 52 inline pills. Two `components/ui/*` shadcn imports in `budgets/*` bring a third button/input system.                     |
| **projects**      |    11 | **56** | 5/6 `h1` canonical, but only 1/11 canonical wrappers. `app/admin/projects/change-requests/page.tsx` (109 inline style objects, 8 raw `rgba()` badge colors at lines 196–221) and `app/admin/projects/page.tsx` (101) are the two most inline-styled files in the repo. 27 inline pills, 4 bare-text empty states, zero shared `EmptyState`.                                                                                                                                                     |
| **settings**      |    27 | **54** | Strong wrappers (23/27) and low hardcoded color, but only **1 of 5 `h1` uses `.page-title`**. 16 pages fall back to bare `Loading…` text, 8 more show nothing. `app/admin/settings/tax-rates/page.tsx` imports five shadcn primitives (`Card/Button/Input/Label/Switch`) and is the single largest concentration of the parallel design system.                                                                                                                                                 |
| **sales**         |    33 | **48** | Largest module, weakest header discipline: 11 of 18 `h1` canonical, the rest split across `text-xl font-bold` (5 files) and `text-2xl font-semibold text-[var(--text-primary)]` (`sales_manager/performance`). 51 inline pills, 28 hardcoded colors, 11 pages with hand-rolled `<table style={{…}}>`, 12 bare-text empty states, 5 `alert()`/`confirm()` calls. `app/sales_manager/{leads,targets,team,deals}` each repeat the same `rgba(15,23,42,0.70)` overlay literal.                      |
| **production**    |    17 | **46** | Only 3 of 5 `h1` canonical and **5 of 8 table pages render no empty state at all** — the worst empty-state coverage on the platform. Zero pages use a skeleton. `components/production/QualityAssuranceWorkspace.tsx:33–43` defines a fourth badge palette in Tailwind `-100/-700` shades; `ProductionProjectDrawer.tsx` defines a fifth in raw `rgba()`.                                                                                                                                       |
| **crm**           |     3 | **35** | Three pages, three different `h1` treatments, **none canonical**: `app/admin/crm/page.tsx` repeats `h1.text-xl font-bold` three times (lines 46/55/63) for loading, error and loaded states; `app/dashboard/crm/customers/page.tsx:54` uses `text-2xl font-bold`; `app/dashboard/crm/deals/page.tsx:60` uses `mb-6 text-2xl font-bold`. `components/crm/CreateCustomerDialog.tsx:56` surfaces errors through `alert()`. Sole redeeming feature: `admin/crm` does use the shared `<EmptyState>`. |

**Platform aggregate: 62 / 100.** Tokens and CSS component classes are excellent and near-complete;
adoption is the failure. 100 of 169 `h1` elements are canonical (59%), but only 9 of 93 table pages
use the shared `<EmptyState>` (10%) and only 4 of 93 paginate (4%).

---

## 3. Findings

Severity: **P0** = visible breakage, accessibility failure, or dark-mode illegibility.
**P1** = obvious cross-page inconsistency a user will notice. **P2** = maintainability / drift risk.

| #                        | File(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Category           | Sev | Current                                                                                                                                                                                                                                                                                                                                                                                     | Should be                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-1                      | `app/login/page.tsx:451–1002`                                                                                                                                                                                                                                                                                                                                                                                                                            | dead/duplicate CSS | P0  | A 551-line `<style jsx global>` block defining `.login-*`, carrying 23 raw `rgba()` literals. It duplicated root `styles.css`, which was never imported; since #939 deleted that file this block is now the **sole** definition of every `.login-*` class, so the CSS is still page-trapped and invisible to the token system.                                                              | Move to `app/globals.css` behind tokens. Still open.                                                                                                                                                                                       |
| F-2 **RESOLVED** (#939)  | `styles.css` (409 lines, 37 selectors), `styles/globals.css` (33 lines)                                                                                                                                                                                                                                                                                                                                                                                  | dead code          | P1  | Neither file was imported anywhere (`app/layout.tsx:1` imports only `./globals.css`); `styles.css` defined a **conflicting `.btn` and `.btn-primary`** at lines 352/369.                                                                                                                                                                                                                    | Both files deleted in #939.                                                                                                                                                                                                                |
| F-3 **RESOLVED** (#939)  | `app/globals.css` vs `styles/globals.css`                                                                                                                                                                                                                                                                                                                                                                                                                | orphan tokens      | P2  | `--header-bg`, `--header-text`, `--sidebar-bg` were defined only in the dead sheet and referenced by zero components.                                                                                                                                                                                                                                                                       | Removed with the dead sheet in #939; `Header.tsx` already used `--surface-card` / `--text-primary`.                                                                                                                                        |
| F-4                      | `components/ui/button.tsx:29–32`, `input.tsx:9`, `label.tsx:8`                                                                                                                                                                                                                                                                                                                                                                                           | parallel system    | P0  | A shadcn-style primitive set hardcoding `bg-blue-600`, `border-gray-300`, `bg-white`, `text-gray-500`, `hover:bg-gray-50` — **no CSS variables, no dark-mode variants.** These render white-on-white in dark mode.                                                                                                                                                                          | Reimplement over `.btn` / `.input`, or delete and migrate the 5 importers.                                                                                                                                                                 |
| F-5                      | `app/admin/settings/tax-rates/page.tsx:5–9`, `app/admin/finance/budgets/create/page.tsx:5–8`, `app/admin/finance/budgets/[id]/page.tsx:4`, `app/login/page.tsx:16`, `app/sales_manager/deals/page.tsx:6`                                                                                                                                                                                                                                                 | parallel system    | P1  | 5 files import the F-4 primitives, giving those screens a visibly different button/input than the other 254.                                                                                                                                                                                                                                                                                | Migrate to `.btn` / `.input`.                                                                                                                                                                                                              |
| F-6                      | 69 `h1` elements across 29 distinct signatures (full list §6.1)                                                                                                                                                                                                                                                                                                                                                                                          | h1 drift           | P1  | 41% of page titles are not `.page-title`. Sizes range from `text-lg` (18px) to `text-4xl` (36px) where the canon is `clamp(24px,2.4vw,34px)`.                                                                                                                                                                                                                                               | `<h1 className="page-title">` everywhere.                                                                                                                                                                                                  |
| F-7                      | `app/admin/crm/page.tsx:46,55,63`                                                                                                                                                                                                                                                                                                                                                                                                                        | h1 drift           | P1  | The same page renders three separate `h1.text-xl font-bold` — one per render branch — so the title visibly changes weight vs. every sibling page.                                                                                                                                                                                                                                           | One `h1.page-title` hoisted above the branch.                                                                                                                                                                                              |
| F-8                      | `app/pay/[invoiceId]/page.tsx:296` and `:317`                                                                                                                                                                                                                                                                                                                                                                                                            | h1 drift           | P0  | **Two `h1` elements on one page**, both inline-styled (`fontSize: 22` and `fontSize: 30`). Two `h1`s is a document-outline violation.                                                                                                                                                                                                                                                       | One `h1.page-title`; demote the second to `h2`.                                                                                                                                                                                            |
| F-9                      | `app/notifications/page.tsx` ≡ `app/dashboard/notifications/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                    | duplication        | P1  | Byte-identical 207-line files, both `h1.text-2xl font-bold`.                                                                                                                                                                                                                                                                                                                                | One shared component; both routes render it with `.page-title`.                                                                                                                                                                            |
| F-10                     | 33 distinct page-root wrappers (full list §6.2)                                                                                                                                                                                                                                                                                                                                                                                                          | wrapper drift      | P1  | `space-y-6` (90), `style={{width:'100%'}}` (15), `space-y-4` (11), bare `<div>` (10), `w-full` (10), `p-6` (5), `space-y-6 p-6` (5), …                                                                                                                                                                                                                                                      | `<div className="space-y-6">`. `AppShell` already supplies padding and max-width.                                                                                                                                                          |
| F-11                     | `app/admin/finance/budgets/[id]/page.tsx:80`, `budgets/create/page.tsx:120`, `app/admin/settings/tax-rates/page.tsx:153`, `app/admin/support/[ticketId]/page.tsx:120`, `app/dashboard/audit-logs/page.tsx:197`, `app/dashboard/notifications/page.tsx:91`, `app/dashboard/settings/notifications/page.tsx:88`, +8                                                                                                                                        | double padding     | P1  | Root wrapper adds `p-6` **inside** `.page-frame`, which already applies `--page-padding-x: 24px`. Content sits 48px from the edge instead of 24px.                                                                                                                                                                                                                                          | Drop `p-6`.                                                                                                                                                                                                                                |
| F-12                     | `app/admin/finance/ar/page.tsx:3`, `app/admin/hr/attendance/page.tsx:7`                                                                                                                                                                                                                                                                                                                                                                                  | legacy tokens      | P2  | Root wrapper uses `var(--card-bg)` / `var(--border)` — legacy aliases (`app/globals.css:159–161`) — plus a bespoke `borderRadius: 10` where `.card` is `16px`.                                                                                                                                                                                                                              | `<div className="card">`.                                                                                                                                                                                                                  |
| F-13                     | 5 incompatible status-badge palettes (§1.5)                                                                                                                                                                                                                                                                                                                                                                                                              | badge drift        | P0  | `bg-green-500/10 text-green-600` (10 files) · `bg-green-500/15 text-green-300` (2) · `bg-green-100 text-green-700/800` (8) · `rgba(34,197,94,0.15)` inline (8) · `.badge-success` `color-mix` (3). The `/15 text-*-300` variant is tuned for dark surfaces and is **low-contrast on the light theme**; the `-100/-700` variants have no `dark:` counterpart and go unreadable in dark mode. | One `<StatusBadge status tone>` over `--success` / `--warning` / `--danger` / `--erp-blue`.                                                                                                                                                |
| F-14                     | 231 inline `borderRadius: 999` pills across 73 files (top offenders `app/admin/sales/deals/page.tsx` ×11, `app/admin/finance/invoices/page.tsx` ×11, `components/production/ProductionProjectDrawer.tsx` ×10)                                                                                                                                                                                                                                            | badge drift        | P1  | Every pill re-declares its own radius, padding, font-size and colors inline.                                                                                                                                                                                                                                                                                                                | One badge component; `.pill-active` already exists.                                                                                                                                                                                        |
| F-15                     | `components/production/QualityAssuranceWorkspace.tsx:33–43`, `components/finance/RecurringTemplateCard.tsx:31–35`, `app/super_admin/demo/page.tsx:36–44`, `app/admin/launch-checklist/page.tsx:42`, `app/admin/support/page.tsx:23`, `app/billing/terminal/BillingTerminalContent.tsx:115`, `app/super_admin/payments/page.tsx:120,127`                                                                                                                  | badge drift        | P1  | 8 separate per-file status→class maps, no two agreeing on hue or shade.                                                                                                                                                                                                                                                                                                                     | Delete; call the shared badge.                                                                                                                                                                                                             |
| F-16                     | `app/admin/projects/change-requests/page.tsx:196–221`, `app/am/change-requests/page.tsx:262–269`, `app/sales/deals/page.tsx:244–249`, `components/production/ProductionProjectDrawer.tsx:240–245`                                                                                                                                                                                                                                                        | hardcoded color    | P1  | The same four-state badge palette is copy-pasted as raw `rgba(251,191,36,.15)` / `rgba(34,197,94,.15)` / `rgba(248,113,113,.15)` / `rgba(148,163,184,.15)` in four files.                                                                                                                                                                                                                   | `var(--warning-soft)`, `var(--success-soft)`, `var(--danger-soft)`, `var(--surface-muted)`.                                                                                                                                                |
| F-17                     | `app/sales_manager/{leads:362,369,373 · targets:135,137 · team:109,111 · deals:275,277}`                                                                                                                                                                                                                                                                                                                                                                 | hardcoded color    | P1  | `rgba(15,23,42,0.65)` / `rgba(15,23,42,0.70)` overlays repeated 9 times across 4 sibling pages.                                                                                                                                                                                                                                                                                             | A `--overlay-scrim` token.                                                                                                                                                                                                                 |
| F-18                     | `app/sales_manager/{reports:78, targets:122, team:96, deals:261}`, `app/sales/{campaigns:201, inbox:98, follow-ups:266}`, `app/admin/sales/{campaigns:63, leads:249, page:92, pipeline:148, follow-ups:243, deals:331}`, `app/admin/projects/{files:154,741, page:907,1112}`                                                                                                                                                                             | hardcoded color    | P1  | `rgba(239,68,68,0.35)` error-border literal repeated **17 times across 17 files**.                                                                                                                                                                                                                                                                                                          | `var(--danger)` at 35% or a `--danger-border` token.                                                                                                                                                                                       |
| F-19                     | `app/admin/settings/_components/SettingsAlert.tsx:7–37`                                                                                                                                                                                                                                                                                                                                                                                                  | hardcoded color    | P1  | 12 raw `rgba()` literals build a four-tone alert system with hand-written light/dark pairs.                                                                                                                                                                                                                                                                                                 | `--danger-soft` / `--success-soft` / `--erp-blue-soft` / `--surface-muted`.                                                                                                                                                                |
| F-20                     | `components/finance/ExpenseBreakdownChart.tsx:5`                                                                                                                                                                                                                                                                                                                                                                                                         | hardcoded color    | P1  | Chart palette hardcoded `#3B82F6 #10B981 #F59E0B #EF4444 #8B5CF6 #14B8A6` — ignores the six `--chart-series-*` tokens, which **do** adapt to dark mode.                                                                                                                                                                                                                                     | `var(--chart-series-1…6)`.                                                                                                                                                                                                                 |
| F-21                     | `app/admin/settings/branding/page.tsx:34–36`                                                                                                                                                                                                                                                                                                                                                                                                             | hardcoded color    | P2  | Default white-label brand colors as raw `#2563eb`/`#1d4ed8`/`#14b8a6`.                                                                                                                                                                                                                                                                                                                      | Acceptable as seed data, but should read from the token defaults so they cannot diverge.                                                                                                                                                   |
| F-22                     | `components/ui/BizostoSplash.tsx:41–79`, `components/production/GanttChart.tsx:213`, `components/files/TagManager.tsx:9`, `app/layout.tsx:38`                                                                                                                                                                                                                                                                                                            | hardcoded color    | P2  | 12 further hex literals in shared components.                                                                                                                                                                                                                                                                                                                                               | Tokens (`--brand-navy`, `--text-on-brand`, `--erp-blue`).                                                                                                                                                                                  |
| F-23                     | 65 pages with a `loading` flag and **no loading UI** (full list in §3 notes; e.g. `app/admin/reports/{clients,delivery,production,revenue,settings}`, `app/am/{clients,files,projects,page}`, `app/hr/{documents,employees,onboarding,payroll,page}`, `app/sales/{campaigns,follow-ups,inbox,page}`)                                                                                                                                                     | loading state      | P0  | State is tracked but nothing renders — the page is blank until data lands.                                                                                                                                                                                                                                                                                                                  | `<SkeletonTable>` / `<SkeletonDashboard>` per canon.                                                                                                                                                                                       |
| F-24                     | 89 pages rendering bare `Loading…` text (e.g. `app/admin/leads/page.tsx:192`, `app/admin/projects/page.tsx`, `app/client/projects/page.tsx`, `app/reports/{projects,sales,team}`)                                                                                                                                                                                                                                                                        | loading state      | P1  | Unstyled text where the benchmark shows a skeleton; causes a layout jump on load.                                                                                                                                                                                                                                                                                                           | `<SkeletonTable rows={6} columns={n} />`.                                                                                                                                                                                                  |
| F-25                     | Only 27 of 259 pages use a skeleton; only 2 use a spinner (`app/signup/page.tsx:931`, `app/super_admin/activity/page.tsx:75`)                                                                                                                                                                                                                                                                                                                            | loading state      | P1  | Two visual vocabularies for the same state, with 89% of pages using neither.                                                                                                                                                                                                                                                                                                                | Skeletons for content; spinners only inside buttons via `LoadingButton`.                                                                                                                                                                   |
| F-26 **RESOLVED** (#939) | `app/admin/finance/page.tsx:225` (at `f0d3ce4`)                                                                                                                                                                                                                                                                                                                                                                                                          | loading state      | P2  | Dead branch — the whole subtree is already inside `{loading ? <SkeletonDashboard/> : (…)}` at line 82, so this inner `{loading ? 'Loading activity…' : …}` can never render its loading arm.                                                                                                                                                                                                | Inner ternary removed in #939.                                                                                                                                                                                                             |
| F-27                     | 23 table pages with **no empty state** (`app/admin/production/{qa,queue}`, `app/production/{activity,queue}`, `app/hr/attendance/**`, `app/admin/reports/delivery`, `app/sales/follow-ups`, `app/finance/tax`, `app/super_admin/{activation,demo}`, `app/reports/ai`, +11)                                                                                                                                                                               | empty state        | P0  | An empty result renders a header row over nothing — indistinguishable from a failed load.                                                                                                                                                                                                                                                                                                   | `<EmptyState title description action />`.                                                                                                                                                                                                 |
| F-28                     | 57 table pages with bare-text empty states (`app/admin/leads/page.tsx:196`, `app/admin/finance/invoices/page.tsx:391`, `app/admin/finance/page.tsx:225`, `app/sales/deals/page.tsx`, …)                                                                                                                                                                                                                                                                  | empty state        | P1  | Plain `No leads found.` / `No invoices found.` in a `<td>` — no icon, no guidance, no primary action.                                                                                                                                                                                                                                                                                       | `<EmptyState>`, or at minimum `.table-empty` which is already defined.                                                                                                                                                                     |
| F-29                     | Only 9 of 93 table pages use `<EmptyState>`; `.empty-state*` CSS (`app/globals.css:786–822`, 5 selectors) has **zero consumers**                                                                                                                                                                                                                                                                                                                         | empty state        | P2  | A designed empty-state system exists and is unused — `EmptyState.tsx` re-implements it in Tailwind instead.                                                                                                                                                                                                                                                                                 | Point `EmptyState.tsx` at the `.empty-state*` classes, or delete them.                                                                                                                                                                     |
| F-30 **RESOLVED** (#939) | `components/support/BugReportButton.tsx:235` (at `f0d3ce4`)                                                                                                                                                                                                                                                                                                                                                                                              | a11y               | P0  | Icon-only close button — `<button onClick={close} className="flex h-8 w-8 …"><X className="h-4 w-4"/></button>` — with no `aria-label`, `title`, or `sr-only` text. Screen readers announce "button".                                                                                                                                                                                       | `aria-label="Close bug report"` — added in #939 at line 238. (This was the **only** unlabelled icon-only button in the repo — `Sidebar.tsx:155,171` and `SmartSearchBar.tsx` are correctly labelled.)                                      |
| F-31 **RESOLVED** (#942) | `tabular-nums` appeared **0 times** repo-wide; 47 currency/number `<td>` cells across 31 files                                                                                                                                                                                                                                                                                                                                                           | numeric            | P1  | Proportional digits make currency columns visually ragged; only 13 of the 47 are even right-aligned.                                                                                                                                                                                                                                                                                        | `font-variant-numeric: tabular-nums` on `.table-cell-right`, and right-align all numeric columns.                                                                                                                                          |
| F-32                     | `app/super_admin/payments/page.tsx:75`, `app/super_admin/page.tsx:152`, `app/admin/page.tsx:97`, `app/billing/page.tsx:98`, `app/admin/finance/reports/page.tsx:49`, `app/billing/terminal/BillingTerminalContent.tsx:100`, `app/hr/employees/page.tsx:93`, `app/admin/hr/employees/page.tsx:783`, `components/dashboard/CustomizableDashboard.tsx:28`                                                                                                   | numeric            | P1  | 9 files redefine `formatUsd`/`formatCurrency`/`formatMoney`/`formatPkr` locally, on top of three library helpers (`financeUtils`, `lib/i18n/format`, `lib/finance/currencies`). Fraction digits and symbol placement differ between them.                                                                                                                                                   | One `lib/format/currency.ts`.                                                                                                                                                                                                              |
| F-33                     | `app/admin/finance/invoices/page.tsx:405–408`                                                                                                                                                                                                                                                                                                                                                                                                            | numeric            | P1  | Amount rendered as `getCurrencySymbol(c) + Number(x).toFixed(2)` — no thousands separator, so `$1234.56` where the rest of finance shows `$1,234.56`.                                                                                                                                                                                                                                       | `formatUsd()`.                                                                                                                                                                                                                             |
| F-34 **RESOLVED** (#940) | `components/layout/Breadcrumbs.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                      | navigation         | P0  | The component is fully implemented (with `aria-label="Breadcrumb"`, a mobile trail, and `getBreadcrumbs()` in `lib/navigation/sidebarConfig.ts`) and **is imported by nothing**. No page on the platform shows breadcrumbs.                                                                                                                                                                 | Render in `AppShell` above `{children}`, or in `Header`.                                                                                                                                                                                   |
| F-35                     | 36 `alert()` / `confirm()` call sites (§3 notes below)                                                                                                                                                                                                                                                                                                                                                                                                   | interaction        | P1  | Native browser dialogs — unstyled, unbranded, blocking — while `lib/toast.ts` (`toastSuccess`/`toastError`/`toastPromise`) is used by only 23 files. `app/super_admin/tenants/[tenantId]/page.tsx` alone has 5.                                                                                                                                                                             | Toasts for feedback; a styled confirm dialog for destructive actions.                                                                                                                                                                      |
| F-36                     | 89 of 93 table pages have no pagination                                                                                                                                                                                                                                                                                                                                                                                                                  | table              | P1  | Every row is rendered; only `app/super_admin/payments`, `app/admin/sales/deals`, `app/admin/settings/api-usage`, `app/dashboard/audit-logs` paginate.                                                                                                                                                                                                                                       | Extract the `payments` pager into a shared `<TablePager>`.                                                                                                                                                                                 |
| F-37                     | 15 ad-hoc `fixed inset-0` modals (`components/{support/CreateTicketModal,files/FilePreviewModal,crm/CreateCustomerDialog,projects/CreateProjectDialog,inventory/CreateProductDialog,import-export/ExportConfigurationModal,auth/SessionTimeoutModal,search/GlobalSearchModal,onboarding/PlatformTour,dashboard/CustomizableDashboard,reports/VisualReportBuilder,support/BugReportButton}`, `app/super_admin/demo/page.tsx`, `app/finance/tax/page.tsx`) | modal              | P1  | Each rebuilds overlay, z-index, panel, and dismissal. No focus trap, no consistent `Escape` handling.                                                                                                                                                                                                                                                                                       | One `<Modal>` over `.drawer-overlay` / `.drawer-panel`.                                                                                                                                                                                    |
| F-38                     | 61 pages with `<table style={{ width:'100%', borderCollapse:'collapse' … }}` vs 28 with `<table className=…>`                                                                                                                                                                                                                                                                                                                                            | table              | P2  | Inline table styling duplicates `app/globals.css:652` which already styles bare `table`, and the inline `padding` is overridden by the `!important` on line 656 — so the inline values are inert.                                                                                                                                                                                           | Bare `<table>` inside `.table-shell`.                                                                                                                                                                                                      |
| F-39                     | 2,968 inline `style={{…}}` objects across 143 files; 136 of 259 pages use at least one. Worst: `app/admin/projects/change-requests/page.tsx` (109), `app/admin/projects/page.tsx` (101), `app/admin/finance/invoices/page.tsx` (74)                                                                                                                                                                                                                      | maintainability    | P2  | Style lives at call sites, so a token change cannot reach it and dark mode can silently break.                                                                                                                                                                                                                                                                                              | Migrate to the existing classes; nothing new needs to be authored.                                                                                                                                                                         |
| F-40                     | `app/admin/users/{roles:322,515 · create:408 · [uid]/edit:520}`                                                                                                                                                                                                                                                                                                                                                                                          | maintainability    | P2  | Four `<style jsx>` blocks inside pages, plus three `h1 style={headerStyle}` (`app/globals.css` already has `.page-title`).                                                                                                                                                                                                                                                                  | Move to `app/globals.css`.                                                                                                                                                                                                                 |
| F-41 **RESOLVED** (#940) | `tailwind.config.js:10`                                                                                                                                                                                                                                                                                                                                                                                                                                  | config             | P2  | `theme.extend` is `{}`, so no token is reachable as a Tailwind utility. Every token use costs an arbitrary-value bracket (`bg-[var(--surface-card)]`), which is what makes hardcoding `bg-gray-50` the path of least resistance.                                                                                                                                                            | Map the tokens into `theme.extend.colors` so `bg-surface-card` works.                                                                                                                                                                      |
| F-42                     | Durations: `duration-300` (6), `duration-500` (4), `duration-200` (3), `duration-700` (1), plus inline `0.2s`, `0.25s`, `0.55s`, and 14 distinct values in CSS (§6.3)                                                                                                                                                                                                                                                                                    | motion             | P2  | 18 distinct durations for a system with three interaction speeds.                                                                                                                                                                                                                                                                                                                           | #939 added `--motion-fast: 140ms`, `--motion-base: 160ms`, `--motion-slow: 240ms`, `--motion-ease` at `app/globals.css:204–207`. Call sites still unmigrated — the four `duration-*` classes and the inline durations below are unchanged. |

### Notes on aggregate findings

**F-35 — all 36 `alert()`/`confirm()` sites:**
`app/super_admin/tenants/[tenantId]/page.tsx:112,122,238,413,429` ·
`app/super_admin/backups/page.tsx:72,96,98` · `app/super_admin/maintenance/page.tsx:55` ·
`app/super_admin/security/page.tsx:63` · `app/admin/users/page.tsx:115,225` ·
`app/admin/users/[uid]/page.tsx:82` · `app/users/page.tsx:153,251` ·
`app/admin/clients/page.tsx:340` · `app/admin/clients/segments/page.tsx:375,383,408` ·
`app/admin/projects/page.tsx:604` · `app/admin/hr/documents/page.tsx:163` ·
`app/admin/hr/employees/page.tsx:268` · `app/admin/settings/ai-workforce/page.tsx:77` ·
`app/admin/settings/tax-rates/page.tsx:127` · `app/hr/documents/page.tsx:193` ·
`app/finance/tax/page.tsx:116,141` · `app/finance/invoices/page.tsx:214` ·
`app/settings/payments/page.tsx:101` · `app/sales/deals/page.tsx:267` ·
`app/sales/leads/page.tsx:93` · `app/sales/follow-ups/page.tsx:237` ·
`app/sales_manager/leads/page.tsx:222` · `app/sales_manager/deals/[id]/page.tsx:34` ·
`components/users/UserCard.tsx:45` · `components/crm/CreateCustomerDialog.tsx:56`

**F-23 — the 65 pages tracking `loading` with no loading UI** are listed in full in the sweep
output; the largest clusters are `app/admin/reports/*` (6 of 8 pages), `app/admin/settings/*` (8),
`app/am/*` (5), `app/hr/*` (6), and `app/sales/*` (4).

---

## 4. Top 10 highest-impact fixes

Ranked by (visual impact × pages affected) ÷ effort.

| Rank | Fix                                                                                                                                                                                                                                                                                | Pages hit | Effort | Why it ranks here                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | ~~Ship `<StatusBadge>`~~ **primitive shipped in #941; adoption still outstanding** — over `--success`/`--warning`/`--danger`/`--erp-blue` with the `app/admin/finance/invoices/page.tsx:487` shape; replace the 5 palettes, 8 per-file maps, and 231 inline pills (F-13/14/15/16). |  73 files | M      | The single most-repeated visual element on the platform and the only one with a genuine dark-mode legibility bug. One component retires ~300 call-site decisions.                                                                 |
| 2    | **Normalize every `h1` to `.page-title`** (F-6/7/8), 69 elements across 29 signatures.                                                                                                                                                                                             |  65 files | S      | Pure find-and-replace against a class that already exists. Page titles currently range 18px→36px; this is the first thing a user sees on every screen.                                                                            |
| 3    | ~~Render `<Breadcrumbs>` in `AppShell`~~ **done in #940**, which also had to fix a depth-first bug in `getBreadcrumbs` this report missed (F-34).                                                                                                                                  |   all 259 | XS     | The component, its config (`getBreadcrumbs`), and its a11y are already written and tested-shaped. One import + one line restores navigation context platform-wide.                                                                |
| 4    | **Replace the 89 bare `Loading…` strings and 65 invisible loading states with `<SkeletonTable>`/`<SkeletonDashboard>`** (F-23/24/25).                                                                                                                                              |       154 | M      | 59% of the platform currently flashes blank or unstyled text on every load. Skeletons already exist in `components/ui/Skeleton.tsx` with table, form, chart and dashboard variants.                                               |
| 5    | **Adopt `<EmptyState>` on the 80 table pages that lack it** — 23 with nothing, 57 with bare text (F-27/28).                                                                                                                                                                        |        80 | M      | 23 pages are actively ambiguous: an empty table looks identical to a failed fetch. Drop-in component; each site is a 4-line change.                                                                                               |
| 6    | ~~Delete `styles.css` + `styles/globals.css`~~ **done in #939** — what remains is folding `.login-*` into `app/globals.css` (F-1).                                                                                                                                                 | 1 + build | S      | #939 removed 442 lines of dead CSS, the conflicting `.btn`, and 3 orphan tokens. The remaining half is the 551-line styled-jsx block in `app/login/page.tsx`, now the sole home of those classes and of 23 raw `rgba()` literals. |
| 7    | **Retire `components/ui/{button,input,label}.tsx`** and migrate the 5 importers to `.btn` / `.input` (F-4/5).                                                                                                                                                                      |         5 | S      | Small blast radius, but these are the only primitives on the platform with **no dark-mode support at all** — `bg-white` + `text-gray-500` on a dark surface. Correctness, not polish.                                             |
| 8    | ~~Add `tabular-nums`~~ **done in #942**; consolidating the 9 local currency formatters (F-32/33) is still outstanding.                                                                                                                                                             |        31 | S      | A two-line CSS change fixes digit jitter in every money column at once; the formatter consolidation removes a real correctness bug (`$1234.56` on the invoices page).                                                             |
| 9    | **Tokenise the repeated color literals** — `rgba(239,68,68,0.35)` ×17, the four-state badge rgba set ×4, `rgba(15,23,42,0.70)` ×9, the chart palette (F-16/17/18/19/20).                                                                                                           |       40+ | S      | Mechanical; the target tokens (`--danger-soft`, `--success-soft`, `--chart-series-*`) already exist and already adapt to dark mode. Kills ~60 of the 130 UI-file color literals.                                                  |
| 10   | ~~Map tokens into `tailwind.config.js`~~ and ~~extract `<TablePager>`~~ **both done in #940/#942**; 89 tables still need the pager applied (F-36).                                                                                                                                 |       all | S/M    | The config change is preventive: until `bg-surface-card` works, `bg-gray-50` will keep winning on ergonomics. The pager unblocks the 89 unpaginated tables.                                                                       |

**Deliberately below the line:** F-39 (2,968 inline styles) is the largest number in this report but
the worst ratio — high effort, low per-change visual payoff, and it resolves itself gradually as
1–9 land.

---

## 5. Sidebar "Support Tickets" location

The `Sidebar` component (`components/layout/Sidebar.tsx`) contains no literal nav labels. It renders
from `getNavigationForRole(currentRole)` (`components/layout/Sidebar.tsx:83`), imported from
`lib/navigation/sidebarConfig.ts` at line 31. The "Support Tickets" entry is therefore a data record
in that config.

**File:** `lib/navigation/sidebarConfig.ts`
**Line:** `128` (the `label`); the full entry object spans lines **126–134**

> **Current state (2026-08-24, `94caba7`): this entry no longer exists.** PR #939 deleted the
> `sa-tickets` object from `lib/navigation/sidebarConfig.ts`. At `94caba7`, line 126 opens the
> `sa-platform` entry that previously followed it, and `grep "Support Tickets"
lib/navigation/sidebarConfig.ts` returns nothing. The capture below is the verbatim record as of
> the audit baseline `f0d3ce4` and is preserved as the answer to the question that was asked; it is
> no longer a live file location.

Surrounding 15 lines, verbatim (lines 120–134 at `f0d3ce4`):

```ts
    labelKey: 'navigation.help',
    href: '/help',
    icon: 'FileText',
    roles: ['super_admin'],
    module: null,
  },
  {
    id: 'sa-tickets',
    label: 'Support Tickets',
    labelKey: 'navigation.supportTickets',
    href: '/super_admin/tickets',
    icon: 'LifeBuoy',
    roles: ['super_admin'],
    module: null,
  },
```

With line numbers for precision:

```
 120|     labelKey: 'navigation.help',
 121|     href: '/help',
 122|     icon: 'FileText',
 123|     roles: ['super_admin'],
 124|     module: null,
 125|   },
 126|   {
 127|     id: 'sa-tickets',
 128|     label: 'Support Tickets',
 129|     labelKey: 'navigation.supportTickets',
 130|     href: '/super_admin/tickets',
 131|     icon: 'LifeBuoy',
 132|     roles: ['super_admin'],
 133|     module: null,
 134|   },
```

Related references. These were listed as the follow-ups to check if the entry were ever removed —
it since has been, and **all of them are still live at `94caba7`**. #939 removed only the sidebar
record, so `/super_admin/tickets` remains reachable through the super-admin tab bar and dashboard
tile, and the page itself is untouched:

- `app/super_admin/layout.tsx:40` — `{ href: '/super_admin/tickets', label: 'Support Tickets' }` (tab bar)
- `app/super_admin/page.tsx:90` — `title: 'Support Tickets'` (dashboard tile)
- `app/super_admin/tickets/page.tsx:154` — `<h1 className="page-title">Support Tickets</h1>`
- `app/admin/support/page.tsx:88` — `<h1 className="text-2xl font-bold">Support Tickets</h1>` (tenant-side, separate route)
- `app/admin/support/[ticketId]/page.tsx:123` — `← Back to Support Tickets`
- i18n key `navigation.supportTickets` — now unreferenced by the sidebar config

Whether that split is intended is worth a look: the route is still fully built and linked from two
places, but no longer appears in the primary nav.

**Not removed by this audit** — this report changes no application code. The removal was PR #939.

---

## 6. Raw inventories

### 6.1 Distinct `h1` signatures

169 `<h1>` elements, 30 distinct signatures.

| Count | Signature                                                                                                       |
| ----: | --------------------------------------------------------------------------------------------------------------- |
|   100 | `className="page-title"` ← **canonical**                                                                        |
|    11 | `className="text-2xl font-bold"`                                                                                |
|     9 | `className="text-xl font-bold"`                                                                                 |
|     5 | `className="text-2xl font-semibold"`                                                                            |
|     4 | `className="text-2xl font-bold text-[var(--text-primary)]"`                                                     |
|     4 | `className="text-2xl font-semibold text-[var(--text-primary)]"`                                                 |
|     3 | `style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)' }}`                                        |
|     3 | `style={{ fontSize: 24, fontWeight: 700 }}`                                                                     |
|     3 | `style={headerStyle}`                                                                                           |
|     2 | `style={styles.pageTitle}`                                                                                      |
|     2 | `className="text-3xl font-bold"`                                                                                |
|     2 | `className="mb-6 text-2xl font-bold"`                                                                           |
|     2 | `className="text-xl font-semibold"`                                                                             |
|     2 | `className="mb-3 text-2xl font-bold text-[var(--text-slate-deep)]"`                                             |
|     2 | `className="text-3xl font-semibold text-[var(--text-primary)]"`                                                 |
|     1 | `className="mb-2 text-3xl font-bold"`                                                                           |
|     1 | `className="mb-2 text-3xl font-semibold"`                                                                       |
|     1 | `className="text-2xl font-semibold text-slate-900"`                                                             |
|     1 | `className="text-xl font-bold mb-2"`                                                                            |
|     1 | `className="page-title mb-6"`                                                                                   |
|     1 | `className="page-title mb-1"`                                                                                   |
|     1 | `className="login-title"`                                                                                       |
|     1 | `className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl"`                 |
|     1 | `className="text-lg font-semibold"`                                                                             |
|     1 | `className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl"`                                       |
|     1 | `style={{ fontSize: 22, marginBottom: 10 }}`                                                                    |
|     1 | `style={{ fontSize: 22, fontWeight: 600 }}`                                                                     |
|     1 | `style={{ fontSize: 30, margin: '10px 0' }}`                                                                    |
|     1 | `style={{ fontSize: 30, marginTop: 0 }}`                                                                        |
|     1 | `style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 12, color: 'var(--text-strong)' }}` |

Non-canonical call sites, by signature:

- `text-2xl font-bold` — `app/admin/settings/integrations/twilio/page.tsx:179`,
  `app/admin/support/page.tsx:88`, `app/dashboard/crm/customers/page.tsx:54`,
  `app/dashboard/inventory/products/page.tsx:40`, `app/dashboard/notifications/page.tsx:94`,
  `app/dashboard/projects/[id]/page.tsx:51`, `app/dashboard/users/page.tsx:44`,
  `app/notifications/page.tsx:94`, `app/production/projects/page.tsx:99`,
  `app/sales/performance/page.tsx:133`, `components/reports/VisualReportBuilder.tsx:219`
- `text-xl font-bold` — `app/admin/crm/page.tsx:46,55,63`, `app/client/accept-invite/page.tsx:147`,
  `app/sales/deals/[id]/page.tsx:67`, `app/sales/leads/page.tsx:121`,
  `app/sales/pipeline/page.tsx:82`, `app/sales_manager/deals/[id]/page.tsx:44`,
  `app/sales_manager/pipeline/page.tsx:63`
- `text-2xl font-semibold` — `app/dashboard/compliance/page.tsx:170`,
  `app/dashboard/settings/notifications/page.tsx:90`, `app/signup/page.tsx:580,884`,
  `components/dashboard/CustomizableDashboard.tsx:255`
- `text-2xl font-bold text-[var(--text-primary)]` — `app/admin/page.tsx:153`,
  `app/admin/support/[ticketId]/page.tsx:136`, `app/dashboard/reports/[id]/page.tsx:89`,
  `app/offline/page.tsx:5`
- `text-2xl font-semibold text-[var(--text-primary)]` — `app/am_manager/performance/page.tsx:77`,
  `app/finance/performance/page.tsx:97`, `app/production_manager/performance/page.tsx:81`,
  `app/sales_manager/performance/page.tsx:182`
- `style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-strong)' }}` —
  `app/activity/layout.tsx:82`, `app/hierarchy/layout.tsx:82`, `app/team/layout.tsx:82`
- `style={{ fontSize: 24, fontWeight: 700 }}` — `app/admin/jobs/page.tsx:102`,
  `components/automation/WorkflowAutomationPage.tsx:214`,
  `components/hr/TimeTrackingDashboard.tsx:215`
- `style={headerStyle}` — `app/admin/users/[uid]/edit/page.tsx:315`,
  `app/admin/users/create/page.tsx:201`, `app/admin/users/roles/page.tsx:259`
- `style={styles.pageTitle}` — `app/admin/clients/[id]/edit/page.tsx:356`,
  `app/admin/clients/add/page.tsx:620`
- `text-3xl font-bold` — `app/admin/finance/budgets/create/page.tsx:122`,
  `app/admin/settings/tax-rates/page.tsx:154`
- `mb-6 text-2xl font-bold` — `app/admin/import/page.tsx:176`,
  `app/dashboard/crm/deals/page.tsx:60`
- `text-xl font-semibold` — `app/admin/settings/roles/page.tsx:122`, `app/search/page.tsx:27`
- `mb-3 text-2xl font-bold text-[var(--text-slate-deep)]` — `app/error.tsx:23`,
  `app/not-found.tsx:8`
- `text-3xl font-semibold text-[var(--text-primary)]` —
  `app/help/[category]/[slug]/page.tsx:61`, `app/help/search/page.tsx:25`
- singletons — `app/admin/finance/budgets/[id]/page.tsx:81`, `app/api-docs/page.tsx:9`,
  `app/admin/launch-checklist/page.tsx:128`, `app/client/accept-invite/page.tsx:138`,
  `app/invite/[token]/page.tsx:57`, `app/sales/leads/[id]/edit/page.tsx:137`,
  `app/login/page.tsx:316`, `app/pay/[invoiceId]/page.tsx:296,317`,
  `app/set-password/page.tsx:117`, `app/unauthorized/page.tsx:20`,
  `components/help-center/HelpCenterPageContent.tsx:191`,
  `components/layouts/AdminLayout.tsx:80`, `components/layouts/ERPLayout.tsx:113`,
  `components/pricing/PricingPageClient.tsx:288`

### 6.2 Distinct page-root wrappers

226 of 259 page roots resolved statically (33 return a component, a fragment, or a conditional
first). 57 distinct wrappers.

| Count | Wrapper                                                                                                                                                                                                    |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    90 | `<div className="space-y-6">` ← **canonical**                                                                                                                                                              |
|    15 | `<div style={{ width: '100%' }}>`                                                                                                                                                                          |
|    11 | `<div className="space-y-4">`                                                                                                                                                                              |
|    10 | `<div>`                                                                                                                                                                                                    |
|    10 | `<div className="w-full">`                                                                                                                                                                                 |
|     7 | `<div className="page-frame">`                                                                                                                                                                             |
|     5 | `<div className="p-6">`                                                                                                                                                                                    |
|     5 | `<div style={{ display: 'grid', gap: 20 }}>`                                                                                                                                                               |
|     5 | `<div className="space-y-6 p-6">`                                                                                                                                                                          |
|     5 | `<div className="min-h-screen bg-[var(--app-bg)]">`                                                                                                                                                        |
|     5 | `<div className="page-frame space-y-6">`                                                                                                                                                                   |
|     4 | `<div className="page-frame space-y-8">`                                                                                                                                                                   |
|     3 | `<ApprovalsPage>`                                                                                                                                                                                          |
|     2 | `<div style={styles.fullWidthWrap}>`                                                                                                                                                                       |
|     2 | `<div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>`                                                                                         |
|     2 | `<div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">`                                                                                                           |
|     2 | `<div className="space-y-1">`                                                                                                                                                                              |
|     2 | `<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>`                                                                                       |
|     2 | `<div className="page-frame space-y-4">`                                                                                                                                                                   |
|     2 | `<div className="p-6 space-y-8">`                                                                                                                                                                          |
|     2 | `<div className="max-w-xl space-y-6">`                                                                                                                                                                     |
|     1 | `<div className="space-y-5">`                                                                                                                                                                              |
|     1 | `<div className="space-y-6 p-4 md:p-8">`                                                                                                                                                                   |
|     1 | `<div className="p-6 space-y-6">`                                                                                                                                                                          |
|     1 | `<div className="p-6 space-y-4">`                                                                                                                                                                          |
|     1 | `<div className="p-6 max-w-md space-y-4">`                                                                                                                                                                 |
|     1 | `<div className="mt-6 space-y-6">`                                                                                                                                                                         |
|     1 | `<div className="page-frame w-full">`                                                                                                                                                                      |
|     1 | `<div className="card">` / `<div className="card p-4">` / `<div className="card p-6">`                                                                                                                     |
|     1 | `<div className="max-xl">` variants — `<div className="max-w-xl">`                                                                                                                                         |
|     1 | `<div style={{ maxWidth: 500 }}>`                                                                                                                                                                          |
|     1 | `<div className="min-h-screen" style={{ background: 'var(--app-bg)' }}>`                                                                                                                                   |
|     1 | `<div className="min-h-screen bg-[linear-gradient(180deg,var(--brand-navy)_0%,var(--brand-blue-light)_100%)] px-3 py-6 sm:px-4">`                                                                          |
|     1 | `<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>`                                                                                                                 |
|     1 | `<div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, sans-serif', gap: 16 }}>`                         |
|     1 | `<div className="card" style={{ borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: 'var(--alert-error-text)', marginTop: 16 }}>` |
|     1 | `<main className="p-6 space-y-6">`                                                                                                                                                                         |
|     1 | `<main className="mx-auto w-full max-w-7xl px-6 py-10">`                                                                                                                                                   |
|     1 | `<main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">`                                                                                                                                           |
|     1 | `<main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 print:max-w-none print:px-0">`                                                                                                                |
|     1 | `<main className="page-frame text-[var(--text-primary)]">`                                                                                                                                                 |
|     1 | `<main className="page-frame py-8 text-[var(--text-primary)]">`                                                                                                                                            |
|     1 | `<main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">`                                                                                                                 |
|     1 | `<main className="min-h-screen bg-[var(--app-bg)] px-6 py-16">`                                                                                                                                            |
|     1 | `<main style={{ minHeight: '100vh', background: 'var(--surface-card)', padding: '20px 12px 40px' }}>`                                                                                                      |
|     1 | `<Suspense>` · `<RequireAuth>` · `<ERPLayout>` · `<ResponsiveContainer>`                                                                                                                                   |
|     1 | `<span className="rounded-full bg-[color-mix(in_srgb,var(--color-yellow)_18%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--color-yellow)]">` (`app/billing/page.tsx:179`)                      |
|     1 | `<span className="inline-flex items-center rounded-full bg-[var(--erp-blue-soft)] px-3 py-1 text-xs font-semibold capitalize text-[var(--erp-blue)]">` (`app/settings/page.tsx:19`)                        |

Notable: `<div className="p-6 …">` (15 pages total) double-pads inside `.page-frame` — see F-11.
The three `max-w-7xl` (1280px) `<main>` roots in `app/help/*` and `app/api-docs` disagree with
`--page-max-width: 1400px`.

### 6.3 Distinct transition / duration values

Tailwind classes in `app/` + `components/`:

| Value          | Occurrences |
| -------------- | ----------: |
| `duration-300` |           6 |
| `duration-500` |           4 |
| `duration-200` |           3 |
| `duration-700` |           1 |

Inline `transition:` in TSX:

| Value                        | Occurrences |
| ---------------------------- | ----------: |
| `all 0.2s ease`              |           3 |
| `background-size 0.25s ease` |           2 |
| `left 0.55s ease`            |           1 |
| `color 0.2s ease`            |           1 |

Durations declared in `app/globals.css`:

| Value   | Occurrences | Notes                                            |
| ------- | ----------: | ------------------------------------------------ |
| `160ms` |          18 | de-facto base — `.kpi-card`, hovers, `.tab-pill` |
| `140ms` |           3 | `.btn` background / shadow / opacity             |
| `300ms` |           3 | drawer + sidebar                                 |
| `200ms` |           2 |                                                  |
| `0.15s` |           2 |                                                  |
| `320ms` |           1 |                                                  |
| `280ms` |           1 |                                                  |
| `220ms` |           1 |                                                  |
| `180ms` |           1 |                                                  |
| `100ms` |           1 | `.btn` transform                                 |
| `60ms`  |           1 |                                                  |
| `1.4s`  |           1 | `skeletonShimmer` keyframe                       |
| `2s`    |           1 |                                                  |
| `4.5s`  |           1 | notification toast progress                      |

Plus `transition-[margin] duration-300 ease-in-out` in `components/layout/AppShell.tsx:141`.

**18 distinct duration values** (excluding keyframe loops) where three tokens would do.

### 6.4 Sweep totals

| Sweep                                                                        | Result                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| (a) hardcoded `#hex` / `rgb()` / `rgba()` in UI `.tsx`                       | 130 in 79 files (676 total incl. `app/api` email templates) |
| (b) distinct `<h1>` signatures                                               | 30 (169 elements; 100 canonical)                            |
| (c) distinct page-root wrappers                                              | 57 (226 resolved of 259 pages)                              |
| (d) files with inline `bg-{color}-{50,100}` badge palettes                   | 51; plus 231 inline `borderRadius: 999` pills in 73 files   |
| (e) loading: skeleton 27 · spinner 2 · bare text 89 · flag-only 65 · none 76 | of 259 pages                                                |
| (f) empty: `<EmptyState>` 9 · `.table-empty` 4 · bare text 57 · none 23      | of 93 table pages                                           |
| (g) `animate-spin`                                                           | 5 sites (2 are the `Spinner`/`LoadingSpinner` primitives)   |
| (h) `alert()` / `confirm()`                                                  | 36 sites in 28 files                                        |
| (i) icon-only buttons missing `aria-label`                                   | **1** at `f0d3ce4`; **0** at `94caba7` (fixed in #939)      |
| (j) `tabular-nums`                                                           | **0** at `f0d3ce4`; system-wide rule added in #942          |
| (k) pages rendering `<Breadcrumbs>`                                          | **0** at `f0d3ce4`; rendered from `AppShell` since #940     |
| (l) distinct transition durations                                            | 18                                                          |

---

_Read-only audit. No `.tsx`, `.ts`, or `.css` file was modified by this report. Findings marked
RESOLVED were closed by PR #939, which landed independently on `main`._
