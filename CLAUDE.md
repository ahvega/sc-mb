# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The STORYCRAFTERS landing page (one-day documentary-storytelling masterclass by Media Builders, San Pedro Sula, 12 Dec 2026) as a **plain static site**, plus the original design handoff it was ported from. Unrelated to the parent repo's portfolio site (`E:\MyDevTools\legg-profile`, whose root `CLAUDE.md` covers that). No build, no package manager. All copy is Spanish — keep it so.

`README.md` (Spanish) is the original design spec: tokens, section layout, pricing-by-date rules, responsive breakpoints, pending content. `COLABORADOR.md` is the non-developer editing workflow.

## Layout

- `site/` — **the live site; the only thing deployed.** `index.html`, `css/styles.css`, `js/script.js`, `assets/`, `.htaccess`.
- `design/` — reference only, never deployed: `Storycrafters Landing.dc.html` (original DC-format source, can't render standalone — its runtime is absent), `reference-bundle.html` (original self-contained bundle, useful for visual comparison), `assets-unused/`.
- `.github/workflows/publish-deploy-branch.yml` — on push to `main` touching `site/**`, force-pushes the contents of `site/` to the `deploy` branch.

## Deploy

Hostinger Git auto-deploy tracks the **`deploy`** branch (not `main`) of `ahvega/sc-mb` for `sc.themediabuilders.com`. Hostinger can't filter files, so `deploy` holds only `site/` contents; `.htaccess` also 404s `.git`, `*.md`, `*.dc.html`. Never edit `deploy` by hand (it is force-pushed). Repo hooks block commits on `main`; branches are `<tipo>/<id>--<fuente>` (e.g. `chore/x--user`), merged by PR.

## Local preview

`.vscode/settings.json` points Live Server at `/site` (port 5500). Without VS Code: `python -m http.server 8000 --directory site`. `php -S` ignores `.htaccess`, so HTTPS/cache rules only show in production.

## Conventions

- Editable data lives in HTML attributes, not JS: tier cutoffs `data-end` on `.tier` (`-06:00`, Honduras has no DST — preserve it), countdown `data-target`, spots: the number inside `<span data-spots-left>` (script reads its text and sizes the bar), next-price notice text from the following tier's `data-start`. `script.js` only derives state (countdown, current tier, chat). FAQ is native `<details name="faq">`.
- Styles are class-based in `styles.css`; colors/fonts are `:root` tokens. Breakpoints: 1179px (the "Después" section switches layout), 859px (nav hides, sticky CTA + chat shift).
- **Every image added or replaced in `site/assets/` MUST be optimized (always, no exceptions).** Images are WebP only: run `python tools/optimize_images.py` (Pillow; JPG q80 / PNG lossless -> .webp, deletes the original) and reference the `.webp`. The `optimize-image` skill (ShortPixel) is an alternative and needs `SHORTPIXEL_API_KEY`.

## Gotchas

- Pending content is marked `.pending` (dashed box): logo, Héctor Galindo's photo, venue map, Google Form URL, payment link, bank details, WhatsApp/social links, `[48 H]`, and two FAQ policies (`[POLÍTICA PENDIENTE]`). Don't invent these.
- The original design had a 3-step in-page form (data → payment → confirmation) with no backend. The static port replaces it with a link to a Google Form plus payment details; do not reintroduce a fake form that submits nowhere.
- Spots counter is hand-edited; in production it should come from confirmed registrations.
- This directory is its own git repo (`ahvega/sc-mb`, public), nested inside the parent `legg-profile` checkout.
