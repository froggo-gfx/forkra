import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, consolidateChanges, applyChange } from "@fontra/core/changes.js";
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

  /**
   * Get the positioned glyph adjusted point from a mouse event
   */
  _getGlyphPoint(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return null;

    const localPoint = this.sceneController.localPoint(event);
    return {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };
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

    // Get the editing layer name
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) {
      return null;
    }

    const layer = varGlyph.glyph.layers[editLayerName];
    if (!layer) {
      return null;
    }

    const skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData?.contours?.length) {
      return null;
    }

    const glyphPoint = this._getGlyphPoint(event);
    if (!glyphPoint) return null;

    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];
        const dist = vector.distance(glyphPoint, skeletonPoint);
        if (dist <= margin) {
          return { contourIndex, pointIndex, point: { ...skeletonPoint } };
        }
      }
    }

    return null;
  }

  async _handleAddSkeletonPoint(eventStream, initialEvent) {
    const glyphPoint = this._getGlyphPoint(initialEvent);
    if (!glyphPoint) return;

    const newPoint = {
      x: Math.round(glyphPoint.x),
      y: Math.round(glyphPoint.y),
      type: null,
      smooth: true,
    };

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      // Get current skeleton data from layer
      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) {
        skeletonData = createEmptySkeletonData();
      } else {
        skeletonData = JSON.parse(JSON.stringify(skeletonData));
      }

      // Determine which contour to add to based on selection
      const { skeletonPoint: selectedSkeletonPoints } = parseSelection(
        this.sceneController.selection
      );

      let targetContourIndex = -1;
      let insertAtEnd = true;

      if (selectedSkeletonPoints?.size === 1) {
        const selectedKey = [...selectedSkeletonPoints][0];
        const [contourIdx, pointIdx] = selectedKey.split("/").map(Number);

        if (contourIdx < skeletonData.contours.length) {
          targetContourIndex = contourIdx;
          const contour = skeletonData.contours[targetContourIndex];
          if (contour && !contour.isClosed) {
            insertAtEnd = pointIdx === contour.points.length - 1;
          }
        }
      }

      // Add point to skeleton
      if (targetContourIndex >= 0 && targetContourIndex < skeletonData.contours.length) {
        const contour = skeletonData.contours[targetContourIndex];
        if (insertAtEnd) {
          contour.points.push({ ...newPoint });
        } else {
          contour.points.unshift({ ...newPoint });
        }
      } else {
        // Create new contour
        const newContour = createSkeletonContour(false);
        newContour.points.push({ ...newPoint });
        skeletonData.contours.push(newContour);
        targetContourIndex = skeletonData.contours.length - 1;
      }

      // Record changes to both customData and path
      const changes = [];

      // Change 1: Update skeleton data in layer.customData
      const customDataChange = recordChanges(layer, (l) => {
        if (!l.customData) {
          l.customData = {};
        }
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", editLayerName]));

      // Change 2: Regenerate path contours from skeleton
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

      const combinedChange = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combinedChange.change);

      // Update selection
      const contour = skeletonData.contours[targetContourIndex];
      const newPointIndex = insertAtEnd ? contour.points.length - 1 : 0;
      this.sceneController.selection = new Set([
        `skeletonPoint/${targetContourIndex}/${newPointIndex}`,
      ]);

      return {
        changes: combinedChange,
        undoLabel: "Add skeleton point",
      };
    });
  }

  async _handleDragSkeletonPoint(eventStream, initialEvent, skeletonHit) {
    const startGlyphPoint = this._getGlyphPoint(initialEvent);
    if (!startGlyphPoint) return;

    // Select the clicked point
    this.sceneController.selection = new Set([
      `skeletonPoint/${skeletonHit.contourIndex}/${skeletonHit.pointIndex}`,
    ]);

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      return;
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) return;

      // Deep clone for manipulation
      skeletonData = JSON.parse(JSON.stringify(skeletonData));

      const originalPoint = { ...skeletonHit.point };

      for await (const event of eventStream) {
        const currentGlyphPoint = this._getGlyphPoint(event);
        if (!currentGlyphPoint) continue;

        let delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

        if (event.shiftKey) {
          delta = constrainHorVerDiag(delta);
        }

        // Update skeleton point position
        const contour = skeletonData.contours[skeletonHit.contourIndex];
        if (!contour) continue;

        const point = contour.points[skeletonHit.pointIndex];
        if (!point) continue;

        point.x = Math.round(originalPoint.x + delta.x);
        point.y = Math.round(originalPoint.y + delta.y);

        // Record changes
        const changes = [];

        // Update customData
        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(skeletonData));
        });
        changes.push(customDataChange.prefixed(["layers", editLayerName]));

        // Regenerate path
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const combinedChange = new ChangeCollector().concat(...changes);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final change
      const finalChanges = [];

      const finalCustomDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      finalChanges.push(finalCustomDataChange.prefixed(["layers", editLayerName]));

      const staticGlyph = layer.glyph;
      const finalPathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      finalChanges.push(finalPathChange.prefixed(["layers", editLayerName, "glyph"]));

      const finalCombinedChange = new ChangeCollector().concat(...finalChanges);

      return {
        changes: finalCombinedChange,
        undoLabel: "Move skeleton point",
      };
    });
  }

  _regenerateOutlineContours(staticGlyph, skeletonData) {
    // Get indices of previously generated contours
    const oldGeneratedIndices = skeletonData.generatedContourIndices || [];

    // Remove old generated contours (in reverse order to maintain indices)
    const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      if (idx < staticGlyph.path.numContours) {
        staticGlyph.path.deleteContour(idx);
      }
    }

    // Generate new contours from skeleton
    const generatedContours = generateContoursFromSkeleton(skeletonData);

    // Add new contours and track their indices
    const newGeneratedIndices = [];
    for (const contour of generatedContours) {
      const newIndex = staticGlyph.path.numContours;
      staticGlyph.path.appendUnpackedContour(contour);
      newGeneratedIndices.push(newIndex);
    }

    // Update generated contour indices
    skeletonData.generatedContourIndices = newGeneratedIndices;
  }
}
