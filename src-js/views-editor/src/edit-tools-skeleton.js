import { BaseTool } from "./edit-tools-base.js";

export class SkeletonPenTool extends BaseTool {
  iconPath = "/images/skeleton-pen.svg";
  identifier = "skeleton-pen-tool";

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
