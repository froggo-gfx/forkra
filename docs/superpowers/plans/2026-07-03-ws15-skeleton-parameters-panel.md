# WS-15 - Skeleton Parameters Panel and Source Defaults Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the skeleton parameters sidebar and per-source skeleton defaults with full donor numeric-editing parity, while writing skeleton changes only through the canonical `editSkeleton` pipeline.

**Architecture:** Split the donor's 6,951-line panel into reusable defaults helpers, pure panel-state/edit helpers, and a thin `Panel` UI. Source defaults live in `fontra.internal.skeletonDefaults`; skeleton point, contour, rib, handle, cap, and corner edits use `skeleton-model.js` accessors and WS-9 `editSkeleton` persistence. The panel is a dispatcher and form renderer only: no generated-outline recovery, no direct `setSkeletonData()`, and no donor flat fields.

**Tech Stack:** `src-js/fontra-core/src/fontra-internal-schema.js`, new source-default helpers, `src-js/fontra-core/src/skeleton-model.js`, WS-9 `skeleton-editing.js`, WS-11 `skeleton-ribs.js`, WS-12 `skeleton-generated.js`, WS-13 modifier helpers where needed, `src-js/views-editor/src/panel-skeleton-parameters.js`, `@fontra/web-components/ui-form.js`, `editor.js`, `en.js`, mocha/chai for pure helpers, `node --check`, `npx prettier --write`, `npm run bundle`, and manual parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws15-skeleton-parameters-panel`, cut after WS-14 is merged.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`. Read donor `panel-skeleton-parameters.js` and `skeleton-source-defaults.js` for behavior and labels, not for persistence or schema.
- **One skeleton write path:** all skeleton data edits must call `editSkeleton(layerGlyph, mutate)` or the WS-9 helper around it. Do not call `setSkeletonData()`, `regenerateSkeletonContours()`, `generateContoursFromSkeleton()`, or `VarPackedPath` from the panel.
- **Source defaults path:** per-source defaults are stored under `customData["fontra.internal"].skeletonDefaults`, using `FONTRA_INTERNAL_SECTIONS.SKELETON_DEFAULTS`.
- **Canonical schema only:** use WS-6 fields and helpers: `contour.closed`, `contour.defaultWidth`, `contour.singleSided`, point `width`, `nudge`, `editable`, `handleOffsets`, cap/corner fields. Do not introduce donor `leftWidth`, `rightWidth`, `leftNudge`, `rightNudge`, `leftEditable`, `rightEditable`, `singleSidedDirection`, `leftHandleInOffsetX`, or index selection keys.
- **Stable identity:** panel selection aggregation and edits use stable ids from `skeletonPoint/<contourId>/<pointId>`, `skeletonRib/<contourId>/<pointId>/<side>`, and editable-generated keys from WS-12. Donor index keys are never written.
- **No transformation work:** donor panel includes align/flip/distribute shortcuts. WS-16 owns "Transformation panel operating on skeleton selections"; WS-15 may expose buttons only if the corresponding actions already exist from earlier WSs, but it must not implement transformation semantics.
- **Scope:** WS-15 includes source defaults, panel registration, numeric point/width/distribution edits, contour single-sided/default-width edits, cap/corner numeric edits, rib/editable-generated handle numeric edits, profile save/apply/revert, and panel refresh behavior. It excludes cross-feature copy/paste, letterspacer coupling, transformation parity, and final interpolation audit.

---

## Verified Current Context

- Donor checkout verified at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`.
- Roadmap WS-15 requires: "Skeleton parameters panel + source defaults", rewritten to write only through `editSkeleton` and `skeleton-model.js` accessors, with full numeric-editing parity.
- Current forkra has no `panel-skeleton-parameters.js` and no skeleton defaults section in `src-js/fontra-core/src/fontra-internal-schema.js`; only `LETTERSPACER` exists.
- Existing panel patterns:
  - `panel-letterspacer.js` shows `fontra.internal` source/glyph persistence with `recordChanges()` and `fontController.postChange()`.
  - `panel-glyph-note.js` shows glyph customData editing through scene-controller helpers.
  - `editor.js` registers right-sidebar panels in `initSidebars()`.
  - `ui-form.js` supports `header`, `divider`, `text`, `checkbox`, `edit-number`, `edit-number-slider`, `edit-text`, `universal-row`, and auxiliary elements.
- Donor `skeleton-source-defaults.js` is small and already stores:
  - width defaults for uppercase/lowercase base, horizontal, contrast, distribution
  - cap defaults for square angle/distance and round radius/tension
  - custom width and cap profiles
- Donor `panel-skeleton-parameters.js` mixes useful UI/value logic with forbidden direct persistence:
  - imports `setSkeletonData()` and `regenerateSkeletonContours()`
  - writes donor flat fields like `leftWidth`, `rightWidth`, `leftNudge`, `leftHandleInOffsetX`
  - uses generated path lookup for editable rib handle positions
  - contains source defaults, width/profile, cap/corner, single-sided, rib reset, handle edit, and debug slider logic in one file
- Cleanup reference `origin/ref/cleanup` still contains the same donor panel shape for WS-15 purposes; use it as a reading aid only.

---

## File Structure

```
src-js/fontra-core/src/
  fontra-internal-schema.js              [MODIFY] add SKELETON_DEFAULTS section
  skeleton-source-defaults.js            [CREATE] defaults keys, normalization, get/set helpers, glyph-case helpers
  skeleton-model.js                      [MODIFY] add missing panel-facing canonical accessors/mutators

src-js/fontra-core/tests/
  test-skeleton-source-defaults.js       [CREATE] defaults storage and fallback tests
  test-skeleton-model.js                 [MODIFY] panel-facing mutator tests if helpers are added

src-js/views-editor/src/
  skeleton-panel-model.js                [CREATE] pure selection aggregation, mixed-value, profile, and form-state helpers
  skeleton-panel-edits.js                [CREATE] editSkeleton-backed panel edit operations
  panel-skeleton-parameters.js           [CREATE] UI only: build form sections and call edit helpers
  editor.js                              [MODIFY] register panel in right sidebar

src-js/fontra-core/assets/lang/
  en.js                                  [MODIFY] sidebar and panel labels
```

If WS-11/12/13 already created helper modules that own some panel edit operations, reuse those files and keep `skeleton-panel-edits.js` as a thin coordinator instead of duplicating executor logic.

---

## Task 1: Add Source Defaults Storage Helpers

**Files:**
- Modify: `src-js/fontra-core/src/fontra-internal-schema.js`
- Create: `src-js/fontra-core/src/skeleton-source-defaults.js`
- Create: `src-js/fontra-core/tests/test-skeleton-source-defaults.js`

**Interfaces:**

```javascript
export const SKELETON_SOURCE_DEFAULT_KEYS;
export const SKELETON_SOURCE_DEFAULT_FALLBACKS;
export function normalizeSkeletonSourceDefaults(rawDefaults);
export function getSourceSkeletonDefaultsValue(source, key, fallback);
export function setSourceSkeletonDefaultsValues(source, values);
export function getSkeletonGlyphCase(glyphName);
export function getDefaultSkeletonWidthKeyForGlyphName(glyphName);
```

- [ ] **Step 1: Add failing defaults tests**

Create tests for:

```text
unknown source -> fallback value
known width key -> stored value from fontra.internal.skeletonDefaults
set known values -> creates fontra.internal with schemaVersion and skeletonDefaults section
set unknown values only -> returns false and does not mutate source
normalization preserves custom profile arrays
normalization creates widthDefaults/capDefaults/profile containers
glyph case upper -> uppercase base key
glyph case lower -> lowercase base key
glyph name with suffix -> base glyph case still resolves
unknown glyph -> uppercase fallback
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-source-defaults.js --reporter spec
```

Expected: fail because `skeleton-source-defaults.js` does not exist.

- [ ] **Step 3: Add `SKELETON_DEFAULTS` section**

In `fontra-internal-schema.js`:

```javascript
export const FONTRA_INTERNAL_SECTIONS = Object.freeze({
  LETTERSPACER: "letterspacer",
  SKELETON_DEFAULTS: "skeletonDefaults",
});
```

- [ ] **Step 4: Implement source-default helpers**

Port donor `skeleton-source-defaults.js` into core, with these additions:

```javascript
export const SKELETON_SOURCE_DEFAULT_FALLBACKS = Object.freeze({
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_BASE]: 60,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_HORIZONTAL]: 50,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_CONTRAST]: 40,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_DISTRIBUTION]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_BASE]: 60,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_HORIZONTAL]: 50,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_CONTRAST]: 40,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_DISTRIBUTION]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_RADIUS_RATIO]: 1 / 8,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_TENSION]: 0.55,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_ANGLE]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_DISTANCE]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_WIDTHS_UPPERCASE]: [],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_WIDTHS_LOWERCASE]: [],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_CAP_SQUARE]: [],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_CAP_ROUNDED]: [],
});
```

Use `getFontraInternalSection()` / `setFontraInternalSection()` from core.

- [ ] **Step 5: Implement glyph-case helpers**

Use `getGlyphInfoFromGlyphName()` and suffix-stripping as donor does:

```text
lowercase -> "lowercase"
uppercase/smallcaps/unknown -> "uppercase"
```

Return the width base key and fallback for the glyph's case.

- [ ] **Step 6: Run tests and commit**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-source-defaults.js --reporter spec
cd ../..
npx prettier --write src-js/fontra-core/src/fontra-internal-schema.js src-js/fontra-core/src/skeleton-source-defaults.js src-js/fontra-core/tests/test-skeleton-source-defaults.js
git add .
git commit -m "feat(skeleton): add source defaults storage"
```

---

## Task 2: Add Panel-Facing Skeleton Model Mutators

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**

Add only helpers missing after WS-11/12/13:

```javascript
export function setSkeletonPointTotalWidth(point, defaultWidth, totalWidth, options = {});
export function setSkeletonPointSideWidth(point, defaultWidth, side, halfWidth, options = {});
export function setSkeletonPointWidthDistribution(point, defaultWidth, distribution, options = {});
export function setSkeletonPointWidthLinked(point, linked);
export function setSkeletonContourSingleSided(contour, sideOrNull);
export function setSkeletonContourDefaultWidth(contour, defaultWidth, options = {});
export function setSkeletonCapParameters(point, values, options = {});
export function setSkeletonCornerParameters(point, values, options = {});
export function resetSkeletonEditableRib(point, side);
export function resetSkeletonEditableRibHandles(point, side);
```

- [ ] **Step 1: Write failing mutator tests**

Cover canonical behavior:

```text
total width preserves existing distribution
side width with linked true mirrors the other side
side width with linked false changes one side
distribution -100 collapses left and preserves total
distribution 100 collapses right and preserves total
linked toggle preserves current effective widths
single-sided null/left/right normalizes contour.singleSided
contour default width clamps and rounds
cap round params write canonical cap fields only
cap square params write canonical cap fields only
corner params write canonical corner fields only
reset rib removes nudge/editable/handle offsets for one side
```

Use the canonical schema from WS-6/11/12. Do not assert donor flat fields.

- [ ] **Step 2: Implement helpers by composing existing accessors**

Use existing width/nudge/cap/corner helpers whenever present. If a requested helper already exists with a different name, export an alias instead of reimplementing.

Rules:

```text
width.left/right are half-widths
width.linked defaults true
distribution is donor UI percent in [-100, 100]
singleSided is null | "left" | "right"
rounding is injectable, default Math.round
collapsed width clears editable rib state for affected side
```

- [ ] **Step 3: Run tests and commit**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
cd ../..
npx prettier --write src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git add .
git commit -m "feat(skeleton): add panel skeleton mutators"
```

---

## Task 3: Add Pure Panel Selection and Mixed-Value Helpers

**Files:**
- Create: `src-js/views-editor/src/skeleton-panel-model.js`

**Interfaces:**

```javascript
export function collectSkeletonPanelSelection({ selection, positionedGlyph, skeletonData });
export function summarizeSkeletonPointWidths(selectedPoints, defaultWidth);
export function summarizeSkeletonRibSelection(selectedRibs, defaultWidth);
export function summarizeSkeletonCapSelection(selectedPoints);
export function summarizeSkeletonCornerSelection(selectedPoints);
export function makeSkeletonPanelState(input);
export function capturePointWidthSnapshot(selectedPoints, defaultWidth);
export function applyPointWidthSnapshot(point, snapshot);
```

- [ ] **Step 1: Implement selection collection**

Parse selection keys from `parseSelection()` and resolve:

```text
skeletonPoint/<contourId>/<pointId>
skeletonRib/<contourId>/<pointId>/<side>
editableGeneratedPoint/... from WS-12 only if WS-12 exposes a parser
editableGeneratedHandle/... from WS-12 only if WS-12 exposes a parser
```

Return stable addresses with both ids and indices for UI display, but edits must use ids.

- [ ] **Step 2: Implement mixed-value summaries**

Each summary returns values in this shape:

```javascript
{
  value,
  mixed,
  disabled,
  placeholder
}
```

Cover:

```text
left half-width
right half-width
total width
width linked state
distribution
single-sided state
editable rib state
detached handle state
cap radius/tension/angle/distance
corner roundness/asymmetry/debug fields
```

- [ ] **Step 3: Implement snapshot helpers**

Snapshots power donor-style profile apply/revert:

```text
capture current point width objects by contourId/pointId
restore exact canonical width object
restore linked state
do not store donor flat fields
```

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-panel-model.js
npx prettier --write src-js/views-editor/src/skeleton-panel-model.js
git add .
git commit -m "feat(skeleton): add panel state helpers"
```

---

## Task 4: Add `editSkeleton`-Backed Panel Edit Operations

**Files:**
- Create: `src-js/views-editor/src/skeleton-panel-edits.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js` only if a tiny helper export is needed

**Interfaces:**

```javascript
export async function editSelectedSkeletonPoints(sceneController, selectionAddresses, mutator, undoLabel);
export async function setPanelPointSideWidth(sceneController, selectionState, side, value, options);
export async function setPanelPointTotalWidth(sceneController, selectionState, value, options);
export async function setPanelPointDistribution(sceneController, selectionState, value, options);
export async function setPanelPointLinked(sceneController, selectionState, linked);
export async function setPanelContourSingleSided(sceneController, selectionState, sideOrNull);
export async function setPanelContourDefaultWidth(sceneController, selectionState, value);
export async function setPanelCapParameters(sceneController, selectionState, values, undoLabel);
export async function setPanelCornerParameters(sceneController, selectionState, values, undoLabel);
export async function resetPanelRibs(sceneController, selectionState, options);
export async function setPanelRibHandleParameter(sceneController, selectionState, side, role, parameter, value);
```

- [ ] **Step 1: Implement one generic edit loop**

The loop:

```text
calls sceneController.editGlyph()
iterates sceneController.editingLayerNames
gets layer glyph
calls editSkeleton(layerGlyph, mutate)
resolves selected ids in each layer
skips missing contours/points/sides
returns one combined change object with undoLabel and broadcast true
```

Do not record customData or generated path changes in this file directly. That is `editSkeleton`'s job.

- [ ] **Step 2: Implement point width operations**

Use Task 2 core helpers:

```text
pointWidthLeft -> setSkeletonPointSideWidth(..., "left")
pointWidthRight -> setSkeletonPointSideWidth(..., "right")
pointWidthTotal -> setSkeletonPointTotalWidth()
pointDistribution -> setSkeletonPointWidthDistribution()
linked checkbox -> setSkeletonPointWidthLinked()
scale slider -> multiply effective left/right then set total/sides
profile apply -> set total width
profile revert -> apply snapshot
```

Honor donor width anchor behavior by translating the skeleton point through the core/WS-11 anchor helper if it exists. If no helper exists yet, add it to `skeleton-model.js` in Task 2 before implementing panel edits.

- [ ] **Step 3: Implement contour operations**

Use canonical contour fields:

```text
single-sided checkbox false -> contour.singleSided = null
single-sided checkbox true -> preserve current side or default "left"
direction dropdown -> contour.singleSided = "left" | "right"
default width -> contour.defaultWidth
```

Changing contour single-sided/default width must regenerate outlines through `editSkeleton`.

- [ ] **Step 4: Implement cap and corner operations**

Use donor numeric ranges but canonical fields:

```text
round cap: capRadiusRatio, capTension
square cap: capAngle, capDistance
corner: roundnessStrength, cornerAsymmetry, cornerTrimRatioDebug, cornerRadiusBoostDebug
```

If WS-6 named these fields differently, use the WS-6 names and document the donor mapping in the helper comments.

- [ ] **Step 5: Implement rib/editable-generated handle operations**

Call WS-11/12 helpers where available:

```text
reset rib nudge
make ribs uneditable
reset handle offsets
set handle length
set handle angle
detach/attach handle lengths
```

Do not recover handle positions by matching generated path coordinates. Use WS-7 provenance and WS-12 editable-generated handle helpers.

- [ ] **Step 6: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-panel-edits.js
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/skeleton-panel-edits.js src-js/views-editor/src/skeleton-editing.js
git add .
git commit -m "feat(skeleton): add panel edit operations"
```

---

## Task 5: Build the Skeleton Parameters Panel Shell

**Files:**
- Create: `src-js/views-editor/src/panel-skeleton-parameters.js`
- Modify: `src-js/views-editor/src/editor.js`
- Modify: `src-js/fontra-core/assets/lang/en.js`

**Interfaces:**
- Panel identifier: `skeleton-parameters`
- Icon: `/tabler-icons/bone.svg`
- Custom element: `panel-skeleton-parameters`

- [ ] **Step 1: Add panel registration**

In `editor.js`, import and add the panel to the right sidebar after `TransformationPanel` or beside `SelectionInfoPanel`:

```javascript
import SkeletonParametersPanel from "./panel-skeleton-parameters.js";
...
this.addSidebarPanel(new SkeletonParametersPanel(this), "right");
```

- [ ] **Step 2: Add localization strings**

Add minimal strings directly to `en.js` despite the generated-file warning, matching existing local edits:

```javascript
"sidebar.skeleton-parameters": "Skeleton Parameters",
"sidebar.skeleton-parameters.title": "Skeleton parameters",
```

Add field labels used by the first panel shell. Later tasks may add more keys.

- [ ] **Step 3: Implement panel constructor and refresh listeners**

Follow `panel-letterspacer.js`:

```text
create Form
append scrollable panel section
cache sceneController/fontController
listen to selectedGlyph, selectedGlyphName, selection, editingLayers, editLayerName, positionedLines
skip rebuild during active slider streams
```

- [ ] **Step 4: Build a minimal read-only state**

When no editable skeleton exists, show:

```text
header: Skeleton parameters
text: No skeleton selection
```

When skeleton exists, show current glyph case and source default width/cap summary.

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/editor.js
node --check src-js/fontra-core/assets/lang/en.js
npx prettier --write src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git add .
git commit -m "feat(skeleton): register parameters panel"
```

---

## Task 6: Add Source Defaults UI and Persistence

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
- Modify: `src-js/views-editor/src/skeleton-panel-edits.js`
- Modify: `src-js/fontra-core/assets/lang/en.js`

**Fields:**

```text
uppercase base / horizontal / contrast / distribution
lowercase base / horizontal / contrast / distribution
round cap radius ratio / tension
square cap angle / distance
custom width profile lists
custom cap profile lists
```

- [ ] **Step 1: Add current glyph defaults summary**

Display donor summary:

```text
Case
Default widths: Base X, Horizontal Y, Contrast Z
Default distribution
Default caps
```

Use `getDefaultSkeletonWidthKeyForGlyphName()` and source-default helpers.

- [ ] **Step 2: Add editable source default controls**

Use `edit-number` and `edit-number-slider` fields:

```text
current case base width
current case horizontal width
current case contrast width
current case distribution
round cap radius/tension
square cap angle/distance
```

Keep advanced full uppercase/lowercase controls behind a separate "Source defaults" section. Do not crowd all fields above point parameters.

- [ ] **Step 3: Persist defaults through font source changes**

Implement:

```javascript
async function persistSourceSkeletonDefaults(fontController, sceneController, values, undoLabel)
```

Use `recordChanges()` over `{ sources: fontController.sources }` like letterspacer does, call `setSourceSkeletonDefaultsValues(source, values)`, and post through `fontController.postChange()`.

If the active glyph has compatible sparse source behavior, update the effective source id used by `sceneSettings.fontLocationSourceMapped`; otherwise use the active editing layer source id.

- [ ] **Step 4: Refresh dependent panels**

After source-default writes:

```text
panel updates itself
designspace-navigation refreshes if it exposes refreshSourcesAndStatus()
canvas requests update only if skeleton rendering depends on defaults for visible data
```

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/skeleton-panel-edits.js
node --check src-js/fontra-core/assets/lang/en.js
npx prettier --write src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/skeleton-panel-edits.js src-js/fontra-core/assets/lang/en.js
git add .
git commit -m "feat(skeleton): edit source defaults from panel"
```

---

## Task 7: Add Point Width, Distribution, and Profile Controls

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
- Modify: `src-js/views-editor/src/skeleton-panel-model.js`
- Modify: `src-js/views-editor/src/skeleton-panel-edits.js`
- Modify: `src-js/fontra-core/assets/lang/en.js`

- [ ] **Step 1: Build point parameter section**

Show when selection includes skeleton points or ribs:

```text
Linked checkbox
Anchor segmented control: L / Center / R
Profile dropdown
Total width edit-number
Left width edit-number
Right width edit-number
Distribution slider
Scale slider
Set Global button
Revert profile button
```

Mixed values show `placeholder: "mixed"` and allow empty fields where `ui-form` supports it.

- [ ] **Step 2: Implement linked and anchor behavior**

Linked:

```text
checked -> width.linked true and both sides synchronized on next side edit
unchecked -> width.linked false and existing effective sides preserved
```

Anchor:

```text
left -> point position shifts so left rib stays anchored
right -> point position shifts so right rib stays anchored
center -> point center stays fixed
single-sided -> only active side and center are offered
```

- [ ] **Step 3: Implement total/side/distribution edits**

Route:

```text
pointWidthTotal -> setPanelPointTotalWidth()
pointWidthLeft/right -> setPanelPointSideWidth()
pointDistribution stream -> setPanelPointDistribution() with one undo record
scale slider -> scale effective widths with min total width 2
```

Use value streams for sliders so drag does not rebuild the form every frame.

- [ ] **Step 4: Implement width profiles**

Profiles come from source defaults:

```text
base, horizontal, contrast for current glyph case
custom profiles from skeletonDefaults.widthProfiles.uppercase/lowercase
```

Applying a profile:

```text
captures width snapshot once per selection context
sets total width to profile value
allows one-click revert to snapshot or previous total width
```

Set Global:

```text
first click arms confirmation for current selection context
second click writes current selection value to current source default key/profile
```

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/skeleton-panel-model.js
node --check src-js/views-editor/src/skeleton-panel-edits.js
node --check src-js/fontra-core/assets/lang/en.js
npx prettier --write src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/skeleton-panel-model.js src-js/views-editor/src/skeleton-panel-edits.js src-js/fontra-core/assets/lang/en.js
git add .
git commit -m "feat(skeleton): edit point widths from panel"
```

---

## Task 8: Add Contour, Cap, and Corner Controls

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
- Modify: `src-js/views-editor/src/skeleton-panel-model.js`
- Modify: `src-js/views-editor/src/skeleton-panel-edits.js`

- [ ] **Step 1: Add contour controls**

Show for selections that resolve to one or more skeleton contours:

```text
Single-sided checkbox
Direction dropdown: Left / Right
Contour default width
```

Mixed single-sided state should show indeterminate/placeholder behavior where possible.

- [ ] **Step 2: Add round cap controls**

For round-cap selected endpoints:

```text
radius ratio slider, donor range 1/128 to 1/4
tension slider, donor default 0.55
Set Global button
profile dropdown from capProfiles.round
```

- [ ] **Step 3: Add square cap controls**

For square-cap selected endpoints:

```text
angle slider, donor range -85..85
distance edit-number
Set Global button
profile dropdown from capProfiles.square
```

- [ ] **Step 4: Add corner controls**

For applicable skeleton corner selections:

```text
roundness slider 0..1
asymmetry slider -1..1
corner trim ratio debug slider 0.05..0.99
corner radius boost debug slider 0.1..4
```

If the current schema dropped donor debug fields, show only fields the generator consumes and list the debug fields as explicit deviations.

- [ ] **Step 5: Route every edit through panel edit helpers**

No form handler may mutate `selectedData` directly. Each field change calls `skeleton-panel-edits.js`, which calls `editSkeleton`.

- [ ] **Step 6: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/skeleton-panel-model.js
node --check src-js/views-editor/src/skeleton-panel-edits.js
npx prettier --write src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/skeleton-panel-model.js src-js/views-editor/src/skeleton-panel-edits.js
git add .
git commit -m "feat(skeleton): edit contour caps and corners from panel"
```

---

## Task 9: Add Rib and Editable-Generated Handle Controls

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
- Modify: `src-js/views-editor/src/skeleton-panel-model.js`
- Modify: `src-js/views-editor/src/skeleton-panel-edits.js`
- Modify: `src-js/views-editor/src/skeleton-ribs.js` only if WS-11 needs a small exported reset helper
- Modify: `src-js/views-editor/src/skeleton-generated.js` only if WS-12 needs a small exported handle helper

- [ ] **Step 1: Add rib editability controls**

Show when selected rib sides or skeleton points with editable ribs exist:

```text
Editable checkbox
Detach handles checkbox
Reset rib position button
Reset handle offsets button
Make ribs uneditable button
```

Honor donor rule: editable ribs are not available for round cap endpoints if the generator cannot support them.

- [ ] **Step 2: Add handle numeric inputs**

For selected skeleton handles or editable-generated handles:

```text
in handle length
out handle length
handle angle
```

Use mixed placeholders for multi-selection.

- [ ] **Step 3: Implement detach/attach handles without generated geometry recovery**

When detaching:

```text
use WS-12 editable-generated/provenance helpers to capture current handle offsets
store canonical handleOffsets in skeleton data
```

When attaching:

```text
remove detached offsets or convert through the WS-12 helper
```

Do not port donor `_findHandlePositionsForRibPoint()` tolerance search.

- [ ] **Step 4: Implement reset buttons**

Route:

```text
Reset rib position -> clear nudge for selected editable side(s)
Reset handle offsets -> clear canonical handleOffsets for selected side(s)
Make ribs uneditable -> clear editable/nudge/handleOffsets for selected skeleton point side(s)
```

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/skeleton-panel-model.js
node --check src-js/views-editor/src/skeleton-panel-edits.js
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/skeleton-generated.js
npx prettier --write src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/skeleton-panel-model.js src-js/views-editor/src/skeleton-panel-edits.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-generated.js
git add .
git commit -m "feat(skeleton): edit ribs and handles from panel"
```

---

## Task 10: Panel Refresh, Undo, and UI Polish

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
- Modify: `src-js/views-editor/src/skeleton-panel-model.js`

- [ ] **Step 1: Add state signature caching**

Port donor's concept, not its full implementation:

```text
signature includes selected glyph name
editing layer names
selection keys
source default values relevant to current glyph case
selected skeleton point/rib/cap/corner values
```

Skip rebuild while slider value streams are active.

- [ ] **Step 2: Add clear update boundaries**

On successful edits:

```text
update panel values
request canvas update through scene controller if needed
keep focus in active form field during streams
blur active field only on committed number input where donor does
```

- [ ] **Step 3: Confirm undo labels**

Use donor-equivalent labels:

```text
Set point width
Set point total width
Set point distribution
Scale point width by X
Set skeleton defaults
Set cap parameters
Set corner parameter
Reset skeleton ribs
Reset handle offsets
Make ribs uneditable
```

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/skeleton-panel-model.js
npx prettier --write src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/skeleton-panel-model.js
git add .
git commit -m "fix(skeleton): polish parameters panel refresh"
```

---

## Task 11: Bundle, Rail Checks, and Manual Matrix

**Files:**
- Verify all WS-15 files.

- [ ] **Step 1: Run automated checks**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-source-defaults.js --reporter spec
npm test -- test-skeleton-model.js
cd ../..
node --check src-js/fontra-core/src/fontra-internal-schema.js
node --check src-js/fontra-core/src/skeleton-source-defaults.js
node --check src-js/views-editor/src/skeleton-panel-model.js
node --check src-js/views-editor/src/skeleton-panel-edits.js
node --check src-js/views-editor/src/panel-skeleton-parameters.js
node --check src-js/views-editor/src/editor.js
node --check src-js/fontra-core/assets/lang/en.js
npm run bundle
```

- [ ] **Step 2: Run forbidden-path greps**

```bash
rg -n "setSkeletonData\\(|regenerateSkeletonContours\\(|generateContoursFromSkeleton|new VarPackedPath|_findHandlePositionsForRibPoint" src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/skeleton-panel-edits.js src-js/views-editor/src/skeleton-panel-model.js
rg -n "leftWidth|rightWidth|leftNudge|rightNudge|leftEditable|rightEditable|singleSidedDirection|leftHandle(In|Out)Offset|rightHandle(In|Out)Offset|leftHandleDetached|rightHandleDetached" src-js/fontra-core/src src-js/views-editor/src
rg -n "skeletonPoint/\\$\\{.*Index|skeletonRib/\\$\\{.*Index|editableGenerated(Point|Handle)/\\$\\{.*Index" src-js/views-editor/src
rg -n "FONTRA_INTERNAL_SECTIONS\\.SKELETON_DEFAULTS|skeletonDefaults|skeleton-parameters" src-js
```

Expected:

```text
panel files do not directly persist skeleton data or recover generated geometry
no donor flat schema fields in runtime source
no index-based skeleton selection keys
skeletonDefaults and skeleton-parameters are registered
```

- [ ] **Step 3: Manual editor matrix**

Run forkra and donor `fd76d3abe` side by side with WS-10/11/12/14 fixtures:

```text
panel basics:
  skeleton parameters tab appears in right sidebar
  no skeleton selection -> useful empty state
  selection changes refresh the panel
  source/layer changes refresh source defaults
  slider drags do not rebuild the form mid-drag

source defaults:
  edit uppercase base/horizontal/contrast widths -> source customData fontra.internal.skeletonDefaults updates
  edit lowercase defaults -> only lowercase keys update
  edit distribution -> new skeleton points for that case use the value
  edit round cap defaults -> newly created round caps use them
  edit square cap defaults -> newly created square caps use them
  undo/redo source defaults works

point widths:
  single selected point shows left/right/total/distribution
  multi selected points show mixed placeholders
  linked checked -> side edit mirrors opposite side
  linked unchecked -> side edit affects one side
  total width preserves distribution
  distribution slider preserves total width
  scale slider multiplies widths and has one undo record
  width anchor left/right/center preserves expected rib side
  profile apply/revert restores previous values
  Set Global stores selected width into the active source default

contour:
  single-sided checkbox toggles canonical contour.singleSided
  direction dropdown changes active side
  inactive side rib controls disappear for single-sided contour
  contour default width edits regenerate generated outlines

caps and corners:
  round cap radius/tension edit updates selected caps
  square cap angle/distance edit updates selected caps
  cap profiles apply/revert
  Set Global for cap defaults writes source defaults
  corner roundness/asymmetry/debug controls update generated geometry when schema supports them

ribs and handles:
  editable checkbox enables/disables selected rib side
  reset rib position clears nudge only
  reset handle offsets clears handle offsets only
  make ribs uneditable clears editable/nudge/handle offsets
  detach/attach handle lengths preserves visible handle position where WS-12 supports it
  in/out length and angle fields update selected handles

state:
  all skeleton edits update every editable layer with matching stable ids
  layers missing a selected id are skipped without blocking others
  undo/redo restores skeleton data and generated outlines
  reload preserves source defaults and skeleton edits
```

- [ ] **Step 4: Commit final fixes if needed**

```bash
npx prettier --write src-js/fontra-core/src/fontra-internal-schema.js src-js/fontra-core/src/skeleton-source-defaults.js src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-source-defaults.js src-js/fontra-core/tests/test-skeleton-model.js src-js/views-editor/src/skeleton-panel-model.js src-js/views-editor/src/skeleton-panel-edits.js src-js/views-editor/src/panel-skeleton-parameters.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git status --short
```

If formatting or fixes changed files:

```bash
git add .
git commit -m "fix(skeleton): complete parameters panel checks"
```

---

## Deviations

- Donor `panel-skeleton-parameters.js` is not copied wholesale. Its field semantics and numeric behavior are ported into small helpers and a thin UI.
- Donor direct calls to `setSkeletonData()` and `regenerateSkeletonContours()` are replaced by `editSkeleton`.
- Donor generated-path handle matching is not ported; editable-generated handle operations use WS-7/12 provenance helpers.
- Donor flat fields are mapped to canonical schema fields from WS-6/11/12.
- Transformation buttons may be displayed only if earlier workstreams already implemented the corresponding actions; transformation parity itself remains WS-16.
- If donor debug corner fields are not present in the landed WS-6/7 generator schema, omit them and list that as an implementation note instead of adding unused data.

---

## Acceptance Criteria

- Skeleton parameters panel is registered and usable from the right sidebar.
- Source skeleton defaults are stored under `fontra.internal.skeletonDefaults` and can be edited per source.
- Point width, side width, total width, linked state, distribution, scale, anchor, and width profiles match donor numeric behavior while writing canonical schema.
- Contour default width and single-sided settings are editable through the panel.
- Cap and corner numeric settings are editable through the panel where the canonical schema supports them.
- Rib/editable-generated handle settings, reset buttons, detach/attach, and numeric handle controls are available with donor parity.
- All skeleton data changes go through `editSkeleton`; source default changes go through `fontController.postChange()`.
- Multi-layer editing applies panel skeleton edits to every editable layer with matching stable ids and skips missing ids safely.
- Regular non-skeleton panel behavior and WS-14 Tunni remain unaffected.
- Automated checks and `npm run bundle` pass.
- Rail greps show no donor flat fields, no direct skeleton persistence in panel files, no generated geometry recovery, and no index-based selection keys.

---

## Self-Review

- **Spec coverage:** WS-15 roadmap requirements are covered: skeleton parameters panel, per-source skeleton defaults, and full numeric-editing parity.
- **Architecture rails:** panel code is split into defaults, pure state helpers, edit operations, and UI; persistence routes through `editSkeleton` or source customData change recording.
- **Donor discipline:** donor panel semantics are preserved where they are user-visible, but donor schema, pointer-era persistence, generated geometry recovery, and monolithic structure are rejected.
- **Scope check:** transformation parity, letterspacer coupling, copy/paste/decompose, and final cross-feature audit remain WS-16.
