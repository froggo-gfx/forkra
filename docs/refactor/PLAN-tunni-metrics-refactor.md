       1 +# Tunni + Metrics/Q Refactor Plan
       2 +
       3 +Date: 2026-03-06
       4 +Status: Draft
       5 +Source of truth for architectural boundaries: `docs/refactor/sot-unified-behavior.md`
       6 +
       7 +## Summary
       8 +
       9 +This plan is for the next cleanup chapter after the broad unified-behavior work.
      10 +
      11 +It is not a second broad refactor.
      12 +
      13 +It is not a reason to reopen the finished point-like drag/nudge migration.
      14 +
      15 +It is a focused plan for the two active lanes that were explicitly left for later:
      16 +
      17 +1. Tunni
      18 +2. Q-measure / distance-angle
      19 +
      20 +The old branch plan found real problems.
      21 +
      22 +This rewritten plan keeps those valid findings, but adapts them to the architecture that now
           actually exists in this branch:
      23 +
      24 +- pointer/composer/registry/adapters are already the accepted routing shape
      25 +- Tunni already exists in the routing surface as fallback drag object kinds
      26 +- Q-measure is still an out-of-scope hover/mode workflow, not part of the unified point-like
           drag/nudge pipeline
      27 +- equalize drag/nudge for in-scope point-like routes is already migrated and should not be r
          e-decided here
      28 +
      29 +The work in this plan is split into these phases:
      30 +
      31 +0. Lock the scope, reporting rules, and baseline scenarios.
      32 +1. Separate pure regular-Tunni geometry from mixed interaction code.
      33 +2. Remove regular Tunni execution ownership from core and pointer private handlers.
      34 +3. Remove skeleton Tunni execution ownership from pointer private handlers.
      35 +4. Make Q-measure state ownership honest and centralized.
      36 +5. Extract Q-measure hover target resolution into one explicit helper.
      37 +6. Split visualization-layer ownership by domain and clean up `distance-angle.js`.
      38 +7. Share generated-contour exclusion logic across Tunni and measure code.
      39 +8. Close the remaining supporting tech debt and run the chapter closeout sweep.
      40 +
      41 +## Reporting Rule For This Plan
      42 +
      43 +This plan should not write progress into the old broad or beautify reports.
      44 +
      45 +Use:
      46 +
      47 +- `docs/refactor/progress-report-broad.md`
      48 +  - only for already-completed broad architecture milestones
      49 +- `docs/refactor/progress-report-beautify.md`
      50 +  - only for the completed cleanup/optimization chapter that already happened
      51 +- `docs/refactor/progress-report-tunni-metrics.md`
      52 +  - use this plan's step-by-step work here
      53 +
      54 +Rule:
      55 +
      56 +- every finished step in this plan must end with a new entry in `docs/refactor/progress-repo
          rt-tunni-metrics.md`
      57 +- do not write new Tunni/Q step entries into `progress-report-broad.md`
      58 +- do not write new Tunni/Q step entries into `progress-report-beautify.md`
      59 +
      60 +Required entry format for `docs/refactor/progress-report-tunni-metrics.md`:
      61 +
      62 +- Step header (`Phase X - Step Y`)
      63 +- Problem
      64 +- Code analysis
      65 +- Comparison
      66 +- Manual test results
      67 +- Undo/redo verification
      68 +
      69 +---
      70 +
      71 +## Phase 0: Lock Scope, Reporting, And Baseline Before Touching Ownership
      72 +
      73 +### Broad Problem
      74 +
      75 +The old Tunni/metrics plan was written for a different branch.
      76 +
      77 +That makes two kinds of mistakes likely:
      78 +
      79 +- it can ask for real fixes using the wrong architecture
      80 +- it can accidentally reopen the finished broad refactor just because the old plan still tal
          ks that way
      81 +
      82 +Before touching code, this chapter needs one explicit scope lock:
      83 +
      84 +- what is still wrong now
      85 +- what is already considered finished
      86 +- what manual scenarios define parity for this chapter
      87 +
      88 +### Step 0.1: Write down the exact difference between the old branch assumptions and the cur
          rent branch reality
      89 +
      90 +#### Problem Aspect
      91 +
      92 +If this chapter starts from the old plan's assumptions, it will drift immediately.
      93 +
      94 +The main risks are:
      95 +
      96 +- treating Tunni like it still needs a new routing architecture from scratch
      97 +- treating pointer decomposition as the primary goal instead of honest ownership
      98 +- treating Q-measure like it belongs inside composer/adapters just because the branch now ha
          s those modules
      99 +
     100 +#### Proposed Solution (Plain Language)
     101 +
     102 +Write down one explicit statement of current reality before any code move:
     103 +
     104 +- the broad unified-behavior refactor is already done
     105 +- Tunni is currently routed as fallback drag object kinds
     106 +- Q-measure is still an out-of-scope hover/mode workflow
     107 +- this chapter is about ownership cleanup, pure-math separation, and state honesty
     108 +  - not about inventing a new point-like pipeline
     109 +
     110 +This step is documentation only.
     111 +
     112 +#### Code Evidence
     113 +
     114 +Current branch evidence to cite:
     115 +
     116 +- `docs/refactor/sot-unified-behavior.md`
     117 +- `docs/refactor/progress-report-broad.md`
     118 +- `docs/refactor/progress-report-beautify.md`
     119 +- `src-js/views-editor/src/edit-behavior-registry.js`
     120 +- `src-js/views-editor/src/edit-behavior-composer.js`
     121 +- `src-js/views-editor/src/edit-behavior-adapters.js`
     122 +
     123 +Important current-shape evidence:
     124 +
     125 +```js
     126 +// registry: Tunni exists as fallback drag object kinds
     127 +tunniPoint: { selectionKey: null, supports: ["drag"] }
     128 +skeletonTunniPoint: { selectionKey: null, supports: ["drag"] }
     129 +```
     130 +
     131 +```js
     132 +// composer: Tunni uses the existing routing shape
     133 +const adapter = getDragAdapterForRouting(routing, objectKind);
     134 +```
     135 +
     136 +```js
     137 +// adapters: fallback Tunni routes still bounce back into pointer private methods
     138 +tunniPoint: async (context) => runFallbackTunniDrag(context)
     139 +skeletonTunniPoint: async (context) => runFallbackSkeletonTunniDrag(context)
     140 +```
     141 +
     142 +#### Files To Touch
     143 +
     144 +- `docs/refactor/PLAN-tunni-metrics-refactor.md`
     145 +- `docs/refactor/progress-report-tunni-metrics.md`
     146 +
     147 +#### Manual Tests
     148 +
     149 +This is a scope-lock step.
     150 +
     151 +Do a quick sanity pass only:
     152 +
     153 +1. Drag a regular Tunni point.
     154 +2. Drag a skeleton Tunni point.
     155 +3. Hold Q and hover a segment.
     156 +4. Release Q and confirm cleanup.
     157 +
     158 +Expected result:
     159 +
     160 +- no behavior change
     161 +
     162 +---
     163 +
     164 +### Step 0.2: Define the chapter baseline and the exact parity scenarios
     165 +
     166 +#### Problem Aspect
     167 +
     168 +Tunni and Q-measure are easy to “almost preserve” while still drifting in small ways:
     169 +
     170 +- hover priority changes
     171 +- Alt behavior drifts
     172 +- Ctrl+Shift equalize path changes
     173 +- cleanup on key-up or tool switch becomes inconsistent
     174 +- generated contours start participating in regular Tunni/measure by accident
     175 +
     176 +Without one fixed baseline list, later steps will hand-wave parity.
     177 +
     178 +#### Proposed Solution (Plain Language)
     179 +
     180 +Create one baseline doc for this chapter and list the exact manual scenarios that define par
          ity.
     181 +
     182 +That baseline should be the thing every later step compares against.
     183 +
     184 +#### Code Evidence
     185 +
     186 +Suggested baseline doc:
     187 +
     188 +```md
     189 +# docs/refactor/tunni-metrics-baseline.md
     190 +- Q hold: projected dx/dy labels
     191 +- Alt+Q hold: direct distance + angle
     192 +- Q hover priority: rib > handle > segment > selected points
     193 +- Regular midpoint Tunni drag
     194 +- Regular true-Tunni drag
     195 +- Ctrl+Shift midpoint equalize + quantize
     196 +- Skeleton midpoint/true-point drag
     197 +- Skeleton Ctrl+Shift equalize
     198 +- Exclusion of skeleton-generated contours in regular Tunni/measure
     199 +- Undo/redo for regular and skeleton Tunni
     200 +```
     201 +
     202 +#### Files To Touch
     203 +
     204 +- `docs/refactor/tunni-metrics-baseline.md`
     205 +- `docs/refactor/progress-report-tunni-metrics.md`
     206 +
     207 +#### Manual Tests
     208 +
     209 +Run the full baseline once on the current code before deeper work starts.
     210 +
     211 +Expected result:
     212 +
     213 +- one stable before-state reference exists for the chapter
     214 +
     215 +---
     216 +
     217 +## Phase 1: Separate Pure Regular-Tunni Geometry From Mixed Interaction Code
     218 +
     219 +### Broad Problem
     220 +
     221 +Regular Tunni code is currently split across the wrong boundary.
     222 +
     223 +`src-js/fontra-core/src/tunni-calculations.js` still mixes:
     224 +
     225 +- pure geometry
     226 +- hit testing
     227 +- mouse-down state setup
     228 +- drag change calculation tied to editor objects
     229 +- editor/session behavior
     230 +
     231 +At the same time, `src-js/fontra-core/src/distance-angle.js` still duplicates parts of regul
          ar-Tunni geometry and Tunni labeling logic.
     232 +
     233 +That is a real problem, but the fix here must be narrow:
     234 +
     235 +- move only pure regular-Tunni geometry to a single honest home
     236 +- do not move editor-side interaction/session code into core by accident
     237 +
     238 +### Step 1.1: Inventory which regular-Tunni helpers are truly pure and which ones are editor
          -coupled
     239 +
     240 +#### Problem Aspect
     241 +
     242 +Not every mathematically named helper is a pure-core candidate.
     243 +
     244 +If this step guesses wrong, it will either:
     245 +
     246 +- leave duplication behind
     247 +- or move editor-coupled code into core and make the boundary worse
     248 +
     249 +#### Proposed Solution (Plain Language)
     250 +
     251 +Do one explicit helper classification pass over regular-Tunni code.
     252 +
     253 +For each exported helper in `tunni-calculations.js` and the Tunni-related helper cluster in
          `distance-angle.js`, classify it as one of these:
     254 +
     255 +- pure regular-Tunni geometry
     256 +- editor-side hit testing
     257 +- editor-side drag/session lifecycle
     258 +- editor-side drawing/formatting support
     259 +
     260 +Only the first group is a core move candidate.
     261 +
     262 +#### Code Evidence
     263 +
     264 +Current mixed regular-Tunni evidence:
     265 +
     266 +- `src-js/fontra-core/src/tunni-calculations.js`
     267 +- `src-js/fontra-core/src/distance-angle.js`
     268 +
     269 +Examples of likely pure candidates:
     270 +
     271 +```js
     272 +calculateTunniPoint(...)
     273 +calculateTrueTunniPoint(...)
     274 +calculateControlPointsFromTunni(...)
     275 +calculateOnCurvePointsFromTunni(...)
     276 +calculateEqualizedControlPoints(...)
     277 +calculateControlHandleDistance(...)
     278 +areDistancesEqualized(...)
     279 +```
     280 +
     281 +Examples of clearly non-pure candidates:
     282 +
     283 +```js
     284 +tunniLayerHitTest(...)
     285 +handleTunniPointMouseDown(...)
     286 +handleTrueTunniPointMouseDown(...)
     287 +equalizeThenQuantizeSegmentControlPoints(...)
     288 +drawTunniLabels(...)
     289 +```
     290 +
     291 +#### Files To Touch
     292 +
     293 +- `docs/refactor/PLAN-tunni-metrics-refactor.md`
     294 +- `docs/refactor/progress-report-tunni-metrics.md`
     295 +
     296 +#### Manual Tests
     297 +
     298 +This is an inventory step.
     299 +
     300 +Do a quick sanity pass only:
     301 +
     302 +1. Drag a regular midpoint Tunni point.
     303 +2. Drag a true Tunni point.
     304 +3. Toggle the Tunni layers and confirm they still display.
     305 +
     306 +Expected result:
     307 +
     308 +- no behavior change
     309 +
     310 +---
     311 +
     312 +### Step 1.2: Create one pure regular-Tunni geometry home and move only the truly pure helpe
          rs there
     313 +
     314 +#### Problem Aspect
     315 +
     316 +The current code has two geometry sources:
     317 +
     318 +- `tunni-calculations.js`
     319 +- `distance-angle.js`
     320 +
     321 +That makes every later cleanup step harder because no file is the honest source of truth.
     322 +
     323 +#### Proposed Solution (Plain Language)
     324 +
     325 +Create `src-js/fontra-core/src/tunni-geometry.js`.
     326 +
     327 +Move only the pure regular-Tunni geometry there.
     328 +
     329 +Do not move:
     330 +
     331 +- hit testing
     332 +- scene access
     333 +- visualization-layer knowledge
     334 +- editor transactions
     335 +- canvas drawing
     336 +
     337 +Keep wrappers only if the migration needs a short compatibility phase.
     338 +
     339 +#### Code Evidence
     340 +
     341 +Target direction:
     342 +
     343 +```js
     344 +// src-js/fontra-core/src/tunni-geometry.js
     345 +export function calculateMidpointTunni(segmentPoints) {}
     346 +export function calculateTrueTunniPoint(segmentPoints) {}
     347 +export function calculateControlPointsFromTunni(...) {}
     348 +export function calculateOnCurvePointsFromTunni(...) {}
     349 +export function calculateEqualizedControlPoints(...) {}
     350 +export function calculateControlHandleDistance(...) {}
     351 +export function areControlHandleDistancesEqualized(...) {}
     352 +```
     353 +
     354 +Bad legacy naming to remove during this phase:
     355 +
     356 +```js
     357 +calculateTunniPointz(...)
     358 +```
     359 +
     360 +#### Files To Touch
     361 +
     362 +- `src-js/fontra-core/src/tunni-geometry.js`
     363 +- `src-js/fontra-core/src/tunni-calculations.js`
     364 +- `src-js/fontra-core/src/distance-angle.js`
     365 +- `docs/refactor/progress-report-tunni-metrics.md`
     366 +
     367 +#### Manual Tests
     368 +
     369 +Run a regular-Tunni parity pass:
     370 +
     371 +1. Drag a midpoint Tunni point.
     372 +2. Drag a true Tunni point.
     373 +3. Ctrl+Shift-click midpoint Tunni.
     374 +4. Repeat with grid snap enabled if available.
     375 +5. Undo and redo one regular Tunni action.
     376 +
     377 +Expected result:
     378 +
     379 +- no UI behavior drift
     380 +- one pure geometry source now exists
     381 +
     382 +---
     383 +
     384 +### Step 1.3: Remove the duplicate regular-Tunni geometry from `distance-angle.js`
     385 +
     386 +#### Problem Aspect
     387 +
     388 +Even after a new geometry home exists, the cleanup is incomplete if `distance-angle.js` stil
          l keeps its own Tunni math.
     389 +
     390 +That would leave the same lie in place with slightly different imports.
     391 +
     392 +#### Proposed Solution (Plain Language)
     393 +
     394 +Delete duplicated regular-Tunni geometry from `distance-angle.js`.
     395 +
     396 +Replace it with imports from the new geometry home.
     397 +
     398 +Do not leave both implementations alive.
     399 +
     400 +#### Code Evidence
     401 +
     402 +Current duplicate shapes in `src-js/fontra-core/src/distance-angle.js`:
     403 +
     404 +```js
     405 +export function calculateTrueTunniPoint(...)
     406 +export function calculateEqualizedControlPoints(...)
     407 +export function calculateControlHandleDistance(...)
     408 +export function areDistancesEqualized(...)
     409 +export function calculateTunniPointz(...)
     410 +```
     411 +
     412 +#### Files To Touch
     413 +
     414 +- `src-js/fontra-core/src/distance-angle.js`
     415 +- `src-js/fontra-core/src/tunni-geometry.js`
     416 +- `docs/refactor/progress-report-tunni-metrics.md`
     417 +
     418 +#### Manual Tests
     419 +
     420 +Run a visualization-focused parity pass:
     421 +
     422 +1. Show Tunni combined points.
     423 +2. Show actual Tunni points.
     424 +3. Show Tunni labels.
     425 +4. Show distance/manhattan layers on the same glyph.
     426 +5. Confirm the values and drawn points still match baseline.
     427 +
     428 +Expected result:
     429 +
     430 +- `distance-angle.js` stops owning duplicate Tunni geometry
     431 +- visual output stays the same
     432 +
     433 +---
     434 +
     435 +## Phase 2: Remove Regular Tunni Execution Ownership From Core And Pointer Private Methods
     436 +
     437 +### Broad Problem
     438 +
     439 +Regular Tunni now already uses the branch's routing shape on paper:
     440 +
     441 +- pointer routes drag through composer
     442 +- registry exposes `tunniPoint`
     443 +- adapters expose a fallback route
     444 +
     445 +But the actual execution boundary is still dishonest:
     446 +
     447 +- `runFallbackTunniDrag(...)` still calls `pointerTool._handleTunniPointDrag(...)`
     448 +- core still owns regular-Tunni hit testing and interaction helpers
     449 +
     450 +This phase fixes that without inventing a second routing architecture.
     451 +
     452 +### Step 2.1: Move regular-Tunni interaction helpers out of core and into editor code
     453 +
     454 +#### Problem Aspect
     455 +
     456 +Core code currently knows too much about editor-facing interaction setup.
     457 +
     458 +That is the wrong boundary even if the behavior still works.
     459 +
     460 +#### Proposed Solution (Plain Language)
     461 +
     462 +Move editor-coupled regular-Tunni helpers out of `src-js/fontra-core/src/tunni-calculations.
          js` into editor code.
     463 +
     464 +Keep only pure geometry in core.
     465 +
     466 +Editor-side owners can be:
     467 +
     468 +- a dedicated regular-Tunni helper module
     469 +- or adapter-local helper blocks if that is cleaner for the current code
     470 +
     471 +Either is acceptable.
     472 +
     473 +What is not acceptable is leaving editor session/hit-test code in core just because it alrea
          dy exists there.
     474 +
     475 +#### Code Evidence
     476 +
     477 +Likely editor-coupled regular-Tunni helpers:
     478 +
     479 +```js
     480 +tunniLayerHitTest(...)
     481 +handleTunniPointMouseDown(...)
     482 +handleTunniPointMouseDrag(...)
     483 +handleTunniPointMouseUp(...)
     484 +handleTrueTunniPointMouseDown(...)
     485 +handleTrueTunniPointMouseDrag(...)
     486 +handleTrueTunniPointMouseUp(...)
     487 +equalizeThenQuantizeSegmentControlPoints(...)
     488 +```
     489 +
     490 +#### Files To Touch
     491 +
     492 +- `src-js/fontra-core/src/tunni-calculations.js`
     493 +- one editor-side helper/module in `src-js/views-editor/src`
     494 +- `docs/refactor/progress-report-tunni-metrics.md`
     495 +
     496 +#### Manual Tests
     497 +
     498 +Run a regular-Tunni interaction pass:
     499 +
     500 +1. Hover a regular Tunni point and confirm cursor behavior.
     501 +2. Drag a midpoint Tunni point.
     502 +3. Drag a true Tunni point.
     503 +4. Ctrl+Shift-click midpoint Tunni.
     504 +5. Undo and redo one action.
     505 +
     506 +Expected result:
     507 +
     508 +- behavior is unchanged
     509 +- core no longer owns editor interaction/session helpers
     510 +
     511 +---
     512 +
     513 +### Step 2.2: Make the fallback adapter own regular-Tunni execution instead of bouncing back
           into pointer private methods
     514 +
     515 +#### Problem Aspect
     516 +
     517 +Right now the fallback adapter exists, but it is not honest.
     518 +
     519 +It still delegates to pointer private methods.
     520 +
     521 +That defeats the point of having the routing/adapters surface in the first place.
     522 +
     523 +#### Proposed Solution (Plain Language)
     524 +
     525 +Keep the current route shape:
     526 +
     527 +- pointer hit-tests and routes
     528 +- composer resolves the fallback route
     529 +- fallback adapter executes the route
     530 +
     531 +Change only the execution ownership.
     532 +
     533 +The fallback adapter should call editor-side regular-Tunni helpers it owns or imports direct
          ly.
     534 +
     535 +It should not call:
     536 +
     537 +```js
     538 +pointerTool._handleTunniPointDrag(...)
     539 +```
     540 +
     541 +#### Code Evidence
     542 +
     543 +Current dishonest shape:
     544 +
     545 +```js
     546 +async function runFallbackTunniDrag({ pointerTool, eventStream, initialEvent }) {
     547 +  const handled = await pointerTool._handleTunniPointDrag(eventStream, initialEvent);
     548 +  ...
     549 +}
     550 +```
     551 +
     552 +Target direction:
     553 +
     554 +```js
     555 +async function runFallbackTunniDrag(context) {
     556 +  return runRegularTunniFallbackSession(context);
     557 +}
     558 +```
     559 +
     560 +#### Files To Touch
     561 +
     562 +- `src-js/views-editor/src/edit-behavior-adapters.js`
     563 +- one editor-side regular-Tunni helper/module if needed
     564 +- `src-js/views-editor/src/edit-tools-pointer.js`
     565 +- `docs/refactor/progress-report-tunni-metrics.md`
     566 +
     567 +#### Manual Tests
     568 +
     569 +Run a fallback-route parity pass:
     570 +
     571 +1. Drag a midpoint regular Tunni point.
     572 +2. Drag a true Tunni point.
     573 +3. Ctrl+Shift-click midpoint Tunni.
     574 +4. Cancel a drag mid-stream if that is supported.
     575 +5. Undo and redo.
     576 +
     577 +Expected result:
     578 +
     579 +- same behavior
     580 +- fallback adapter now owns the execution boundary honestly
     581 +
     582 +---
     583 +
     584 +## Phase 3: Remove Skeleton Tunni Execution Ownership From Pointer Private Methods
     585 +
     586 +### Broad Problem
     587 +
     588 +Skeleton Tunni is in a slightly better state than regular Tunni:
     589 +
     590 +- its geometry already lives in `src-js/views-editor/src/skeleton-tunni-calculations.js`
     591 +
     592 +But the live execution boundary is still pointer-owned:
     593 +
     594 +- `_handleSkeletonTunniDrag(...)`
     595 +- `_equalizeSkeletonTunniTensions(...)`
     596 +
     597 +And the fallback adapter for `skeletonTunniPoint` still delegates back into those pointer pr
          ivate methods.
     598 +
     599 +### Step 3.1: Separate skeleton-Tunni execution ownership from pointer without redesigning t
          he workflow
     600 +
     601 +#### Problem Aspect
     602 +
     603 +This phase must be careful not to turn into a workflow redesign.
     604 +
     605 +The goal is not “invent a new skeleton Tunni UX”.
     606 +
     607 +The goal is:
     608 +
     609 +- preserve behavior
     610 +- move execution ownership out of pointer private methods
     611 +- keep the existing fallback route shape
     612 +
     613 +#### Proposed Solution (Plain Language)
     614 +
     615 +Move skeleton-Tunni execution into adapter-owned or adapter-imported editor-side helpers.
     616 +
     617 +Keep:
     618 +
     619 +- pointer-owned hit testing and routing
     620 +- existing `skeletonTunniPoint` fallback route
     621 +
     622 +Remove:
     623 +
     624 +- pointer private ownership of the live execution session
     625 +
     626 +#### Code Evidence
     627 +
     628 +Current pointer-owned execution:
     629 +
     630 +```js
     631 +async _handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit) { ... }
     632 +async _equalizeSkeletonTunniTensions(tunniHit) { ... }
     633 +```
     634 +
     635 +Current dishonest fallback adapter:
     636 +
     637 +```js
     638 +async function runFallbackSkeletonTunniDrag({ pointerTool, ... }) {
     639 +  return pointerTool._handleSkeletonTunniDrag(...);
     640 +}
     641 +```
     642 +
     643 +#### Files To Touch
     644 +
     645 +- `src-js/views-editor/src/edit-behavior-adapters.js`
     646 +- one editor-side skeleton-Tunni helper/module if needed
     647 +- `src-js/views-editor/src/edit-tools-pointer.js`
     648 +- `docs/refactor/progress-report-tunni-metrics.md`
     649 +
     650 +#### Manual Tests
     651 +
     652 +Run a skeleton-focused parity pass:
     653 +
     654 +1. Drag a skeleton midpoint Tunni point.
     655 +2. Drag a skeleton true-Tunni point.
     656 +3. Ctrl+Shift equalize on skeleton Tunni.
     657 +4. Repeat with Alt behavior.
     658 +5. Undo and redo one skeleton Tunni action.
     659 +
     660 +Expected result:
     661 +
     662 +- same behavior
     663 +- pointer no longer owns the skeleton-Tunni execution session directly
     664 +
     665 +---
     666 +
     667 +### Step 3.2: Reuse shared skeleton-backed persistence helpers where the skeleton-Tunni path
           is currently open-coded
     668 +
     669 +#### Problem Aspect
     670 +
     671 +Skeleton-Tunni execution currently repeats the same kinds of work that other skeleton-backed
           editor paths already had to clean up:
     672 +
     673 +- clone skeleton data
     674 +- mutate working data
     675 +- regenerate contours
     676 +- save skeleton data
     677 +
     678 +If this chapter leaves that open-coded duplication untouched, the ownership move will still
          leave avoidable risk behind.
     679 +
     680 +#### Proposed Solution (Plain Language)
     681 +
     682 +After moving skeleton-Tunni execution out of pointer private methods, reuse existing skeleto
          n-backed persistence helpers where practical.
     683 +
     684 +Do not create a fake universal helper if the route needs route-specific behavior.
     685 +
     686 +Do remove the obvious regenerate/save duplication when the lifecycle is materially the same.
     687 +
     688 +#### Code Evidence
     689 +
     690 +Current open-coded skeleton-Tunni persistence shapes:
     691 +
     692 +```js
     693 +regenerateSkeletonContours(...)
     694 +setSkeletonData(...)
     695 +JSON.parse(JSON.stringify(...))
     696 +```
     697 +
     698 +Compare against existing adapter-side skeleton-backed helpers in:
     699 +
     700 +- `src-js/views-editor/src/edit-behavior-adapters.js`
     701 +
     702 +#### Files To Touch
     703 +
     704 +- `src-js/views-editor/src/edit-behavior-adapters.js`
     705 +- the new skeleton-Tunni execution owner if one is added
     706 +- `docs/refactor/progress-report-tunni-metrics.md`
     707 +
     708 +#### Manual Tests
     709 +
     710 +Run a multi-layer/skeleton-focused parity pass:
     711 +
     712 +1. Drag a skeleton midpoint Tunni point across editable layers.
     713 +2. Drag a true-Tunni point across editable layers.
     714 +3. Ctrl+Shift equalize.
     715 +4. Undo and redo.
     716 +5. Confirm no skeleton/generated contour mismatch appears.
     717 +
     718 +Expected result:
     719 +
     720 +- same behavior
     721 +- less duplicated skeleton-backed persistence code
     722 +
     723 +---
     724 +
     725 +## Phase 4: Make Q-Measure State Ownership Honest And Centralized
     726 +
     727 +### Broad Problem
     728 +
     729 +Q-measure currently has scattered state ownership:
     730 +
     731 +- pointer has measure-mode lifecycle state
     732 +- SceneModel stores measure-related fields
     733 +- pointer writes those fields directly in several places
     734 +
     735 +That makes cleanup behavior easy to break.
     736 +
     737 +### Step 4.1: Define one truthful measure state owner and one explicit reset policy
     738 +
     739 +#### Problem Aspect
     740 +
     741 +Before changing code, this chapter needs one plain-language rule for measure state:
     742 +
     743 +- who owns it
     744 +- who is allowed to mutate it
     745 +- when it must reset
     746 +
     747 +Without that, the extraction work will stay inconsistent.
     748 +
     749 +#### Proposed Solution (Plain Language)
     750 +
     751 +State rule for this chapter:
     752 +
     753 +- SceneModel owns measure state
     754 +- pointer drives the mode lifecycle and hover transport
     755 +- pointer does not directly scatter raw writes across many `sceneModel.measure*` fields afte
          r this phase
     756 +- one reset path must cover:
     757 +  - Q key-up
     758 +  - Alt key-up while Q is still active
     759 +  - tool switch
     760 +  - blur / drag teardown / other hard exits as applicable
     761 +
     762 +#### Code Evidence
     763 +
     764 +Current split-state evidence:
     765 +
     766 +- `src-js/views-editor/src/scene-model.js`
     767 +- `src-js/views-editor/src/edit-tools-pointer.js`
     768 +
     769 +Current raw field pattern:
     770 +
     771 +```js
     772 +this.sceneModel.measureMode = true;
     773 +this.sceneModel.measureShowDirect = event.altKey;
     774 +this.sceneModel.measureHoverSegment = null;
     775 +this.sceneModel.measureHoverRibPoint = null;
     776 +this.sceneModel.measureHoverPoints = null;
     777 +this.sceneModel.measureHoverHandle = null;
     778 +```
     779 +
     780 +#### Files To Touch
     781 +
     782 +- `docs/refactor/PLAN-tunni-metrics-refactor.md`
     783 +- `docs/refactor/progress-report-tunni-metrics.md`
     784 +
     785 +#### Manual Tests
     786 +
     787 +This is a state-rule step.
     788 +
     789 +Do a quick sanity pass only:
     790 +
     791 +1. Hold Q and move the cursor.
     792 +2. Press and release Alt while Q is held.
     793 +3. Release Q.
     794 +
     795 +Expected result:
     796 +
     797 +- no behavior change
     798 +
     799 +---
     800 +
     801 +### Step 4.2: Replace scattered measure field writes with one SceneModel-owned API
     802 +
     803 +#### Problem Aspect
     804 +
     805 +Even if the ownership rule is documented, the cleanup is incomplete until the code stops wri
          ting scattered fields directly.
     806 +
     807 +#### Proposed Solution (Plain Language)
     808 +
     809 +Add a small measure-state API to `SceneModel`.
     810 +
     811 +Possible shape:
     812 +
     813 +```js
     814 +setMeasureActive(...)
     815 +setMeasureShowDirect(...)
     816 +setMeasureHoverTarget(...)
     817 +resetMeasureState()
     818 +```
     819 +
     820 +The exact API can differ.
     821 +
     822 +What matters is:
     823 +
     824 +- one owner
     825 +- one reset path
     826 +- pointer stops doing direct multi-field mutation everywhere
     827 +
     828 +#### Code Evidence
     829 +
     830 +Current state fields in `src-js/views-editor/src/scene-model.js`:
     831 +
     832 +```js
     833 +this.measureMode = false;
     834 +this.measureShowDirect = false;
     835 +this.measureHoverSegment = null;
     836 +this.measureHoverRibPoint = null;
     837 +this.measureHoverPoints = null;
     838 +this.measureHoverHandle = null;
     839 +```
     840 +
     841 +#### Files To Touch
     842 +
     843 +- `src-js/views-editor/src/scene-model.js`
     844 +- `src-js/views-editor/src/edit-tools-pointer.js`
     845 +- `docs/refactor/progress-report-tunni-metrics.md`
     846 +
     847 +#### Manual Tests
     848 +
     849 +Run a measure lifecycle pass:
     850 +
     851 +1. Hold Q and hover a segment.
     852 +2. Move from segment to handle to rib point.
     853 +3. Press and release Alt while holding Q.
     854 +4. Release Q.
     855 +5. Switch tools while Q/measure state is active if that path exists.
     856 +
     857 +Expected result:
     858 +
     859 +- same visible behavior
     860 +- one clear state owner now exists
     861 +
     862 +---
     863 +
     864 +## Phase 5: Extract Q-Measure Hover Target Resolution Into One Explicit Helper
     865 +
     866 +### Broad Problem
     867 +
     868 +Q hover targeting is still encoded inside pointer through several private helpers and direct
           state updates.
     869 +
     870 +That makes priority bugs and cleanup bugs hard to reason about.
     871 +
     872 +### Step 5.1: Write down the exact hover priority and target shape before extraction
     873 +
     874 +#### Problem Aspect
     875 +
     876 +If the extraction starts before the priority order is written down explicitly, the helper ca
          n easily preserve the wrong behavior or change priority by accident.
     877 +
     878 +#### Proposed Solution (Plain Language)
     879 +
     880 +Document the hover priority in the plan and then mirror it in code:
     881 +
     882 +1. rib point
     883 +2. off-curve handle
     884 +3. segment
     885 +4. selected-point pair
     886 +
     887 +Also define one explicit target shape returned by the helper.
     888 +
     889 +#### Code Evidence
     890 +
     891 +Current pointer-owned resolution path lives in:
     892 +
     893 +- `src-js/views-editor/src/edit-tools-pointer.js`
     894 +
     895 +Current priority is visible in the order of:
     896 +
     897 +```js
     898 +_findRibPointForMeasure(...)
     899 +_findControlPointForMeasure(...)
     900 +_findSegmentForMeasure(...)
     901 +_getMeasurePointsFromSelection(...)
     902 +```
     903 +
     904 +#### Files To Touch
     905 +
     906 +- `docs/refactor/PLAN-tunni-metrics-refactor.md`
     907 +- `docs/refactor/progress-report-tunni-metrics.md`
     908 +
     909 +#### Manual Tests
     910 +
     911 +This is a documentation step.
     912 +
     913 +Do a quick sanity pass:
     914 +
     915 +1. Hover where rib/handle/segment candidates are close.
     916 +2. Confirm current target order before extraction.
     917 +
     918 +Expected result:
     919 +
     920 +- no behavior change
     921 +
     922 +---
     923 +
     924 +### Step 5.2: Extract one measure hover resolver helper and make pointer use it
     925 +
     926 +#### Problem Aspect
     927 +
     928 +Right now pointer owns both:
     929 +
     930 +- deciding what the hover target is
     931 +- applying that result into state
     932 +
     933 +That mixes target resolution with mode-state mutation.
     934 +
     935 +#### Proposed Solution (Plain Language)
     936 +
     937 +Create one editor-local helper that resolves the hover target for measure mode.
     938 +
     939 +The helper should:
     940 +
     941 +- receive the inputs it needs
     942 +- return one typed result
     943 +- not mutate SceneModel directly
     944 +
     945 +Pointer should then:
     946 +
     947 +- call the helper
     948 +- push the result into the SceneModel measure API
     949 +
     950 +#### Code Evidence
     951 +
     952 +Target direction:
     953 +
     954 +```js
     955 +export function resolveMeasureHoverTarget(...) {
     956 +  return { kind: "ribPoint" | "handle" | "segment" | "selectedPoints" | null, payload };
     957 +}
     958 +```
     959 +
     960 +#### Files To Touch
     961 +
     962 +- one new editor-side measure helper module
     963 +- `src-js/views-editor/src/edit-tools-pointer.js`
     964 +- `src-js/views-editor/src/scene-model.js`
     965 +- `docs/refactor/progress-report-tunni-metrics.md`
     966 +
     967 +#### Manual Tests
     968 +
     969 +Run a hover-priority pass:
     970 +
     971 +1. Hover a rib point.
     972 +2. Hover an off-curve handle.
     973 +3. Hover a segment.
     974 +4. Hover with exactly two relevant selected points.
     975 +5. Repeat at low and high zoom if practical.
     976 +
     977 +Expected result:
     978 +
     979 +- same hover priority as baseline
     980 +- pointer code is simpler and less state-coupled
     981 +
     982 +---
     983 +
     984 +## Phase 6: Split Visualization-Layer Ownership By Domain And Clean Up `distance-angle.js`
     985 +
     986 +### Broad Problem
     987 +
     988 +`src-js/views-editor/src/visualization-layer-definitions.js` has become a large mixed bucket
           for:
     989 +
     990 +- registry functions
     991 +- base layers
     992 +- Q overlay
     993 +- Tunni combined/actual-point layers
     994 +- distance/manhattan layers
     995 +- Tunni label layer
     996 +
     997 +At the same time, `src-js/fontra-core/src/distance-angle.js` still owns Tunni label drawing
          and related helpers that clearly do not belong in core.
     998 +
     999 +### Step 6.1: Split Tunni and measure visualization registration out of the giant mixed file
    1000 +
    1001 +#### Problem Aspect
    1002 +
    1003 +The problem is not that there is a shared layer registry file.
    1004 +
    1005 +The problem is that domain-specific registration and draw logic are still living inside one
          giant mixed module.
    1006 +
    1007 +#### Proposed Solution (Plain Language)
    1008 +
    1009 +Keep the common registry helpers where they are.
    1010 +
    1011 +Move domain-specific registrations into clearer files if that improves ownership:
    1012 +
    1013 +- Tunni registration/draw helpers together
    1014 +- measure/Q overlay registration/draw helpers together
    1015 +
    1016 +Do not split the file just because “smaller files are nicer”.
    1017 +
    1018 +Split only when the new file boundary is honest.
    1019 +
    1020 +#### Code Evidence
    1021 +
    1022 +Current mixed-domain registration evidence:
    1023 +
    1024 +- `src-js/views-editor/src/visualization-layer-definitions.js`
    1025 +
    1026 +Relevant current sections:
    1027 +
    1028 +```js
    1029 +identifier: "fontra.measure.overlay"
    1030 +identifier: "fontra.tunni.combined"
    1031 +identifier: "fontra.tunni.actual.points"
    1032 +identifier: "fontra.distance-angle"
    1033 +identifier: "fontra.manhattan-distance"
    1034 +identifier: "fontra.tunni.labels"
    1035 +```
    1036 +
    1037 +#### Files To Touch
    1038 +
    1039 +- `src-js/views-editor/src/visualization-layer-definitions.js`
    1040 +- one or more new visualization-layer domain files if needed
    1041 +- `docs/refactor/progress-report-tunni-metrics.md`
    1042 +
    1043 +#### Manual Tests
    1044 +
    1045 +Run a visualization-toggle pass:
    1046 +
    1047 +1. Toggle Q overlay behavior via Q hold.
    1048 +2. Toggle Tunni combined points.
    1049 +3. Toggle actual Tunni points.
    1050 +4. Toggle distance-angle.
    1051 +5. Toggle manhattan distance.
    1052 +6. Toggle Tunni labels.
    1053 +7. Confirm z-order and visibility still match baseline.
    1054 +
    1055 +Expected result:
    1056 +
    1057 +- same visuals
    1058 +- clearer domain ownership in code
    1059 +
    1060 +---
    1061 +
    1062 +### Step 6.2: Move Tunni label drawing out of `distance-angle.js` and leave that file measur
          e-focused
    1063 +
    1064 +#### Problem Aspect
    1065 +
    1066 +`distance-angle.js` is currently lying about its role.
    1067 +
    1068 +It still contains:
    1069 +
    1070 +- duplicated Tunni geometry
    1071 +- Tunni label drawing
    1072 +- generated-contour filtering for Tunni labels
    1073 +
    1074 +That is not a measure-focused file.
    1075 +
    1076 +#### Proposed Solution (Plain Language)
    1077 +
    1078 +After Phase 1 removes duplicated geometry, move the remaining Tunni label drawing out of cor
          e and into views-editor.
    1079 +
    1080 +Keep in core only what still clearly belongs there:
    1081 +
    1082 +- measure geometry
    1083 +- measure formatting
    1084 +- measure drawing helpers if they remain general enough to justify staying there
    1085 +
    1086 +Do not leave any Tunni-specific canvas drawing in core.
    1087 +
    1088 +#### Code Evidence
    1089 +
    1090 +Current Tunni-specific core evidence:
    1091 +
    1092 +```js
    1093 +export function drawTunniLabels(...)
    1094 +function getSkeletonGeneratedContourIndexSet(...)
    1095 +```
    1096 +
    1097 +in:
    1098 +
    1099 +- `src-js/fontra-core/src/distance-angle.js`
    1100 +
    1101 +#### Files To Touch
    1102 +
    1103 +- `src-js/fontra-core/src/distance-angle.js`
    1104 +- one editor-side Tunni visualization file
    1105 +- `docs/refactor/progress-report-tunni-metrics.md`
    1106 +
    1107 +#### Manual Tests
    1108 +
    1109 +Run a label-focused parity pass:
    1110 +
    1111 +1. Show Tunni labels on a regular cubic contour.
    1112 +2. Confirm distance/tension/angle visibility settings still work.
    1113 +3. Confirm generated contours are still excluded.
    1114 +4. Undo/redo a Tunni edit and confirm labels update correctly.
    1115 +
    1116 +Expected result:
    1117 +
    1118 +- same Tunni label behavior
    1119 +- no Tunni-specific canvas drawing remains in core
    1120 +
    1121 +---
    1122 +
    1123 +## Phase 7: Share Generated-Contour Exclusion Logic Across Tunni And Measure Code
    1124 +
    1125 +### Broad Problem
    1126 +
    1127 +Generated-contour exclusion is still duplicated in multiple places.
    1128 +
    1129 +That creates a slow-drift risk:
    1130 +
    1131 +- draw code can ignore generated contours
    1132 +- while hit-test code accidentally starts seeing them
    1133 +
    1134 +or the reverse.
    1135 +
    1136 +### Step 7.1: Introduce one editor-side helper for generated-contour exclusion
    1137 +
    1138 +#### Problem Aspect
    1139 +
    1140 +Right now similar exclusion logic appears in more than one file.
    1141 +
    1142 +That is exactly the kind of small duplication that later becomes a parity bug.
    1143 +
    1144 +#### Proposed Solution (Plain Language)
    1145 +
    1146 +Add one editor-side helper that resolves generated contour indices for the active layer and
          positioned glyph.
    1147 +
    1148 +Then reuse it anywhere this chapter touches Tunni/measure code.
    1149 +
    1150 +#### Code Evidence
    1151 +
    1152 +Current duplicate-style helper evidence appears in places like:
    1153 +
    1154 +- `src-js/fontra-core/src/tunni-calculations.js`
    1155 +- `src-js/fontra-core/src/distance-angle.js`
    1156 +- `src-js/views-editor/src/visualization-layer-definitions.js`
    1157 +
    1158 +Target direction:
    1159 +
    1160 +```js
    1161 +export function getGeneratedContourIndexSet(positionedGlyph, sceneSettings) { ... }
    1162 +```
    1163 +
    1164 +#### Files To Touch
    1165 +
    1166 +- one new editor-side generated-contour helper module
    1167 +- touched Tunni/measure modules that currently open-code this logic
    1168 +- `docs/refactor/progress-report-tunni-metrics.md`
    1169 +
    1170 +#### Manual Tests
    1171 +
    1172 +Run a generated-contour exclusion pass:
    1173 +
    1174 +1. Regular Tunni should ignore generated contours.
    1175 +2. Tunni labels should ignore generated contours.
    1176 +3. Measure/Q should ignore generated contours where intended.
    1177 +4. Normal non-generated contours should still work.
    1178 +
    1179 +Expected result:
    1180 +
    1181 +- one exclusion rule
    1182 +- no draw/hit-test drift
    1183 +
    1184 +---
    1185 +
    1186 +## Phase 8: Close The Remaining Supporting Tech Debt And Run The Chapter Closeout Sweep
    1187 +
    1188 +### Broad Problem
    1189 +
    1190 +Even after the main ownership cleanup, three small but real problems remain:
    1191 +
    1192 +- brittle Tunni checkbox binding
    1193 +- global Ctrl-modified MouseTracker workaround
    1194 +- leftover temporary naming in the touched files
    1195 +
    1196 +These are not the main architecture, but they are part of the same messy surface and should
          be closed in the same chapter.
    1197 +
    1198 +### Step 8.1: Replace the brittle Tunni checkbox binding in `panel-transformation.js`
    1199 +
    1200 +#### Problem Aspect
    1201 +
    1202 +The current binding uses:
    1203 +
    1204 +- `setTimeout(...)`
    1205 +- checkbox index order
    1206 +- DOM lookup by position
    1207 +
    1208 +That is fragile and unrelated to the actual meaning of the fields.
    1209 +
    1210 +#### Proposed Solution (Plain Language)
    1211 +
    1212 +Bind the Tunni checkbox behavior by field key at creation time.
    1213 +
    1214 +Do not rely on:
    1215 +
    1216 +- `allCheckboxes[0]`
    1217 +- `allCheckboxes[1]`
    1218 +- `allCheckboxes[2]`
    1219 +
    1220 +Remove the deferred DOM patch-up block entirely.
    1221 +
    1222 +#### Code Evidence
    1223 +
    1224 +Current brittle pattern:
    1225 +
    1226 +```js
    1227 +setTimeout(() => {
    1228 +  const allCheckboxes = ...
    1229 +  const distanceCheckbox = allCheckboxes[0];
    1230 +  ...
    1231 +}, 0);
    1232 +```
    1233 +
    1234 +#### Files To Touch
    1235 +
    1236 +- `src-js/views-editor/src/panel-transformation.js`
    1237 +- `docs/refactor/progress-report-tunni-metrics.md`
    1238 +
    1239 +#### Manual Tests
    1240 +
    1241 +Run a UI-binding pass:
    1242 +
    1243 +1. Toggle `showTunniDistance`.
    1244 +2. Toggle `showTunniTension`.
    1245 +3. Toggle `showTunniAngle`.
    1246 +4. Reopen the panel.
    1247 +5. Rebuild the form if that path is easy to trigger.
    1248 +
    1249 +Expected result:
    1250 +
    1251 +- same visible behavior
    1252 +- no index-based binding remains
    1253 +
    1254 +---
    1255 +
    1256 +### Step 8.2: Replace the broad MouseTracker Ctrl workaround with an explicit allow-policy
    1257 +
    1258 +#### Problem Aspect
    1259 +
    1260 +The current code solved the Tunni need by broadly removing the `ctrlKey` guard in `MouseTrac
          ker`.
    1261 +
    1262 +That is too indirect and can affect unrelated tools or interactions.
    1263 +
    1264 +#### Proposed Solution (Plain Language)
    1265 +
    1266 +Add one explicit allow-policy for ctrl-modified mouse down.
    1267 +
    1268 +Default behavior should stay safe.
    1269 +
    1270 +Only the precise Tunni case that needs Ctrl+Shift should opt in.
    1271 +
    1272 +#### Code Evidence
    1273 +
    1274 +Current broad workaround:
    1275 +
    1276 +```js
    1277 +if (event.button === 2 /* || event.ctrlKey */) {
    1278 +  return;
    1279 +}
    1280 +```
    1281 +
    1282 +#### Files To Touch
    1283 +
    1284 +- `src-js/fontra-core/src/mouse-tracker.js`
    1285 +- the owner that constructs `MouseTracker`
    1286 +- `docs/refactor/progress-report-tunni-metrics.md`
    1287 +
    1288 +#### Manual Tests
    1289 +
    1290 +Run an input-policy pass:
    1291 +
    1292 +1. Ctrl+Shift-click Tunni midpoint.
    1293 +2. Confirm the intended Tunni action still works.
    1294 +3. Try ordinary Ctrl-modified mouse down in unrelated pointer cases.
    1295 +4. Try another tool if practical.
    1296 +
    1297 +Expected result:
    1298 +
    1299 +- Tunni still works
    1300 +- unrelated Ctrl-modified behavior does not regress
    1301 +
    1302 +---
    1303 +
    1304 +### Step 8.3: Remove the last temporary names and run the full chapter closeout sweep
    1305 +
    1306 +#### Problem Aspect
    1307 +
    1308 +After all ownership moves, temporary names and stale aliases can still leave the code harder
           to trust than it should be.
    1309 +
    1310 +The worst visible example in this touch zone is `calculateTunniPointz`.
    1311 +
    1312 +#### Proposed Solution (Plain Language)
    1313 +
    1314 +Run one final naming and closeout sweep over the touched Tunni/Q files.
    1315 +
    1316 +Remove:
    1317 +
    1318 +- `calculateTunniPointz`
    1319 +- any touched temporary compatibility names that no longer have a reason to exist
    1320 +
    1321 +Then run the full chapter manual matrix.
    1322 +
    1323 +#### Code Evidence
    1324 +
    1325 +Useful closeout checks:
    1326 +
    1327 +```bash
    1328 +rg -n "calculateTunniPointz" src-js docs
    1329 +rg -n "_handleTunniPointDrag|_handleSkeletonTunniDrag|_equalizeSkeletonTunniTensions" src-js
          /views-editor/src
    1330 +rg -n "setTimeout\\(|allCheckboxes\\[0\\]|allCheckboxes\\[1\\]|allCheckboxes\\[2\\]" src-js/
          views-editor/src/panel-transformation.js
    1331 +```
    1332 +
    1333 +The exact grep list may improve as names improve during the chapter.
    1334 +
    1335 +#### Files To Touch
    1336 +
    1337 +- touched Tunni/Q implementation files
    1338 +- `docs/refactor/progress-report-tunni-metrics.md`
    1339 +
    1340 +#### Manual Tests
    1341 +
    1342 +Run the full closeout matrix:
    1343 +
    1344 +1. Regular midpoint Tunni drag.
    1345 +2. Regular true-Tunni drag.
    1346 +3. Regular Ctrl+Shift midpoint equalize + quantize.
    1347 +4. Skeleton midpoint Tunni drag.
    1348 +5. Skeleton true-Tunni drag.
    1349 +6. Skeleton Ctrl+Shift equalize.
    1350 +7. Q projected mode.
    1351 +8. Alt+Q direct mode.
    1352 +9. Q hover priority rib > handle > segment > selected points.
    1353 +10. Generated-contour exclusion for regular Tunni/measure.
    1354 +11. Tunni label visibility toggles.
    1355 +12. Ctrl+Shift input-policy check.
    1356 +13. Undo and redo for one regular Tunni action and one skeleton Tunni action.
    1357 +
    1358 +Expected result:
    1359 +
    1360 +- no behavior drift from baseline
    1361 +- ownership and file boundaries are easier to trust
    1362 +
    1363 +---
    1364 +
    1365 +## Acceptance Criteria
    1366 +
    1367 +This chapter is complete only when all of these are true:
    1368 +
    1369 +- regular Tunni geometry has one source of truth
    1370 +- `tunni-calculations.js` no longer mixes pure geometry with editor interaction ownership
    1371 +- `distance-angle.js` no longer duplicates Tunni geometry
    1372 +- `distance-angle.js` no longer draws Tunni labels
    1373 +- regular Tunni fallback no longer executes through pointer private methods
    1374 +- skeleton Tunni fallback no longer executes through pointer private methods
    1375 +- skeleton-Tunni persistence no longer open-codes obviously shared skeleton-backed lifecycle
           work
    1376 +- SceneModel owns one coherent measure state API
    1377 +- Q hover target resolution is one explicit helper with stable priority
    1378 +- visualization-layer registration is clearer by domain
    1379 +- generated-contour exclusion is shared
    1380 +- Tunni panel checkbox binding is deterministic
    1381 +- MouseTracker Ctrl-modified behavior is explicit instead of globally relaxed
    1382 +- no broad unified-behavior regressions are introduced
    1383 +
    1384 +## Working Rule For This Plan
    1385 +
    1386 +When two approaches are possible, choose the one that follows these rules:
    1387 +
    1388 +1. Prefer ownership fixes over file shuffling.
    1389 +2. Prefer pure-math extraction over moving editor interaction code into core.
    1390 +3. Prefer adapter-owned fallback execution over pointer private execution.
    1391 +4. Prefer one explicit state API over scattered mutable fields.
    1392 +5. Prefer small verified steps over a single large rewrite.