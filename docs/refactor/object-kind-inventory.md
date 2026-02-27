# Object-Kind Inventory

Date: 2026-02-27  
Status: Draft

## Scope
In-scope object kinds only (points, anchors, guidelines, skeleton points/ribs/handles, editable generated points/handles, Tunni points). Components/background images are out of scope.

## Regular point (on-curve/off-curve)
Selection key format: `point/index` (parseSelection) - `src-js/fontra-core/src/utils.js:261-263`
Math location: `src-js/views-editor/src/edit-behavior.js:64-130 (EditBehaviorFactory)`
Math location: `src-js/views-editor/src/edit-behavior.js:674-743 (makePointEditFuncs/makeContourPointEditFuncs)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:295-345 (_makeChangeForTransformFunc)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:349-389 (makeRollbackChange)`
Persistence location: `src-js/views-editor/src/scene-controller.js:948-1027 (handleArrowKeys - applyChange + consolidateChanges)`
Routing location: `src-js/views-editor/src/scene-model.js:567-613 (selectionAtPoint)`
Routing location: `src-js/views-editor/src/scene-model.js:616-675 (_selectionAtPoint)`
Routing location: `src-js/views-editor/src/scene-model.js:677-699 (pointSelectionAtPoint)`
Routing location: `src-js/views-editor/src/scene-model.js:1507-1538 (selectionAtRect - point keys)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:2417-2522 (handleDragSelection - regular path)`
Parity-defining: Yes
Notes: On-curve/off-curve determined by `point.type`. Click selection: skeleton-generated outline points are ignored unless they map to an editable rib/handle; those return `point/index` and are routed as editable generated points/handles. Box selection: skeleton-generated outline points are not added as `point/index`; if they map to an editable rib, a `skeletonRibPoint/...` key is collected and only used when the box contains no regular or skeleton points.

## Anchor
Selection key format: `anchor/index` (parseSelection) - `src-js/fontra-core/src/utils.js:261-263`
Math location: `src-js/views-editor/src/edit-behavior.js:457-469 (makeAnchorEditFunc)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:295-345 (_makeChangeForTransformFunc)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:349-389 (makeRollbackChange)`
Persistence location: `src-js/views-editor/src/scene-controller.js:948-1027 (handleArrowKeys)`
Routing location: `src-js/views-editor/src/scene-model.js:1391-1408 (anchorSelectionAtPoint)`
Routing location: `src-js/views-editor/src/scene-model.js:616-675 (_selectionAtPoint)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:2422-2446 (handleDragSelection - selection parse)`
Parity-defining: Yes
Notes: Anchors are routed through the same EditBehavior pipeline as points.

## Guideline
Selection key format: `guideline/index` (parseSelection) - `src-js/fontra-core/src/utils.js:261-263`
Math location: `src-js/views-editor/src/edit-behavior.js:472-492 (makeGuidelineEditFunc)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:295-345 (_makeChangeForTransformFunc)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:349-389 (makeRollbackChange)`
Persistence location: `src-js/views-editor/src/scene-controller.js:948-1027 (handleArrowKeys)`
Routing location: `src-js/views-editor/src/scene-model.js:1413-1440 (guidelineSelectionAtPoint)`
Routing location: `src-js/views-editor/src/scene-model.js:616-675 (_selectionAtPoint)`
Parity-defining: Yes
Notes: Selection is disabled when guidelines visualization is hidden (`guidelineSelectionAtPoint` guards).

## Skeleton point (on-curve/off-curve)
Selection key format: `skeletonPoint/contourIndex/pointIndex` - `src-js/fontra-core/src/utils.js:246-248`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:816-851 (createSkeletonEditBehavior)`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:857-859 (getSkeletonBehaviorName)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:2955-3184 (_handleDragSkeletonPoints - recordChanges + setSkeletonData)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:1230-1374 (handleArrowKeys - skeleton branch)`
Persistence location: `src-js/fontra-core/src/skeleton-contour-generator.js:3490-3506 (setSkeletonData)`
Routing location: `src-js/views-editor/src/scene-model.js:1021-1074 (skeletonPointSelectionAtPoint)`
Routing location: `src-js/views-editor/src/scene-model.js:1555-1578 (selectionAtRect - skeletonPoint keys)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:2417-2484 (handleDragSelection - skeleton branch)`
Parity-defining: Yes
Notes: On-curve/off-curve indicated by `point.type`. Skeleton segment selection can be converted to skeleton point selection in pointer.

## Skeleton handle (off-curve)
Selection key format: `skeletonHandle/contourIndex/pointIndex/in|out` - `src-js/fontra-core/src/utils.js:249-251`
Math location: `src-js/views-editor/src/edit-tools-pointer.js:4705-4734 (_getSkeletonHandleDirForPoint)`
Math location: `src-js/fontra-core/src/skeleton-contour-generator.js:255-307 (applyHandleOffsetToControlPoint)`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:1508-1595 (EditableHandleBehavior)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:4099-4307 (_handleDragEditableGeneratedHandles - setSkeletonData)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:4317-4434 (_handleArrowKeysForEditableHandles - setSkeletonData)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:2451-2469 (handleDragSelection routes to editable handles)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:3868-3883 (_getEditableGeneratedHandlesFromSelection)`
Parity-defining: Yes
Notes: Selection key exists but no direct hit-test uses it. Handle edits are derived from generated point selection and routed through editable handle logic.

## Skeleton rib point (on-curve)
Selection key format: `skeletonRibPoint/contourIndex/pointIndex/left|right` - `src-js/fontra-core/src/utils.js:255-257`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:866-920 (RibEditBehavior)`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:1208-1218 (createEditableRibBehavior)`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:1229-1279 (InterpolatingRibBehavior)`
Math location: `src-js/fontra-core/src/skeleton-contour-generator.js:3355-3387 (calculateNormalAtSkeletonPoint)`
Math location: `src-js/fontra-core/src/skeleton-contour-generator.js:172-197 (applyNudgeToRibPoint)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:3191-3604 (_handleDragRibPoint - setSkeletonData)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:4536-4694 (_handleArrowKeysForRibPoints - setSkeletonData)`
Routing location: `src-js/views-editor/src/scene-model.js:1507-1534 (selectionAtRect - rib keys)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:1781-1825 (handleDrag - rib selection + _handleDragRibPoint)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:4536-4566 (_handleArrowKeysForRibPoints - routing)`
Parity-defining: Yes
Notes: Movement constrained to rib normal; editable flags gate movement; Z/D/S modifiers apply in pointer behavior.

## Editable generated point (rib on-curve)
Selection key format: `editableGeneratedPoint/pathPointIndex/skeletonContourIndex/skeletonPointIndex/side` - `src-js/fontra-core/src/utils.js:258-260`
Math location: `src-js/views-editor/src/edit-tools-pointer.js:3905-3990 (_handleDragEditableGeneratedPoints - behavior selection)`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:1208-1218 (createEditableRibBehavior)`
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:1490-1501 (createInterpolatingRibBehavior)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:4065-4073 (_handleDragEditableGeneratedPoints - setSkeletonData)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:2451-2458 (handleDragSelection routes to editable generated points)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:3616-3635 (_getEditableGeneratedPointsFromSelection)`
Parity-defining: Yes
Notes: Selection key is parseable but not hit-tested directly; editable generated points are derived from regular point selection on generated contours.

## Editable generated handle (rib off-curve)
Selection key format: none (derived from regular point selection)
Math location: `src-js/views-editor/src/skeleton-edit-behavior.js:1508-1595 (EditableHandleBehavior)`
Math location: `src-js/views-editor/src/edit-tools-pointer.js:4141-4174 (_handleDragEditableGeneratedHandles - handle dir + behavior)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:4283-4291 (_handleDragEditableGeneratedHandles - setSkeletonData)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:4317-4434 (_handleArrowKeysForEditableHandles - setSkeletonData)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:2451-2469 (handleDragSelection routes to editable handles)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:3868-3883 (_getEditableGeneratedHandlesFromSelection)`
Parity-defining: Yes
Notes: Off-curve generated handles are routed through editable handle behaviors; selection is derived from point selection.

## Tunni point (path + skeleton)
Selection key format: none (non-selection drag target)
Math location: `src-js/fontra-core/src/tunni-calculations.js:50-96 (calculateTunniPoint / calculateTrueTunniPoint)`
Math location: `src-js/fontra-core/src/tunni-calculations.js:899-1094 (handleTunniPointMouseDown + calculateTunniPointDragChanges)`
Math location: `src-js/fontra-core/src/tunni-calculations.js:1207-1401 (handleTrueTunniPointMouseDown + calculateTrueTunniPointDragChanges)`
Math location: `src-js/views-editor/src/skeleton-tunni-calculations.js:102-130 (calculateSkeletonTunniPoint / calculateSkeletonTrueTunniPoint)`
Math location: `src-js/views-editor/src/skeleton-tunni-calculations.js:141-205 (calculateSkeletonControlPointsFromTunniDelta)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:1535-1670 (handleDrag - applyChange + rollback for Tunni)`
Persistence location: `src-js/views-editor/src/edit-tools-pointer.js:5030-5197 (_handleSkeletonTunniDrag - setSkeletonData)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:1489-1673 (handleDrag - Tunni path)`
Routing location: `src-js/fontra-core/src/tunni-calculations.js:1138-1191 (tunniLayerHitTest)`
Routing location: `src-js/views-editor/src/edit-tools-pointer.js:1872-1944 (handleDrag - skeleton Tunni)`
Routing location: `src-js/views-editor/src/skeleton-tunni-calculations.js:295-338 (skeletonTunniHitTest)`
Parity-defining: Yes (drag-only)
Notes: Tunni points are not selection keys. Path Tunni uses core calculations; skeleton Tunni uses skeleton-specific calculations and persists via skeleton data updates.

