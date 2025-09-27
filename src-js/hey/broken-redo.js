/*  edit-tools-tunni.js  –  full, single-undo-item version  */
import { BaseTool } from "./edit-tools-base.js";
import {
  calculateTunniPoint,
  calculateControlPointsFromTunni,
  calculateEqualizedControlPoints,
  areDistancesEqualized,
} from "@fontra/core/tunni-calculations.js";
import {
  distance,
  subVectors,
  dotVector,
  vectorLength,
} from "@fontra/core/vector.js";

/* ------------------------------------------------------------------ */
/*  1.  Tool front-end (exactly the same public API)                  */
/* ------------------------------------------------------------------ */
export class TunniTool extends BaseTool {
  iconPath = "/images/tunni.svg";
  identifier = "tunni-tool";

  activate() {
    super.activate();
    this.editor.visualizationLayersSettings.model["fontra.tunni.lines"] = true;
  }

  deactivate() {
    super.deactivate();
    this.editor.visualizationLayersSettings.model["fontra.tunni.lines"] = false;
    this.sceneController.tunniEditingTool.cleanUp();
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "crosshair";
  }

  handleHover(event) {
    const point = this.sceneController.localPoint(event);
    const size  = this.sceneController.mouseClickMargin;
    const hit   = this.sceneController.tunniEditingTool.findTunniPointHit(point, size);

    this.canvasController.canvas.style.cursor = hit ? "pointer" : "crosshair";
  }

  /* --------------  single gesture – single undo item  -------------- */
  async handleDrag(eventStream, initialEvent) {
    if (!this.isActive) return;

    const tool = this.sceneController.tunniEditingTool;

    /*  Ctrl-Shift equalize is a standalone undo item  */
    if (initialEvent.ctrlKey && initialEvent.shiftKey) {
      await tool.handleEqualizeDistances(initialEvent);
      return;
    }

    /*  one atomic undo item for the whole drag  */
    await this.sceneController.editLayersAndRecordChanges(
      async (layerGlyphs) => {
        const hit = tool.hitTest(initialEvent);
        if (!hit) return "Move Tunni Point";

        tool.startGesture(hit, layerGlyphs);

        for await (const ev of eventStream) {
          if (ev.type === "mouseup") break;
          if (ev.type === "mousemove") tool.drag(ev, layerGlyphs);
        }
        tool.finalise(layerGlyphs);
        return "Move Tunni Point";
      }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  2.  TunniEditingTool – every helper from the original file        */
/* ------------------------------------------------------------------ */
export class TunniEditingTool {
  constructor(sceneController) {
    this.sceneController = sceneController;
    this.sceneModel      = sceneController.sceneModel;
  }

  /*  geometric hit test  */
  findTunniPointHit(canvasPoint, size) {
    const pos = this.sceneModel.getSelectedPositionedGlyph();
    if (!pos) return null;

    const gPt  = { x: canvasPoint.x - pos.x, y: canvasPoint.y - pos.y };
    const path = pos.glyph.path;

    for (let c = 0; c < path.numContours; c++) {
      for (const seg of path.iterContourDecomposedSegments(c)) {
        if (seg.points.length !== 4) continue;
        const types = seg.parentPointIndices.map(i => path.pointTypes[i]);
        if (types[1] !== 2 || types[2] !== 2) continue;

        const tp = calculateTunniPoint(seg.points);
        if (tp && distance(gPt, tp) <= size)
          return { seg, segPts: seg.points, idx1: seg.parentPointIndices[1], idx2: seg.parentPointIndices[2] };
      }
    }
    return null;
  }

  hitTest(event) {
    const pt = this.sceneController.localPoint(event);
    const sz = this.sceneController.mouseClickMargin;
    return this.findTunniPointHit(pt, sz);
  }

  /*  Ctrl-Shift equalize  */
  async handleEqualizeDistances(event) {
    const hit = this.hitTest(event);
    if (!hit) return;
    if (areDistancesEqualized(hit.segPts)) return;

    await this.sceneController.editLayersAndRecordChanges(layerGlyphs => {
      const newCPs = calculateEqualizedControlPoints(hit.segPts);
      for (const lg of Object.values(layerGlyphs)) {
        lg.path.setPointPosition(hit.idx1, newCPs[0].x, newCPs[0].y);
        lg.path.setPointPosition(hit.idx2, newCPs[1].x, newCPs[1].y);
      }
      return "Equalize Control Point Distances";
    });
  }

  /*  drag gesture helpers  */
  startGesture(hit, layerGlyphs) {
    this.hit = hit;
    const [p1, p2, p3, p4] = hit.segPts;
    this.p1 = p1; this.p2 = p2; this.p3 = p3; this.p4 = p4;

    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p4.x, y: p3.y - p4.y };
    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;

    this.u1 = { x: v1.x / l1, y: v1.y / l1 };
    this.u2 = { x: v2.x / l2, y: v2.y / l2 };

    const u45 = { x: (this.u1.x + this.u2.x) / 2, y: (this.u1.y + this.u2.y) / 2 };
    const l45 = Math.hypot(u45.x, u45.y) || 1;
    this.u45 = { x: u45.x / l45, y: u45.y / l45 };

    this.startCanvas = this.sceneController.localPoint({});
  }

  drag(event, layerGlyphs) {
    const evPt  = this.sceneController.localPoint(event);
    const delta = { x: evPt.x - this.startCanvas.x, y: evPt.y - this.startCanvas.y };

    const equalize = !event.altKey;
    let n2, n3;

    if (equalize) {
      const proj = delta.x * this.u45.x + delta.y * this.u45.y;
      n2 = { x: this.p2.x + this.u1.x * proj, y: this.p2.y + this.u1.y * proj };
      n3 = { x: this.p3.x + this.u2.x * proj, y: this.p3.y + this.u2.y * proj };
    } else {
      const proj1 = delta.x * this.u1.x + delta.y * this.u1.y;
      const proj2 = delta.x * this.u2.x + delta.y * this.u2.y;
      n2 = { x: this.p2.x + this.u1.x * proj1, y: this.p2.y + this.u1.y * proj1 };
      n3 = { x: this.p3.x + this.u2.x * proj2, y: this.p3.y + this.u2.y * proj2 };
    }

    for (const lg of Object.values(layerGlyphs)) {
      lg.path.setPointPosition(this.hit.idx1, n2.x, n2.y);
      lg.path.setPointPosition(this.hit.idx2, n3.x, n3.y);
    }
  }

  finalise(layerGlyphs) { /*  all changes already applied  */ }

  cleanUp() { /*  no persistent state  */ }
}