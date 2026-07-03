import { ChangeCollector } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import {
  DEFAULT_SKELETON_WIDTH,
  appendSkeletonContour,
  appendSkeletonPoint,
  getSkeletonData,
  makeSkeletonPoint,
} from "@fontra/core/skeleton-model.js";
import { parseSelection } from "@fontra/core/utils.ts";
import { BaseTool } from "./edit-tools-base.js";
import {
  editSkeleton,
  getSkeletonPointAddress,
  makeSkeletonPointKey,
  parseSkeletonPointKey,
  resolveSkeletonAddressAcrossLayers,
} from "./skeleton-editing.js";

export class SkeletonPenTool extends BaseTool {
  iconPath = "/images/skeleton-pen.svg";
  identifier = "skeleton-pen-tool";

  // The edit layer's skeleton data. Selection ids are canonical here (WS-9
  // cross-layer addressing); other editable layers resolve by structural
  // ordinal inside editSkeleton mutations.
  _getEditLayerSkeletonData() {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.canEdit) {
      return null;
    }
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    const layerGlyph = editLayerName
      ? positionedGlyph.varGlyph?.glyph?.layers?.[editLayerName]?.glyph
      : positionedGlyph.glyph.instance;
    return layerGlyph ? getSkeletonData(layerGlyph) : null;
  }

  // Positioned-glyph-relative point from a mouse event, in glyph coordinates.
  _getGlyphPoint(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return null;
    }
    const point = this.sceneController.localPoint(event);
    return {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };
  }

  // Id-based skeleton point hit test. Reuses the WS-9 scene-model hit test so
  // there is a single stable-id hit path; returns { contourId, pointId } or null.
  _hitTestSkeletonPoint(event) {
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    const parsedCurrentSelection = parseSelection([...this.sceneController.selection]);
    const hit = this.sceneModel.skeletonPointAtPoint(
      point,
      size,
      parsedCurrentSelection
    );
    const key = [...hit][0];
    return key ? parseSkeletonPointKey(key) : null;
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    const skeletonHit = this._hitTestSkeletonPoint(initialEvent);
    if (skeletonHit) {
      const closeTarget = this._getCloseTarget(skeletonHit);
      if (closeTarget) {
        await this._handleCloseSkeletonContour(closeTarget);
        eventStream.done();
        return;
      }
      // Clicking an existing skeleton point selects it (dragging is handled by
      // the pointer tool's skeleton behavior).
      this.sceneController.selection = new Set([
        makeSkeletonPointKey(skeletonHit.contourId, skeletonHit.pointId),
      ]);
      eventStream.done();
      return;
    }

    await this._handleAddSkeletonPoint(eventStream, initialEvent);
  }

  // Runs one editSkeleton mutation across every editable layer and folds the
  // per-layer changes into one undo item. `applyMutation(working, reference)`
  // mutates a layer's working skeleton and returns the selection keys to apply
  // (honored from the edit layer only, where ids are canonical).
  async _editSkeletonAcrossLayers(undoLabel, applyMutation) {
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );
      const entries = Object.entries(editingLayers);
      if (!entries.length) {
        return;
      }
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      const editLayerGlyph = editingLayers[editLayerName] || entries[0][1];
      const referenceSkeletonData = getSkeletonData(editLayerGlyph);

      let primarySelection = null;
      const allChanges = [];
      for (const [layerName, layerGlyph] of entries) {
        const isEditLayer = layerGlyph === editLayerGlyph;
        const changes = editSkeleton(
          layerGlyph,
          (working) => {
            const selectionKeys = applyMutation(working, referenceSkeletonData);
            if (isEditLayer && selectionKeys) {
              primarySelection = new Set(selectionKeys);
            }
          },
          { createIfMissing: true }
        );
        allChanges.push(changes.prefixed(["layers", layerName, "glyph"]));
      }

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);
      if (primarySelection) {
        this.sceneController.selection = primarySelection;
      }
      return { changes: combined, undoLabel, broadcast: true };
    });
  }

  // referenceSkeletonData is the EDIT layer's skeleton; selection ids are
  // canonical there and resolve into this layer by structural ordinal (WS-9
  // cross-layer addressing). parseSelection returns arrays (WS-9 Task 0).
  _getSelectedOpenEndpoint(skeletonData, referenceSkeletonData) {
    const { skeletonPoint } = parseSelection([...this.sceneController.selection]);
    if (!skeletonPoint || skeletonPoint.length !== 1) {
      return null;
    }
    const { contourId, pointId } = parseSkeletonPointKey(skeletonPoint[0]);
    const address = resolveSkeletonAddressAcrossLayers(
      referenceSkeletonData || skeletonData,
      skeletonData,
      contourId,
      pointId
    );
    if (!address || address.contour.closed || address.point.type) {
      return null;
    }
    const onCurves = address.contour.points.filter((point) => !point.type);
    if (onCurves.length < 1) {
      return null;
    }
    if (onCurves[0].id === address.point.id) {
      return { ...address, appendMode: "prepend" };
    }
    if (onCurves.at(-1).id === address.point.id) {
      return { ...address, appendMode: "append" };
    }
    return null;
  }

  async _handleAddSkeletonPoint(eventStream, initialEvent) {
    const glyphPoint = this._getGlyphPoint(initialEvent);
    if (!glyphPoint) {
      eventStream.done();
      return;
    }
    const pointData = {
      x: Math.round(glyphPoint.x),
      y: Math.round(glyphPoint.y),
      type: null,
      smooth: false,
    };

    await this._editSkeletonAcrossLayers(
      translate("edit-tools-skeleton.undo.add-point"),
      (working, referenceSkeletonData) => {
        const endpoint = this._getSelectedOpenEndpoint(working, referenceSkeletonData);
        if (endpoint) {
          const point = makeSkeletonPoint(pointData, working);
          if (endpoint.appendMode === "append") {
            endpoint.contour.points.push(point);
          } else {
            endpoint.contour.points.unshift(point);
          }
          return [makeSkeletonPointKey(endpoint.contour.id, point.id)];
        }
        const contour = appendSkeletonContour(working, {
          closed: false,
          defaultWidth: DEFAULT_SKELETON_WIDTH,
          points: [],
        });
        const point = appendSkeletonPoint(working, contour.id, pointData);
        return [makeSkeletonPointKey(contour.id, point.id)];
      }
    );

    // Drag-to-curve is out of scope for the Skeleton Pen (WS-10 Deviations):
    // consume any remaining drag events without action.
    for await (const event of eventStream) {
      // consume
    }
  }

  // If the click hits the opposite endpoint of the same open contour whose
  // endpoint is currently selected, return the close target (edit-layer
  // canonical ids); otherwise null. Uses edit-layer skeleton data.
  _getCloseTarget(skeletonHit) {
    const skeletonData = this._getEditLayerSkeletonData();
    if (!skeletonData) {
      return null;
    }
    const { skeletonPoint } = parseSelection([...this.sceneController.selection]);
    if (!skeletonPoint || skeletonPoint.length !== 1) {
      return null;
    }
    const selected = parseSkeletonPointKey(skeletonPoint[0]);
    if (selected.contourId !== skeletonHit.contourId) {
      return null;
    }
    const address = getSkeletonPointAddress(
      skeletonData,
      skeletonHit.contourId,
      skeletonHit.pointId
    );
    if (!address || address.contour.closed) {
      return null;
    }
    const onCurves = address.contour.points.filter((point) => !point.type);
    if (onCurves.length < 2) {
      return null;
    }
    const firstId = onCurves[0].id;
    const lastId = onCurves.at(-1).id;
    const clickedId = skeletonHit.pointId;
    const selectedId = selected.pointId;
    const opposite =
      (selectedId === lastId && clickedId === firstId) ||
      (selectedId === firstId && clickedId === lastId);
    if (!opposite) {
      return null;
    }
    return { contourId: skeletonHit.contourId, clickedPointId: clickedId };
  }

  async _handleCloseSkeletonContour(closeTarget) {
    await this._editSkeletonAcrossLayers(
      translate("edit-tools-skeleton.undo.close-contour"),
      (working, referenceSkeletonData) => {
        const address = resolveSkeletonAddressAcrossLayers(
          referenceSkeletonData || working,
          working,
          closeTarget.contourId,
          closeTarget.clickedPointId
        );
        if (!address) {
          return null;
        }
        address.contour.closed = true;
        return [
          makeSkeletonPointKey(closeTarget.contourId, closeTarget.clickedPointId),
        ];
      }
    );
  }

  deactivate() {
    super.deactivate();
    delete this.sceneModel.skeletonInsertHandles;
    this.sceneController.hoverSelection = new Set();
    this.canvasController.requestUpdate();
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = this.sceneModel.selectedGlyph?.isEditing
      ? "crosshair"
      : "default";
  }
}
