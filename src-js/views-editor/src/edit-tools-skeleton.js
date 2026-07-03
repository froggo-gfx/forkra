import { getSkeletonData } from "@fontra/core/skeleton-model.js";
import { parseSelection } from "@fontra/core/utils.ts";
import { BaseTool } from "./edit-tools-base.js";
import { makeSkeletonPointKey, parseSkeletonPointKey } from "./skeleton-editing.js";

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
    eventStream.done();
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
