import { BaseTool } from "./edit-tools-base.js";
import { TunniEditingTool } from "./tunni-editing-tool.js";

export class TunniTool extends BaseTool {
  iconPath = "/tabler-icons/shape.svg";
  identifier = "tunni-tool";

  constructor(editor) {
    super(editor);
    this.tunniEditingTool = new TunniEditingTool(this.sceneController);
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "crosshair";
  }

  handleHover(event) {
    // Handle hover events if needed
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    // Handle the initial mouse down event
    this.tunniEditingTool.handleMouseDown(initialEvent);

    // Process the drag events
    for await (const event of eventStream) {
      if (event.type === "mouseup") {
        // Handle mouse up event
        this.tunniEditingTool.handleMouseUp(event);
        break;
      } else {
        // Handle mouse drag events
        this.tunniEditingTool.handleMouseDrag(event);
      }
    }
  }
}