# Piano Smart Interactive Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a detailed, interactive, local-only guide that teaches users how to use Piano Smart.

**Architecture:** A focused Vue guide component owns section navigation and a local editable example. Static copy lives in a dedicated content module and the existing Piano Smart view opens the guide from its header.

**Tech Stack:** Vue 3, `<script setup>`, existing AppDialog/WButton styles, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-09-24-piano-smart-guida-interattiva-design.md`

## Global Constraints

- The guide must not call APIs, mutate Pinia state, save plans, or move money.
- User-facing copy must be Italian and describe only real Piano Smart behavior.
- Preserve responsive layout, visible focus, reduced motion, and existing theme tokens.

## Review Focus

- Edited example allocations must never produce a misleading total: test total and remaining amount.
- Closing and reopening the guide must reset to the first section: test lifecycle behavior.
- Keyboard users must be able to move between sections and close the guide: test labels/buttons.
- The guide must explicitly state that it does not move money: test required copy.
- Mobile layouts must not depend on fixed-width content: verify CSS media rules and build.

### Task 1: Static guide content and local example

**Files:**
- Create: `client/src/content/pianoSmartGuide.js`
- Create: `client/tests/pianoSmartGuide.test.js`

- [ ] Write failing tests for five sections, required disclaimer, five categories, and local allocation total.
- [ ] Run `cd client && node --test tests/pianoSmartGuide.test.js` and confirm the missing module failure.
- [ ] Implement immutable section content and `GUIDA_ESEMPIO` with `totale`, `allocazioni`, and `calcolaTotale`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Interactive guide component

**Files:**
- Create: `client/src/components/piano-smart/PianoSmartGuide.vue`

- [ ] Build an accessible dialog-like guide with five sections, progress indicator, previous/next controls, close action, and final CTA.
- [ ] Add editable example inputs that use the content helper to show distributed and remaining totals.
- [ ] Add category explanations, real workflow steps, data-used list, and limitations copy.
- [ ] Add scoped responsive styles using existing design tokens, focus states, and reduced-motion behavior.

### Task 3: Integrate with Piano Smart

**Files:**
- Modify: `client/src/views/PianoSmartView.vue`
- Create: `client/tests/pianoSmartView.test.js`

- [ ] Add a failing integration assertion that the view imports/renders `PianoSmartGuide` and opens it from “Come funziona?”.
- [ ] Replace the short `AppDialog` with the guide while preserving the plan-detail dialog.
- [ ] Run focused tests and frontend build.

### Task 4: Full verification

- [ ] Run `cd client && npm test` if available, otherwise the repository’s frontend test command.
- [ ] Run `cd client && npm run build`.
- [ ] Review the diff for accidental API/store changes and report files and remaining risks.
