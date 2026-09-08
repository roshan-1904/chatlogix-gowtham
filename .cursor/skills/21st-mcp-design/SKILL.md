---
name: 21st-mcp-design
description: >-
  Ground ChatLogix UI work in 21st.dev MCP (user-21st) for layout patterns and
  color themes, then map results onto @chatlogix/design-tokens. Use when the
  user asks for UI, layout, styling, design patterns, color themes, palettes,
  21st, shadcn inspiration, signup/onboarding polish, or visual redesign.
---

# 21st MCP design patterns and color themes

## Load context first

Read `.21st/design.json` and `.21st/DESIGN.md`. Brand lock: navy `#072349` (`primary-500`) + WhatsApp green `#25D366` (`secondary-500`). Light mode, Inter, Tailwind v3 — not shadcn CSS variables in the running app.

## MCP (namespace `user-21st`)

Discover the tool schema, then:

1. **Patterns:** `get_inspiration` with `query` plus `context` set to the design.json object.
2. **Themes:** `search` with `type: "theme"` (optional `color`: `blue` or `green`). Fetch CSS with `get_theme`. Map; do not paste into `index.css`.
3. **User choice:** `search_picker` when they should pick a component or theme.
4. **Code:** reuse `@chatlogix/ui`. Call `get_component` only after a clear fit (metered).
5. **Generate:** `generate` with the same `context` only if search is empty. Implement from `copyPrompt`; do not paste sketch HTML.

## Adapt 21st / shadcn output

Rewrite classes using `design.tailwindAliases` in design.json. ChatLogix `secondary` is green, not gray. Prefer existing `Button`, `Input`, `Card`, `Badge`, `Modal`.

## Do not

- Replace the brand pair with a community theme
- Load `.21st/chatlogix-theme.css` in Vite
- Add dark mode, glass, or purple-blue gradients unless asked
- Record a new visual direction without appending `decisions` in design.json
