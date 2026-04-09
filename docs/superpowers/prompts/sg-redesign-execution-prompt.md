# SG Interface Redesign — Execution Prompt

> **Copy everything below the line into a fresh Claude Code Opus 4.6 session.**

---

## Task

Execute the SG Interface visual redesign for the Priority Reports dashboard. Replace the Apple blue/slate aesthetic with the SG Interface warm gold/cream design system across all client components.

## Documents (read ALL three before starting)

- **Spec:** `docs/superpowers/specs/2026-04-09-sg-interface-redesign.md`
- **Plan:** `docs/superpowers/plans/2026-04-09-sg-interface-redesign.md`
- **Eval:** `docs/superpowers/evals/2026-04-09-sg-interface-redesign-eval.md`

## Reference Implementation

The Sales Dashboard v1 at `/Users/victorproust/Documents/Work/SG Interface/Sales Dashboard v1/` is the gold standard. When in doubt about any visual pattern, read its components — especially:
- `client/src/styles/index.css` — tokens
- `client/src/components/right-panel/ItemsToolbar.tsx` — toolbar pattern
- `client/src/components/right-panel/ItemsTable.tsx` — table styling

## Execution Workflow

### Phase 1: Plan Execution

Use `/subagent-driven-development` to execute the plan. The plan has 12 tasks grouped into natural phases.

**Parallelization strategy** — use `/dispatching-parallel-agents` for these independent task groups:

- **Parallel batch 1 (after Task 1 token layer is done):** Tasks 2 + 3 + 4 can run in parallel (shared constants, layout shell, nav tabs — no file overlap)
- **Task 5 runs alone** (toolbar redesign — structural change, needs focused attention)
- **Parallel batch 2 (after Task 5):** Tasks 6 + 7 + 8 + 9 can run in parallel (table, pagination/feedback, filters, columns/sort — no file overlap)
- **Parallel batch 3:** Tasks 10 + 11 in parallel (modals, cell/detail components — no file overlap)
- **Task 12 runs alone** (final verification)

### Phase 2: Eval Checkpoints

Follow the **Verification Schedule** in the eval doc. At each checkpoint:
1. Run the specified eval section checks
2. Paste the command output as proof
3. Fix any failures before proceeding to the next phase

After all tasks complete, run the **Quick Smoke Test**:
```bash
bash scripts/sg-eval.sh
```
All checks must PASS.

### Phase 3: Design Critique

After all code changes are done and the smoke test passes:

1. Start the dev servers (`npm run dev` in both `server/` and `client/`)
2. Use `/design-critique` with the `/design-sg-interface` skill active
3. The critique should evaluate against the SG Interface design system tokens — exact hex values, spacing, shadows, not vibes
4. Focus areas for the critique:
   - **Page warmth:** Does the page *feel* warm cream, not cold gray?
   - **Card elevation:** Are cards floating with subtle shadow, or visually flat?
   - **Active states:** Do dark active pills and gold accents create clear hierarchy?
   - **Toolbar compactness:** Does the icon toolbar feel integrated, not alien?
   - **Status row contrast:** Do expired/expiring rows still pop against the warm background?
   - **Text hierarchy:** Can you visually distinguish all 4 text levels (primary → secondary → muted → faint)?
   - **Scrollbar subtlety:** Is the scrollbar gold-tinted and thin (4px)?

Dispatch this critique as a **fresh subagent** — it should have NO context from the implementation work. Give it:
- The SG Interface design skill reference (`/design-sg-interface`)
- The spec file path
- The running dev server URL (`http://localhost:5173`)
- Instructions to use `preview_screenshot`, `preview_inspect`, and `preview_snapshot` to verify

### Phase 4: Refinement Loop

Use `/loop` to iterate on the design critique findings:

```
/loop 1x design-refinement
```

**Loop body:**
1. Read the critique subagent's findings
2. For each HIGH or CRITICAL finding:
   - Fix the issue in the source code
   - Verify the fix with `preview_inspect` (exact computed values)
   - Commit the fix
3. Re-run the smoke test (`bash scripts/sg-eval.sh`) — must still all PASS
4. Dispatch a **second fresh critique subagent** (same instructions as Phase 3) to verify the fixes landed
5. If the second critique finds new HIGH/CRITICAL issues, fix and re-critique (max 2 iterations to prevent doom loops)
6. Once the second critique reports no HIGH/CRITICAL issues, the loop is done

### Phase 5: Final Gate

1. Run the full smoke test one last time — paste output
2. Take a `preview_screenshot` of the main dashboard view
3. Take a `preview_screenshot` with a modal open (Extend Expiry)
4. Take a `preview_screenshot` with the filter panel open
5. Present all three screenshots to me for final approval

## Skills to Use

| Skill | When |
|-------|------|
| `/subagent-driven-development` | Phase 1 — execute plan tasks via subagents |
| `/dispatching-parallel-agents` | Phase 1 — run independent task groups concurrently |
| `/design-sg-interface` | All phases — the design system reference (tokens, recipes, checklist) |
| `/design-critique` | Phase 3 — structured design review against SG Interface spec |
| `/loop` | Phase 4 — iterate on critique findings until clean |
| `/verification-before-completion` | Phase 5 — final evidence before declaring done |

## Rules

- **Never skip eval checkpoints.** The verification schedule exists to catch issues early.
- **Show proof.** Paste command output and screenshot evidence. "I verified it" is not proof.
- **Toolbar is the hardest task.** Give Task 5 extra attention — read the Sales Dashboard v1 `ItemsToolbar.tsx` thoroughly before writing code.
- **Status rows stay as-is.** Do NOT change the red/orange/amber expiry status styling.
- **No hardcoded colors after this.** Every single color must be a `var(--)` reference. The smoke test enforces this with grep.
- **Files under 200 lines.** If the toolbar redesign pushes past 200, split into `TableToolbar.tsx` + `ToolbarIcon.tsx`.
- **Doom loop defense:** Same file edited 5+ times for the same issue → stop, re-read spec, try different approach. Same check fails 3x → ask the user.
