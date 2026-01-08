import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { parseSelection } from "@fontra/core/utils.js";
import * as vector from "@fontra/core/vector.js";
import {
  generateContoursFromSkeleton,
  getSkeletonData,
  createEmptySkeletonData,
  createSkeletonContour,
} from "@fontra/core/skeleton-contour-generator.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { constrainHorVerDiag } from "./edit-behavior.js";

const SKELETON_CUSTOM_DATA_KEY = "fontra.skeleton";

export class SkeletonPenTool extends BaseTool {
  iconPath = "/images/skeleton-pen.svg";
  identifier = "skeleton-pen-tool";

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();

    // Check for hovering over existing skeleton points
    const skeletonHit = this._hitTestSkeletonPoints(event);
    if (skeletonHit) {
      const hoverKey = `skeletonPoint/${skeletonHit.contourIndex}/${skeletonHit.pointIndex}`;
      const prevHover = this.sceneModel.hoverSelection;
      const newHover = new Set([hoverKey]);

      if (!prevHover || !this._setsEqual(prevHover, newHover)) {
        this.sceneController.hoverSelection = newHover;
        this.canvasController.requestUpdate();
      }
    } else {
      if (this.sceneController.hoverSelection?.size) {
        this.sceneController.hoverSelection = new Set();
        this.canvasController.requestUpdate();
      }
    }
  }

  _setsEqual(setA, setB) {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  }

  deactivate() {
    super.deactivate();
    this.sceneController.hoverSelection = new Set();
    this.canvasController.requestUpdate();
  }

  setCursor() {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].setCursor();
    } else {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    // Check if we clicked on an existing skeleton point
    const skeletonHit = this._hitTestSkeletonPoints(initialEvent);

    if (skeletonHit) {
      // Drag existing skeleton point
      await this._handleDragSkeletonPoint(eventStream, initialEvent, skeletonHit);
    } else {
      // Add new skeleton point
      await this._handleAddSkeletonPoint(eventStream, initialEvent);
    }
  }

  _hitTestSkeletonPoints(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.canEdit) {
      return null;
    }

    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) {
      return null;
    }

    const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
      varGlyph.glyph.layers
    );
    const editingLayerName = Object.keys(editingLayers)[0];

    if (!editingLayerName) {
      return null;
    }

    const layer = varGlyph.glyph.layers[editingLayerName];
    const skeletonData = getSkeletonData(layer);

    if (!skeletonData?.contours?.length) {
      return null;
    }

    const localPoint = this.sceneController.localPoint(event);
    // Adjust for glyph position
    const glyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };
    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];
        const dist = vector.distance(glyphPoint, skeletonPoint);
        if (dist <= margin) {
          return { contourIndex, pointIndex, point: skeletonPoint };
        }
      }
    }

    return null;
  }

  async _handleAddSkeletonPoint(eventStream, initialEvent) {
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );
      const layerEntries = Object.entries(editingLayers);

      if (layerEntries.length === 0) {
        return;
      }

      const [primaryLayerName, primaryLayerGlyph] = layerEntries[0];

      // Get or create skeleton data
      let skeletonData = getSkeletonData(primaryLayerGlyph);
      if (!skeletonData) {
        skeletonData = createEmptySkeletonData();
      } else {
        // Deep clone to avoid mutation issues
        skeletonData = JSON.parse(JSON.stringify(skeletonData));
      }

      const clickPoint = this.sceneController.localPoint(initialEvent);
      const newPoint = {
        x: Math.round(clickPoint.x),
        y: Math.round(clickPoint.y),
        type: null,
        smooth: true,
        width: skeletonData.contours[0]?.defaultWidth || 20,
      };

      // Determine which contour to add to
      const { skeletonPoint: selectedSkeletonPoints } = parseSelection(
        this.sceneController.selection
      );

      let targetContourIndex = -1;
      let insertAtEnd = true;

      if (selectedSkeletonPoints?.size === 1) {
        // We have a selected skeleton point - append/prepend to its contour
        const selectedKey = [...selectedSkeletonPoints][0];
        const [contourIdx, pointIdx] = selectedKey.split("/").map(Number);
        targetContourIndex = contourIdx;

        const contour = skeletonData.contours[targetContourIndex];
        if (contour && !contour.isClosed) {
          // Check if selected point is at start or end
          insertAtEnd = pointIdx === contour.points.length - 1;
        }
      }

      // Record changes for all layers
      const layerChanges = [];

      for (const [layerName, layerGlyph] of layerEntries) {
        const layerChange = recordChanges(layerGlyph, (lg) => {
          // Get or create skeleton data for this layer
          if (!lg.customData) {
            lg.customData = {};
          }

          let layerSkeletonData = lg.customData[SKELETON_CUSTOM_DATA_KEY];
          if (!layerSkeletonData) {
            layerSkeletonData = createEmptySkeletonData();
          } else {
            layerSkeletonData = JSON.parse(JSON.stringify(layerSkeletonData));
          }

          if (targetContourIndex >= 0 && targetContourIndex < layerSkeletonData.contours.length) {
            // Add to existing contour
            const contour = layerSkeletonData.contours[targetContourIndex];
            if (insertAtEnd) {
              contour.points.push({ ...newPoint });
            } else {
              contour.points.unshift({ ...newPoint });
            }
          } else {
            // Create new contour
            const newContour = createSkeletonContour(false);
            newContour.points.push({ ...newPoint });
            layerSkeletonData.contours.push(newContour);
            targetContourIndex = layerSkeletonData.contours.length - 1;
          }

          // Regenerate outline contours from skeleton
          this._regenerateOutlineContours(lg, layerSkeletonData);

          lg.customData[SKELETON_CUSTOM_DATA_KEY] = layerSkeletonData;
        });

        layerChanges.push(layerChange.prefixed(["layers", layerName, "glyph"]));
      }

      const changes = new ChangeCollector().concat(...layerChanges);
      await sendIncrementalChange(changes.change);

      // Update selection to new point
      const contour = skeletonData.contours[targetContourIndex] ||
        { points: [newPoint] };
      const newPointIndex = insertAtEnd
        ? contour.points.length  // Will be at end after add
        : 0;
      this.sceneController.selection = new Set([
        `skeletonPoint/${targetContourIndex}/${newPointIndex}`,
      ]);

      // Handle dragging to create handles
      if (await shouldInitiateDrag(eventStream, initialEvent)) {
        for await (const event of eventStream) {
          const dragPoint = this.sceneController.localPoint(event);
          // For now, just track the drag - handle creation can be added later
        }
      }

      return {
        changes: changes,
        undoLabel: "Add skeleton point",
      };
    });
  }

  async _handleDragSkeletonPoint(eventStream, initialEvent, skeletonHit) {
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );
      const layerEntries = Object.entries(editingLayers);

      if (layerEntries.length === 0) {
        return;
      }

      const startPoint = this.sceneController.localPoint(initialEvent);

      // Select the clicked point
      this.sceneController.selection = new Set([
        `skeletonPoint/${skeletonHit.contourIndex}/${skeletonHit.pointIndex}`,
      ]);

      if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
        // Just a click - selection is set, nothing else to do
        return;
      }

      // Drag the point
      for await (const event of eventStream) {
        const currentPoint = this.sceneController.localPoint(event);
        let delta = vector.subVectors(currentPoint, startPoint);

        // Apply shift constraint if needed
        if (event.shiftKey) {
          delta = constrainHorVerDiag(delta);
        }

        const layerChanges = [];

        for (const [layerName, layerGlyph] of layerEntries) {
          const layerChange = recordChanges(layerGlyph, (lg) => {
            const layerSkeletonData = lg.customData?.[SKELETON_CUSTOM_DATA_KEY];
            if (!layerSkeletonData) return;

            const contour = layerSkeletonData.contours[skeletonHit.contourIndex];
            if (!contour) return;

            const point = contour.points[skeletonHit.pointIndex];
            if (!point) return;

            // Update point position
            point.x = Math.round(skeletonHit.point.x + delta.x);
            point.y = Math.round(skeletonHit.point.y + delta.y);

            // Regenerate outline contours
            this._regenerateOutlineContours(lg, layerSkeletonData);
          });

          layerChanges.push(layerChange.prefixed(["layers", layerName, "glyph"]));
        }

        const changes = new ChangeCollector().concat(...layerChanges);
        await sendIncrementalChange(changes.change, true); // true = may drop
      }

      // Final change after drag ends
      const finalLayerChanges = [];

      for (const [layerName, layerGlyph] of layerEntries) {
        const layerChange = recordChanges(layerGlyph, (lg) => {
          const layerSkeletonData = lg.customData?.[SKELETON_CUSTOM_DATA_KEY];
          if (layerSkeletonData) {
            this._regenerateOutlineContours(lg, layerSkeletonData);
          }
        });
        finalLayerChanges.push(layerChange.prefixed(["layers", layerName, "glyph"]));
      }

      const finalChanges = new ChangeCollector().concat(...finalLayerChanges);

      return {
        changes: finalChanges,
        undoLabel: "Move skeleton point",
      };
    });
  }

  _regenerateOutlineContours(layerGlyph, skeletonData) {
    // Get indices of previously generated contours
    const oldGeneratedIndices = skeletonData.generatedContourIndices || [];

    // Remove old generated contours (in reverse order to maintain indices)
    const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      if (idx < layerGlyph.path.numContours) {
        layerGlyph.path.deleteContour(idx);
      }
    }

    // Generate new contours from skeleton
    const generatedContours = generateContoursFromSkeleton(skeletonData);

    // Add new contours and track their indices
    const newGeneratedIndices = [];
    for (const contour of generatedContours) {
      const newIndex = layerGlyph.path.numContours;
      layerGlyph.path.appendUnpackedContour(contour);
      newGeneratedIndices.push(newIndex);
    }

    // Update generated contour indices
    skeletonData.generatedContourIndices = newGeneratedIndices;
  }
}

/**
 * Parse skeletonPoint selection entries.
 * Format: "skeletonPoint/contourIndex/pointIndex"
 */
export function parseSkeletonSelection(selection) {
  const result = {
    skeletonPoint: new Set(),
    skeletonHandle: new Set(),
  };

  if (!selection) return result;

  for (const item of selection) {
    if (item.startsWith("skeletonPoint/")) {
      const parts = item.split("/");
      if (parts.length === 3) {
        result.skeletonPoint.add(`${parts[1]}/${parts[2]}`);
      }
    } else if (item.startsWith("skeletonHandle/")) {
      const parts = item.split("/");
      if (parts.length === 4) {
        result.skeletonHandle.add(`${parts[1]}/${parts[2]}/${parts[3]}`);
      }
    }
  }

  return result;
}
