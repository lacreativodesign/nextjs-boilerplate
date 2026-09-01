# Bizosto Executive Workspace — Design Lock

Status: Locked platform direction  
Applies to: `lacreativodesign/nextjs-boilerplate`  
Authority: Bizosto Product Constitution v1.1

## Product experience

Bizosto must feel like a calm, premium operating environment for service businesses—not a
generic SaaS dashboard. The interface prioritizes decisions, accountability, operational flow,
and long-session comfort. Existing product behavior, roles, entitlements, approvals, billing,
audit events, integrations, and tenant isolation are never changed by visual migrations.

## Theme direction

### Light

- Pearl canvas with white elevated surfaces.
- Pale blue theme-responsive navigation.
- Deep navy headings and cool neutral interface text.
- Electric blue and cyan reserved for primary actions, focus, progress, AI, and decisions.

### Dark

- Meta-style graphite canvas (`#18191A`).
- Primary surfaces (`#242526`) and elevated surfaces (`#303132`).
- Subtle borders around `#3A3B3C`.
- A slightly deeper graphite/navy navigation surface.
- Pearl text and pale cool-blue headings.

Light and dark preserve identical layout, data, actions, hierarchy, and route access. Theme is
art-directed per mode; it is not an automatic inversion.

## Brand system

- Signature gradient: `#1E4DE8 → #5A84FF → #55DFF0`.
- Sora is the default display face.
- DM Sans is the default interface face.
- Enterprise tenant white-label fonts and colors remain supported and override Bizosto defaults.
- The gradient is limited to active navigation, activation progress, AI intelligence, approvals,
  primary actions, and next-decision surfaces.

## Density and hierarchy

- Comfortable density is the default.
- Compact density is a saved per-browser user preference.
- A Command Center shows at most four primary KPIs, one main work surface, and one attention or
  approval queue before secondary information.
- Secondary detail belongs in tabs, drawers, filters, or progressive disclosure—not competing
  cards above the fold.
- Every entitled capability remains discoverable. Disabled plan modules remain visible through a
  safe locked/upgrade state. Deferred capabilities must be labeled truthfully and must not appear
  functional.

## Navigation

- Navigation is grouped by operating purpose: Workspace, Revenue, Delivery, Finance & insights,
  People, Manage, and Platform.
- Sidebar colors respond to light/dark mode.
- Desktop supports expanded and collapsed states; mobile uses an off-canvas drawer.
- Global command search is always available in the header and through the keyboard shortcut.
- Help Center is part of the authenticated shell. Client users never receive subscriber support or
  internal-AI access.

## Shared patterns

- Use semantic tokens instead of raw theme colors.
- Use the shared workspace page header, section, card, metric, decision, modal, confirmation,
  empty-state, skeleton, table, pagination, filter, and status patterns.
- Loading is layout-aware skeleton UI. Do not use blank loading screens or page-level spinners.
- Buttons, links, cards, table actions, drawers, and menus must be keyboard operable.
- Horizontal scrolling is confined to data tables; pages must not overflow.

## Non-negotiable verification

- WCAG 2.2 AA contrast and visible focus.
- Full keyboard navigation and reduced-motion support.
- Light/dark verification at desktop, tablet, and mobile widths.
- Role, entitlement, activation, billing, and permission coverage.
- Tenant isolation, finance immutability, Stripe lifecycles, and server authorization unchanged.
- Production build, typecheck, lint, tests, bundle budgets, and visual-regression coverage pass.

Any change to these locked rules requires an explicit, versioned product decision.
