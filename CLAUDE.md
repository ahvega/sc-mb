# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

A **design handoff package** for the STORYCRAFTERS landing page (one-day documentary-storytelling masterclass by Media Builders, San Pedro Sula, 12 Dec 2026). It is **not a project with a build, tests, or package manager**, and it is unrelated to the parent repo's portfolio site (`E:\MyDevTools\legg-profile`, whose root `CLAUDE.md` covers that). The README states the files are hi-fi *references* to be recreated in a real stack (suggested: Next.js/Astro + Tailwind, or static site + light backend), not production code to ship.

`README.md` (Spanish) is the authoritative spec: design tokens, section-by-section layout, pricing-by-date rules, 3-step form flow, responsive breakpoints, asset list, and pending content. Read it before changing anything; don't duplicate it here. All copy is Spanish — keep it so.

## Files

- `index.html` — self-contained bundle (~3.7 MB, assets inlined, has a `__bundler_*` loader). Open directly in a browser. **Generated output; do not hand-edit.** (README calls it `Storycrafters Landing.html`; the actual filename is `index.html`.)
- `source/Storycrafters Landing.dc.html` — the editable source (~69 KB). Markup with inline styles plus one `<script type="text/x-dc" data-dc-script>` at the end containing `class Component extends DCLogic`.
- `assets/` — images referenced by the source (`*-web.jpg` are the compressed ones actually used; `luis-emilio.jpg`/`luis-emilio-2.jpg` are unused alternates).

## Source format (`.dc.html`)

A custom "DC" component format, not plain HTML/React:
- Templating is via `<x-dc>`, `<sc-if value="{{ flag }}">`, `<sc-for>`, and `{{ expr }}` bindings against the object returned by `renderVals()`. The `hint-placeholder-val` attribute is editor-only preview data.
- `<helmet>` holds `<head>` additions (Google Fonts, global CSS).
- Props (`grain`, `showCountdown`, `spotsLeft`, …) are declared in the `data-props` JSON on the script tag with editor types/defaults; `renderVals()` reads them from `this.props`.
- `<image-slot>` elements are drop-in image placeholders (hero logo, Héctor Galindo photo).
- Logic is one class: `state` (`w`, `now`, `open`, `chat`, …), a resize listener and a 1 s `setInterval` tick in `componentDidMount`, and `renderVals()` which derives everything — breakpoint flags (`isMobile` <860, `despuesWide` ≥1180), the `DD:HH:MM:SS` countdown to `2026-12-12T08:00:00-06:00`, the FAQ array, and the price tiers.
- **The runtime is not in this package:** `./support.js` (DCLogic/`x-dc` runtime) and `./image-slot.js` are referenced but absent, so the source cannot be rendered on its own. Use the bundled `index.html` for visual checks; edit the source only as a reference/spec, or to regenerate the bundle in the original design tool.

## Gotchas

- Dates/prices are hard-coded in `renderVals()` (tier `end` timestamps, the countdown target, the FAQ). The README wants these to become editable data (CMS/config) in the real implementation, since STORYCRAFTERS recurs.
- Tier selection uses `-06:00` (Honduras, no DST) timestamps; preserve that offset when porting.
- Spot counter (`spotsLeft`) is a prop in the prototype but must come from the backend (confirmed registrations) in production.
- Several FAQ answers are literally `[POLÍTICA PENDIENTE]`, and the README's "Pendientes de contenido" lists other open items (logo, Héctor's photo, payment link, bank details). Don't invent these.
- This directory is its own git repo (`ahvega/sc-mb`, public), nested inside the parent `legg-profile` checkout.
