# ADR 0005 — Studio shell, routing and design tokens

**Status:** accepted (Phase 01)

- Routes: `/` (lesson list), `/lesson/:lessonId` (studio), `*` (404). Router definitions are plain
  `RouteObject[]` so tests mount them with `createMemoryRouter`.
- The studio is three panels: **Source PDF | Teaching board | Controls**. ≥1024px shows all three;
  narrower screens show one panel at a time through an accessible tablist (arrow-key navigation),
  mirrored in `?panel=source|board|controls`. Invalid values fall back to `board`.
- Design tokens are CSS custom properties in `styles/tokens.css` with a dark scheme via
  `prefers-color-scheme`, a visible focus ring, and a skip link. Reusable components live in
  `src/ui` (`Button`, `Panel`, `EmptyState`, `ErrorBanner`).
- The recorded video must contain the board only (AGENTS.md), so the board surface is its own
  16:9 element, separate from panel chrome.
