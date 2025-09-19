import { BaseTool } from "./edit-tools-base.js";

// TunniTool is a specialized editing tool for manipulating cubic Bézier curves
// using the Tunni construction method. It allows users to directly manipulate
// the Tunni point (the intersection of the lines connecting the start/end points
// with their respective control points) to adjust the curve shape.
export class TunniTool extends BaseTool {
  iconPath = "/tabler-icons/shape.svg";
  identifier = "tunni-tool";

  activate() {
    super.activate();
    // Activate the Tunni visualization layer
    this.editor.visualizationLayersSettings.model["fontra.tunni.lines"] = true;
  }

  deactivate() {
    super.deactivate();
    // Deactivate the Tunni visualization layer
    this.editor.visualizationLayersSettings.model["fontra.tunni.lines"] = false;
    // Clean up any tool-specific state
    this.sceneController.tunniEditingTool.handleMouseUp({});
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "crosshair";
  }

  handleHover(event) {
    // Check if we're hovering over a Tunni point
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    const hit = this.sceneController.tunniEditingTool.findTunniPointHit(point, size);
    
    if (hit) {
      // If we're hovering over a Tunni point, change the cursor
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      // Otherwise, use the default crosshair cursor
      this.setCursor();
    }
  }

  async handleDrag(eventStream, initialEvent) {
    // Check if the tool is active before processing events
    if (!this.isActive) {
      return;
    }
    
    // Handle the initial mouse down event
    this.sceneController.tunniEditingTool.handleMouseDown(initialEvent);

    // Process the drag events
    for await (const event of eventStream) {
      if (event.type === "mouseup") {
        // Handle mouse up event
        this.sceneController.tunniEditingTool.handleMouseUp(event);
        break;
      } else if (event.type === "mousemove") {
        // Handle mouse drag events
        try {
          await this.sceneController.tunniEditingTool.handleMouseDrag(event);
        } catch (error) {
          console.error("Error handling mouse drag event:", error);
        }
      }
    }
  }
}