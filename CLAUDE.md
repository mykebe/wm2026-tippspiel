# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A World Cup 2026 prediction league (WM-Tippspiel) — a single-page web app where registered users submit match score predictions and earn points based on accuracy. Built with vanilla JS and Firebase; no build step.

Then open `http://localhost:8000`. There is no npm, no bundler, no build step — files are served as-is with ES module imports from the Firebase CDN.

## Architecture

**Single-file SPA** — `index.html` holds `<template>` tags for all views; `app.js` clones and renders them via the DOM. Three views: Spiele (matches + leaderboard), Turnierbaum (bracket), Admin.

**Firebase backend:**
- Auth: email/password; admin identity is the email in `firebase-config.js`
- Firestore collections: `users`, `matches`, `bets`, `tournament`
- Security rules in `firestore.rules` — bets are time-locked at kickoff

**Tournament data flow:**
- `tournament-2026.js` defines all 104 matches (72 group + 32 KO) as a static structure
- Admin initializes tournament, which writes all match documents to Firestore
- KO match teams are resolved client-side at render time via `resolveRef()` in `app.js`, which walks group results to determine winners/runners-up

## Key Files

| File | Purpose |
|------|---------|
| `app.js` | All UI rendering, routing, scoring logic, Firebase calls |
| `firebase-config.js` | Firebase credentials + `ADMIN_EMAIL` constant |
| `tournament-2026.js` | Hardcoded WM 2026 bracket structure (groups A–L, KO round pairings) |
| `firestore.rules` | Firestore security rules — enforce bet time-lock and per-user write isolation |
| `style.css` | CSS custom properties, responsive layout (max-width 720px) |

## Scoring System

- **3 pts** — exact score
- **1 pt** — correct outcome (home/draw/away)
- **0 pts** — otherwise

Points are written to `users/{uid}.totalPoints` via Firestore `increment()` when the admin finalizes a match result.

## Firestore Data Model

```
users/{uid}           — name, email, totalPoints
matches/{matchId}     — teams, kickoff, scores, homeRef/awayRef for KO rounds
bets/{matchId}_{uid}  — homeGoals, awayGoals, points
tournament/config     — teams mapping (group → [team names]), seeded flag
```

The bet document ID `{matchId}_{uid}` is intentional — it makes upserts idempotent and lets each user have exactly one bet per match.

## Non-Obvious Patterns

- **KO match resolution**: `resolveRef()` in `app.js` iterates matches to resolve `homeRef`/`awayRef` strings like `"W_A1"` (winner of Group A match 1) into actual team names. A safety loop counter prevents infinite loops if results are incomplete.
- **Group standings**: Calculated entirely client-side from finished match data — not stored in Firestore.
- **Template rendering**: Views are cloned from `<template>` elements in `index.html`, not created from strings, so `escapeHtml()` is only needed in edge cases.
- **KO bracket note**: `tournament-2026.js` has a comment that the R32 pairings are a plausible placeholder; the real FIFA draw may differ and will need updating.
