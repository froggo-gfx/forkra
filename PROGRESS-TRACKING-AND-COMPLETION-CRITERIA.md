# Progress Tracking & Step Completion Criteria

## Refactor Intent (Non-Negotiable)

### The Problem We Are Solving

**Current state (BEFORE refactor):**

1. **Behavior semantics duplicated across modalities:**
   - Drag and nudge implement the same behavior (e.g., "equalize", "constrain") with different code paths
   - Adding a new behavior requires changes in multiple places
   - Bug fixes in one modality don't automatically apply to the other

2. **Object Kind logic scattered:**
   - Regular point behavior in `EditBehaviorFactory`
   - Skeleton point behavior in `SkeletonEditBehavior`
   - Rib point behavior in `RibEditBehavior`, `EditableRibBehavior`, `InterpolatingRibBehavior`
   - Handle behavior in `EditableHandleBehavior`
   - Each with different interfaces, no unified contract

3. **Pointer knows too much:**
   - `edit-tools-pointer.js` (6534 lines) contains behavior math, orchestration, AND transport
   - Adding a new object kind requires modifying pointer
   - Pointer helpers like `_handleEqualizeHandlesDrag` and `_handleArrowKeysForEqualizeSkeletonHandles` duplicate orchestration logic

4. **No clear composition model:**
   - Behavior Type × Object Kind combinations are hardcoded
   - No central registry of "what behaviors exist for which objects"
   - Modifier routing happens ad-hoc in pointer branches

**Result:** 9528 lines of entangled code where:
- Changes require touching multiple files
- Parity bugs between drag/nudge are inevitable
- New behavior/object combinations require surgery

---

### The Target State (AFTER refactor)

**Four clear layers with strict boundaries:**

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: BEHAVIOR TYPES (What)                              │
│ File: edit-behavior.js (≤2500 lines)                        │
│ - Action factories: Move, Constrain, Equalize, Interpolate  │
│ - Rule tables: when to apply which action                   │
│ - Presets: default, constrain, alternate, equalize, etc.    │
│ - NO knowledge of Object Kind or Modality                   │
└─────────────────────────────────────────────────────────────┘
                              ↓ defines
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: DATA ADAPTERS (Where)                              │
│ File: pointer-objects.js (≤600 lines)                       │
│ - RegularPointAdapter, SkeletonPointAdapter, etc.           │
│ - Unified interface: applyBehavior(), getRollback()         │
│ - Hit-test functions per object kind                        │
│ - NO behavior semantics, only data structure knowledge      │
└─────────────────────────────────────────────────────────────┘
                              ↓ implements
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: COMPOSITION (How to Combine)                       │
│ File: edit-behavior-composer.js (≤800 lines)                │
│ - resolveBehaviorPlan(): modifiers → (kind, type, modality) │
│ - createBehaviorExecutor(): compose adapter + behavior      │
│ - runDragOrchestration(): shared drag loop                  │
│ - runNudgeOrchestration(): shared nudge application         │
│ - NO direct event handling or glyph mutation                │
└─────────────────────────────────────────────────────────────┘
                              ↓ routes to
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: TRANSPORT (Input/Output)                           │
│ File: edit-tools-pointer.js (≤3500 lines)                   │
│ - Event handling: handleDrag, handleHover, handleArrowKeys  │
│ - Hit-test routing: which object kind was hit               │
│ - Transaction commit: editGlyph, sendIncrementalChange      │
│ - NO behavior math, NO data structure knowledge             │
└─────────────────────────────────────────────────────────────┘
```

**Key properties of the target state:**

1. **Behavior defined ONCE:**
   - `Equalize` behavior exists in one place (Layer 1)
   - Both drag and nudge call the same executor (Layer 3)
   - Bug fix in equalize math → fixed for all object kinds and modalities

2. **Object Kind encapsulated:**
   - `SkeletonPointAdapter` knows skeleton data structures
   - `RegularPointAdapter` knows regular contour structures
   - Both expose the same `applyBehavior()` interface

3. **Modality is transport-only:**
   - Drag = event stream + accumulation
   - Nudge = single delta application
   - Both use the same orchestration functions (Layer 3)

4. **Composition is explicit:**
   - `resolveBehaviorPlan("skeleton", "nudge", { alt: true })` → `{ behaviorType: "alternate", objectKind: "skeletonPoint", modality: "nudge" }`
   - `createBehaviorExecutor(plan)` → executor with `applyDelta()` method
   - Adding new combination = new plan entry, not new pointer branch

**Result:** 7400 lines with clear separation where:
- Behavior changes touch only Layer 1
- New object kinds add adapters in Layer 2
- Modality changes touch only Layer 3
- Pointer (Layer 4) is pure routing (~3500 lines → ~50% reduction)

---

### Concrete Benefits (Measurable)

| Benefit | Before | After | Metric |
|---------|--------|-------|--------|
| **Drag/Nudge parity** | Duplicated orchestration | Shared functions | 2→1 code paths per behavior |
| **Adding behavior type** | Modify pointer + each behavior class | Add to Layer 1 only | 5 files → 1 file |
| **Adding object kind** | Modify pointer extensively | Add adapter in Layer 2 | 3 files → 1 file |
| **Bug fix propagation** | Manual per-modality fix | Automatic via composer | 1 fix → all modalities |
| **Testability** | Test pointer integration only | Test each layer independently | 1 test surface → 4 test surfaces |
| **Code size** | 9528 lines total | ~7400 lines total | -22% reduction |
| **Pointer complexity** | 6534 lines | ≤3500 lines | -47% reduction |

---

### Non-Goals (Explicitly Out of Scope)

The following are **NOT** part of this refactor:

1. **New behavior types:** We are not adding new behaviors, only restructuring existing ones
2. **API breaks:** Public interfaces remain compatible
3. **Data schema changes:** No glyph data model modifications
4. **Visual changes:** Rendering remains identical
5. **Performance optimization:** Speed is not the goal; clarity is (though perf may improve as side effect)
6. **Metrics tool changes:** `edit-tools-metrics.js` is explicitly out of scope

---

## Progress Tracking Intent

This document exists for **one reason**: to prevent refactor drift, partial completions, and false progress claims.

**Every step must be verifiable against objective criteria.** If you cannot demonstrate completion with evidence, the step is **NOT DONE**.

---

## Expected Results (Plan-Wide)

After completing **all steps (01-19)**, the following **must** be true:

### 1. File Size Targets (Hard Metrics)

| File | Current | Target | Verification Command |
|------|---------|--------|---------------------|
| `edit-behavior.js` | 2994 lines | ≤ 2500 lines | `wc -l src-js/views-editor/src/edit-behavior.js` |
| `edit-tools-pointer.js` | 6534 lines | ≤ 3500 lines | `wc -l src-js/views-editor/src/edit-tools-pointer.js` |
| `edit-behavior-composer.js` | 0 lines | ≤ 800 lines | `wc -l src-js/views-editor/src/edit-behavior-composer.js` |
| `pointer-objects.js` | 0 lines | ≤ 600 lines | `wc -l src-js/views-editor/src/pointer-objects.js` |
| `skeleton-edit-behavior.js` | deleted | must not exist | `ls src-js/views-editor/src/skeleton-edit-behavior.js` → ENOENT |

**If targets are not met, the step is NOT COMPLETE.**

---

### 2. Architecture Layering (Hard Boundaries)

After Step 18, the following **must** be true:

| Layer | File | Responsibility | Forbidden |
|-------|------|----------------|-----------|
| **Layer 1** | `edit-behavior.js` | Behavior Types (action factories, rules, presets) | No transport logic, no event handling |
| **Layer 2** | `pointer-objects.js` | Data Adapters (hit-test, adapter factories) | No behavior semantics, no orchestration |
| **Layer 3** | `edit-behavior-composer.js` | Composition (plan resolution, executor creation, orchestration) | No direct event handling, no glyph mutation |
| **Layer 4** | `edit-tools-pointer.js` | Transport (event routing, transaction commit) | No behavior math, no data structure knowledge |

**Verification:** Grep each file for forbidden patterns. If found, the step is **NOT COMPLETE**.

---

### 3. Behavior Parity (Hard Requirement)

After **every migration step (10-17)**, the following **must** be true:

| Test Category | Scenarios | Source | Pass Criteria |
|---------------|-----------|--------|---------------|
| **Main Parity** | Regular point drag/nudge/hover | `docs/refactor/tunni-measure-baseline.md` Scenarios 1-6 | Identical to `main` branch |
| **Fork Parity** | Skeleton/rib/Tunni/Q-measure | `docs/refactor/tunni-measure-baseline.md` Scenarios 7-15 | Identical to pre-refactor baseline |
| **Regression** | All scenarios from baseline doc | `docs/refactor/tunni-measure-baseline.md` | Zero unexpected changes |

**If any scenario fails, the step is NOT COMPLETE.**

---

## Step Completion Criteria (Mandatory for Every Step)

A step is **COMPLETE** only if **ALL** of the following are true:

### ✅ Criterion 1: Code Changes Implemented

- [ ] All files listed in "Files Modified" section are changed
- [ ] All new files listed in "Files Created" section exist
- [ ] All files listed in "Files Deleted" section are deleted
- [ ] No unexpected files are modified (check `git status`)

**Verification:** Run `git status --porcelain` and compare against expected changes.

---

### ✅ Criterion 2: Imports/Exports Verified

- [ ] All imports referenced in step mockups actually exist
- [ ] All exports from new files are documented
- [ ] No circular dependencies introduced
- [ ] `node --check` passes for all modified files

**Verification:**
```bash
node --check src-js/views-editor/src/<modified-file>.js
```

---

### ✅ Criterion 3: Manual Testing Completed

- [ ] All test scenarios listed in "Manual Testing" section executed
- [ ] Each scenario marked PASS or FAIL with evidence
- [ ] Main-parity check completed (regular-only flows)
- [ ] Fork-parity check completed (skeleton/rib/Tunni/Q-measure)

**Evidence Required:** Screenshot or screen recording for at least **one** scenario per step.

---

### ✅ Criterion 4: No Runtime Errors

- [ ] Browser console shows zero errors during testing
- [ ] No `ReferenceError`, `TypeError`, or `ImportError` in console
- [ ] Application builds successfully (`npm run build` or equivalent)

**Verification:** Run app, exercise modified flows, capture console output.

---

### ✅ Criterion 5: Progress Report Filed

- [ ] Progress report template completed (see below)
- [ ] All sections filled with specific evidence
- [ ] Line counts documented with actual numbers
- [ ] Git commit hash referenced

---

## Progress Report Template (Mandatory Format)

Copy and fill this template for **every completed step**:

```markdown
---
## PROGRESS REPORT: Step XX - [Step Name]

**Date Completed:** YYYY-MM-DD
**Completed By:** [Your Name/AI Session ID]
**Git Commit:** `<commit-hash>`

---

### Files Modified

| File | Lines Before | Lines After | Change |
|------|--------------|-------------|--------|
| `path/to/file.js` | NNNN | NNNN | +XX / -YY |

**Total Net Change:** +XX lines / -YY lines

---

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `path/to/new-file.js` | NNN | Brief description |

---

### Files Deleted

| File | Previous Lines | Reason |
|------|----------------|--------|
| `path/to/deleted-file.js` | NNN | Brief reason |

---

### Imports/Exports Verification

**New Imports Added:**
```javascript
import { functionName } from "./source-file.js";
```

**New Exports Added:**
```javascript
export function newFunction() { ... }
export class NewClass { ... }
```

**Circular Dependency Check:**
- [ ] `node --check` passed for all modified files
- [ ] No circular import warnings in console

---

### Manual Testing Results

**Test Scenarios Executed:**

| Scenario ID | Description | Expected | Actual | Status |
|-------------|-------------|----------|--------|--------|
| Baseline-XX | [From baseline doc] | [Expected behavior] | [Observed behavior] | PASS/FAIL |
| Main-Parity-XX | [Regular-only test] | [Matches main] | [Observed] | PASS/FAIL |
| Fork-Parity-XX | [Skeleton/rib test] | [Matches baseline] | [Observed] | PASS/FAIL |

**Evidence:**
- Screenshot/screen recording: [link or attachment]
- Console output (no errors): [paste or attachment]

---

### Completion Criteria Checklist

- [ ] **Criterion 1:** All code changes implemented (git status verified)
- [ ] **Criterion 2:** Imports/exports verified (node --check passed)
- [ ] **Criterion 3:** Manual testing completed (all scenarios PASS)
- [ ] **Criterion 4:** No runtime errors (console clean)
- [ ] **Criterion 5:** Progress report filed (this document)

**Overall Status:** ✅ COMPLETE / ❌ INCOMPLETE

---

### Notes / Blockers

[Any issues encountered, decisions made, or follow-up required]

---

### Next Step Readiness

- [ ] Baseline regression check completed
- [ ] No unresolved blockers
- [ ] Ready to proceed with Step XX+1

**Sign-off:** [Your Name/AI Session ID]
```

---

## Enforcement Rules (Non-Negotiable)

### Rule 1: No Partial Credit

A step is either **DONE** or **NOT DONE**. There is no "mostly complete".

- If 9/10 test scenarios pass → **NOT DONE**
- If line count target missed by 50 lines → **NOT DONE**
- If one import is wrong → **NOT DONE**

### Rule 2: Evidence Required

Claims without evidence are **invalid**.

- "Tested manually" → **INVALID** (provide scenario results)
- "No errors" → **INVALID** (provide console output)
- "Works fine" → **INVALID** (provide screenshot/recording)

### Rule 3: Baseline is Law

If baseline scenario behavior changes and the step did not explicitly target that change → **STEP FAILS**.

**Exception:** Intentional behavior changes documented in the step description with explicit "Expected Change" section.

### Rule 4: Git History is Truth

If it's not committed, it didn't happen.

- Every step must have a dedicated commit
- Commit message must reference step number
- `git status --porcelain` must be clean after commit

### Rule 5: No Silent Failures

If you encounter a blocker:

1. **Stop** the current step
2. **Document** the blocker in progress report
3. **Escalate** to plan owner for resolution
4. **Do not** work around the blocker silently

---

## Audit Checklist (For Plan Owner Review)

When reviewing a progress report, verify:

- [ ] Line counts match actual file state (`wc -l` verification)
- [ ] Git commit hash is valid and contains expected changes
- [ ] Test scenarios reference baseline document correctly
- [ ] Imports/exports actually exist (grep verification)
- [ ] No unexpected files modified (git diff verification)
- [ ] Console output shows zero errors
- [ ] Screenshot/recording evidence provided

**If any audit check fails, reject the progress report and request re-submission.**

---

## Escalation Path

If a step cannot be completed:

1. **File incomplete progress report** with blocker section filled
2. **Tag plan owner** for review
3. **Plan owner decides:**
   - Adjust step scope (update plan)
   - Provide additional guidance
   - Reassign step
4. **Resume work** only after resolution

---

## Summary: What "Done" Looks Like

A step is **DONE** when:

1. ✅ Code changes match plan exactly
2. ✅ All files pass syntax check
3. ✅ All baseline tests pass
4. ✅ No runtime errors
5. ✅ Progress report filed with evidence
6. ✅ Git commit pushed

**Anything less is NOT DONE.**

---

## Start Here

**Begin with Step 08:** Create `edit-behavior-composer.js` per `PLAN-CONSOLIDATED-POINTER-BEHAVIOR-REFACTOR.md`. File progress report below:
