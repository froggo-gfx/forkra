/**
 * Layer 2: Data Adapters
 * Provides POINTER_OBJECTS registry and data adapter classes.
 */

import {
  EditBehaviorFactory,
  SkeletonEditBehavior,
  RibEditBehavior,
  EditableRibBehavior,
  InterpolatingRibBehavior,
  EditableHandleBehavior,
  createHandleEqualizeExecutor,
  resolveHandleEqualizePlan,
} from "./edit-behavior.js";
import {
  getSkeletonData,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import { enumerate } from "@fontra/core/utils.js";
import {
  skeletonTunniHitTest,
  buildSegmentsFromSkeletonPoints,
} from "@fontra/core/tunni-core.js";

const DEFAULT_SKELETON_WIDTH = 80;

function projectRibPoint(skeletonPoint, normal, halfWidth, side, nudge = 0) {
  const sign = side === "left" ? 1 : -1;
  return {
    x: skeletonPoint.x + sign * (halfWidth + nudge) * normal.x,
    y: skeletonPoint.y + sign * (halfWidth + nudge) * normal.y,
  };
}

function getRibNudgeKey(side) {
  return side === "left" ? "leftNudge" : "rightNudge";
}

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Registry of object kinds with their capabilities.
 * Each entry provides: hitTest, adapter factory, nudge capability.
 */
export const POINTER_OBJECTS = {
  regularPoint: {
    objectKind: "regularPoint",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const localPoint = {
        x: glyphPoint.x + positionedGlyph.x,
        y: glyphPoint.y + positionedGlyph.y,
      };
      
      const hit = positionedGlyph.glyph.path.hitTestPoint(localPoint);
      if (!hit) return null;
      
      return {
        type: "regularPoint",
        contourIndex: hit.contourIndex,
        pointIndex: hit.pointIndex,
        point: hit,
      };
    },

    getAdapter(context) {
      const { glyph, selection } = context;
      return new RegularPointAdapter(glyph, selection);
    },

    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },

  skeletonPoint: {
    objectKind: "skeletonPoint",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData) return null;

      const margin = sceneController.mouseClickMargin;

      for (const [contourIndex, contour] of enumerate(skeletonData.contours)) {
        for (const [pointIndex, point] of enumerate(contour.points)) {
          // Only on-curve points (no type property)
          if (point.type) continue;
          
          const dist = Math.hypot(point.x - glyphPoint.x, point.y - glyphPoint.y);
          if (dist <= margin) {
            return {
              type: "skeletonPoint",
              contourIndex,
              pointIndex,
              point,
            };
          }
        }
      }
      return null;
    },

    getAdapter(context) {
      const { glyph, selection } = context;
      const skeletonData = getSkeletonData(glyph);
      return new SkeletonPointAdapter(skeletonData, selection);
    },

    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },

  skeletonHandle: {
    objectKind: "skeletonHandle",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData) return null;

      const margin = sceneController.mouseClickMargin;

      for (const [contourIndex, contour] of enumerate(skeletonData.contours)) {
        for (const [pointIndex, point] of enumerate(contour.points)) {
          // Only off-curve (cubic) points
          if (point.type !== "cubic") continue;
          
          const dist = Math.hypot(point.x - glyphPoint.x, point.y - glyphPoint.y);
          if (dist <= margin) {
            return {
              type: "skeletonHandle",
              contourIndex,
              pointIndex,
              point,
            };
          }
        }
      }
      return null;
    },

    getAdapter(context) {
      const { glyph, selection, hit } = context;
      const skeletonData = getSkeletonData(glyph);
      return new SkeletonHandleAdapter(skeletonData, selection, hit);
    },

    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },

  ribPoint: {
    objectKind: "ribPoint",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData?.contours?.length) return null;

      const margin = sceneController.mouseClickMargin;

      for (const [contourIndex, contour] of enumerate(skeletonData.contours)) {
        const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;

        for (const [pointIndex, skeletonPoint] of enumerate(contour.points)) {
          // Only on-curve points
          if (skeletonPoint.type) continue;

          const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
          const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
          const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");

          const isLeftEditable = skeletonPoint.leftEditable === true;
          const isRightEditable = skeletonPoint.rightEditable === true;

          const leftNudgeKey = getRibNudgeKey("left");
          const rightNudgeKey = getRibNudgeKey("right");
          const leftNudge = (isLeftEditable && leftHW >= 0.5) ? (skeletonPoint[leftNudgeKey] || 0) : 0;
          const rightNudge = (isRightEditable && rightHW >= 0.5) ? (skeletonPoint[rightNudgeKey] || 0) : 0;

          const singleSided = contour.singleSided ?? false;
          const singleSidedDirection = contour.singleSidedDirection ?? "left";

          if (singleSided) {
            const totalWidth = leftHW + rightHW;
            const side = singleSidedDirection;
            const nudge = (isLeftEditable && totalWidth >= 0.5) ? (skeletonPoint[getRibNudgeKey(side)] || 0) : 0;
            const ribPoint = projectRibPoint(skeletonPoint, normal, totalWidth, side, nudge);
            const dist = vector.distance(glyphPoint, ribPoint);
            if (dist <= margin) {
              return {
                type: "ribPoint",
                contourIndex,
                pointIndex,
                side,
                point: ribPoint,
                normal,
                onCurvePoint: skeletonPoint,
                isEditable: isLeftEditable,
              };
            }
          } else {
            // Left side
            const leftRibPoint = projectRibPoint(skeletonPoint, normal, leftHW, "left", leftNudge);
            const leftDist = vector.distance(glyphPoint, leftRibPoint);
            if (leftDist <= margin && isLeftEditable) {
              return {
                type: "ribPoint",
                contourIndex,
                pointIndex,
                side: "left",
                point: leftRibPoint,
                normal,
                onCurvePoint: skeletonPoint,
                isEditable: true,
              };
            }

            // Right side
            const rightRibPoint = projectRibPoint(skeletonPoint, normal, rightHW, "right", rightNudge);
            const rightDist = vector.distance(glyphPoint, rightRibPoint);
            if (rightDist <= margin && isRightEditable) {
              return {
                type: "ribPoint",
                contourIndex,
                pointIndex,
                side: "right",
                point: rightRibPoint,
                normal,
                onCurvePoint: skeletonPoint,
                isEditable: true,
              };
            }
          }
        }
      }
      return null;
    },

    getAdapter(context) {
      const { glyph, hit } = context;
      const skeletonData = getSkeletonData(glyph);
      
      if (hit?.isEditable) {
        return new EditableRibPointAdapter(skeletonData, hit);
      }
      return new RibPointAdapter(skeletonData, hit);
    },

    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },

  ribHandle: {
    objectKind: "ribHandle",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData?.contours?.length) return null;

      const margin = sceneController.mouseClickMargin;

      for (const [contourIndex, contour] of enumerate(skeletonData.contours)) {
        for (const [pointIndex, point] of enumerate(contour.points)) {
          // Only off-curve (cubic) points
          if (point.type !== "cubic") continue;
          
          const dist = Math.hypot(point.x - glyphPoint.x, point.y - glyphPoint.y);
          if (dist <= margin) {
            return {
              type: "ribHandle",
              contourIndex,
              pointIndex,
              point,
            };
          }
        }
      }
      return null;
    },

    getAdapter(context) {
      const { glyph, hit } = context;
      const skeletonData = getSkeletonData(glyph);
      return new RibHandleAdapter(skeletonData, hit);
    },

    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },

  tunniMidpoint: {
    objectKind: "tunniMidpoint",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData?.contours?.length) return null;

      // Use existing skeletonTunniHitTest for midpoint detection
      const size = 10; // Hit test margin
      const tunniHit = skeletonTunniHitTest(glyphPoint, size, skeletonData);
      
      if (tunniHit) {
        return {
          type: "tunniMidpoint",
          ...tunniHit,
        };
      }
      return null;
    },

    getAdapter(context) {
      const { glyph, hit } = context;
      return new TunniMidpointAdapter(glyph, hit);
    },

    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },

  measureTarget: {
    objectKind: "measureTarget",

    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData?.contours?.length) return null;

      const segments = buildSegmentsFromSkeletonPoints(skeletonData);
      const margin = sceneController.mouseClickMargin;

      for (const segment of segments) {
        const dist = pointToSegmentDistance(glyphPoint, segment.p1, segment.p2);
        if (dist <= margin) {
          return { type: "measureTarget", segment };
        }
      }
      return null;
    },

    hover(context, hit, event) {
      // Update measure hover state in scene-model
      const { sceneModel } = context;
      if (sceneModel) {
        sceneModel.measureHoverSegment = hit?.segment || null;
      }
    },
  },
};

class RegularPointAdapter {
  constructor(glyph, selection) {
    this.glyph = glyph;
    this.selection = selection;
    this.factory = new EditBehaviorFactory(glyph, selection);
    // Track current behavior name for proper rollback capture
    this.currentBehaviorName = "default";
  }

  applyBehavior(behaviorDef, delta, context) {
    // Track the behavior being used for proper rollback
    this.currentBehaviorName = behaviorDef.presetName;
    const behavior = this.factory.getBehavior(behaviorDef.presetName);
    return behavior.makeChangeForDelta(delta);
  }

  applyNudge(delta, context) {
    // Get behavior name from context (passed by composer)
    // For nudge, the behavior is determined by modifiers at the pointer level
    const behaviorName = context?.behaviorName || "default";
    this.currentBehaviorName = behaviorName;
    const behavior = this.factory.getBehavior(behaviorName);
    return behavior.makeChangeForDelta(delta);
  }

  getRollback() {
    // Get rollback from the actual behavior being used, not just "default"
    const behavior = this.factory.getBehavior(this.currentBehaviorName);
    return behavior?.rollbackChange || [];
  }
}

class SkeletonPointAdapter {
  constructor(skeletonData, selection) {
    this.skeletonData = skeletonData;
    this.selection = selection;
    this.currentBehaviorName = "default";
    // Capture initial state for rollback
    this.initialSkeletonData = JSON.parse(JSON.stringify(skeletonData));
  }

  _createBehavior(preset, roundFunc) {
    const ci = Array.from(this.selection)[0] || 0;
    return new SkeletonEditBehavior(
      this.skeletonData,
      ci,
      Array.from(this.selection),
      preset,
      false,
      roundFunc
    );
  }

  applyBehavior(behaviorDef, delta, context) {
    this.currentBehaviorName = behaviorDef.presetName;
    const behavior = this._createBehavior(behaviorDef.presetName, context.roundFunc);
    return behavior.applyDelta(delta);
  }

  applyNudge(delta, context) {
    const behaviorName = context?.behaviorName || "default";
    this.currentBehaviorName = behaviorName;
    const behavior = this._createBehavior(behaviorName, context.roundFunc);
    return behavior.applyDelta(delta);
  }

  getRollback() {
    // Build rollback from initial state to current state
    const rollbackChanges = [];
    const currentContours = this.skeletonData.contours;
    const initialContours = this.initialSkeletonData.contours;

    for (let ci = 0; ci < initialContours.length; ci++) {
      const initialContour = initialContours[ci];
      for (let pi = 0; pi < initialContour.points.length; pi++) {
        const initialPt = initialContour.points[pi];
        const currentPt = currentContours[ci]?.points[pi];
        if (currentPt && (currentPt.x !== initialPt.x || currentPt.y !== initialPt.y)) {
          rollbackChanges.push({
            path: ["contours", ci, "points", pi],
            op: "=",
            value: { x: initialPt.x, y: initialPt.y, type: initialPt.type }
          });
        }
      }
    }
    return rollbackChanges;
  }
}

class SkeletonHandleAdapter {
  constructor(skeletonData, selection, hit) {
    this.skeletonData = skeletonData;
    this.selection = selection;
    this.hit = hit;
  }
  applyBehavior(behaviorDef, delta, context) {
    if (behaviorDef.presetName === "equalize") {
      const { contourIndex, pointIndex } = this.hit;
      const contour = this.skeletonData.contours[contourIndex];
      const eq = this._getHandleEqualizeInfo(contour, pointIndex);
      if (!eq) return null;
      const plan = resolveHandleEqualizePlan("skeleton", "nudge", { x: context.event?.shiftKey });
      const { executor } = createHandleEqualizeExecutor(plan);
      if (!executor) return null;
      const sp = contour.points[eq.smoothIndex];
      return executor.applyDrag({ smoothPoint: sp, cursorPoint: { x: sp.x + delta.x, y: sp.y + delta.y }, constrainDiagonal: context.event?.shiftKey, roundFunc: context.roundFunc });
    }
    return this._applyDefaultHandleBehavior(delta, context);
  }
  _getHandleEqualizeInfo(contour, handleIndex) {
    const pts = contour.points;
    for (let i = 0; i < pts.length; i++) {
      if (!pts[i].type) {
        const prev = (i - 1 + pts.length) % pts.length, next = (i + 1) % pts.length;
        if (prev === handleIndex && pts[next]?.type === "cubic") return { smoothIndex: i, oppositeIndex: next };
        if (next === handleIndex && pts[prev]?.type === "cubic") return { smoothIndex: i, oppositeIndex: prev };
      }
    }
    return null;
  }
  _applyDefaultHandleBehavior(delta, context) {
    const { roundFunc, editLayerName } = context;
    const { contourIndex, pointIndex } = this.hit;
    const pt = this.skeletonData.contours[contourIndex].points[pointIndex];
    const rf = roundFunc || (v => v);
    return { changes: [{ path: ["layers", editLayerName, "glyph", "skeletonData", "contours", contourIndex, "points", pointIndex], op: "=", value: { ...pt, x: rf(pt.x + delta.x), y: rf(pt.y + delta.y) } }] };
  }
  applyNudge(delta, context) { return this._applyDefaultHandleBehavior(delta, context); }
  getRollback() { return []; }
}

class RibPointAdapter {
  constructor(skeletonData, hit) { this.skeletonData = skeletonData; this.hit = hit; }
  applyBehavior(behaviorDef, delta, context) { return this._applyRibNudge(delta, context); }
  _applyRibNudge(delta, context) {
    const { contourIndex, pointIndex, side } = this.hit;
    const nk = getRibNudgeKey(side);
    const cn = this.skeletonData.contours[contourIndex].points[pointIndex][nk] || 0;
    return { changes: [{ path: ["layers", context.editLayerName, "glyph", "skeletonData", "contours", contourIndex, "points", pointIndex, nk], op: "=", value: cn + (side === "left" ? delta.x : -delta.x) }] };
  }
  applyNudge(delta, context) { return this._applyRibNudge(delta, context); }
  getRollback() { return []; }
}

class EditableRibPointAdapter {
  constructor(skeletonData, hit) { this.skeletonData = skeletonData; this.hit = hit; }
  _createBehavior(preset, rf) {
    const { contourIndex, pointIndex, side } = this.hit;
    return new EditableRibBehavior(this.skeletonData, contourIndex, pointIndex, side, preset, rf);
  }
  applyBehavior(behaviorDef, delta, context) { return this._createBehavior(behaviorDef.presetName, context.roundFunc).applyDelta(delta); }
  applyNudge(delta, context) { return this._createBehavior("default", context.roundFunc).applyDelta(delta); }
  getRollback() { return []; }
}

class RibHandleAdapter {
  constructor(skeletonData, hit) { this.skeletonData = skeletonData; this.hit = hit; }
  applyBehavior(behaviorDef, delta, context) {
    const { roundFunc } = context;
    const { contourIndex, pointIndex } = this.hit;
    return new EditableHandleBehavior(this.skeletonData, contourIndex, pointIndex, roundFunc).applyDelta(delta);
  }
  applyNudge(delta, context) {
    const { roundFunc } = context;
    const { contourIndex, pointIndex } = this.hit;
    return new EditableHandleBehavior(this.skeletonData, contourIndex, pointIndex, roundFunc).applyDelta(delta);
  }
  getRollback() { return []; }
}

class TunniMidpointAdapter {
  constructor(glyph, hit) { this.glyph = glyph; this.hit = hit; }
  applyBehavior(behaviorDef, delta, context) {
    const { contourIndex, segmentIndex } = this.hit;
    const sd = getSkeletonData(this.glyph);
    if (!sd) return null;
    const seg = buildSegmentsFromSkeletonPoints(sd)[segmentIndex];
    return { tunniPoint: { x: seg.p1.x + (seg.p2.x - seg.p1.x) / 2 + delta.x, y: seg.p1.y + (seg.p2.y - seg.p1.y) / 2 + delta.y }, contourIndex, segmentIndex };
  }
  applyNudge(delta, context) { return this.applyBehavior({ presetName: "default" }, delta, context); }
  getRollback() { return []; }
}

export function getDataAdapterFactory(objectKind) {
  const obj = POINTER_OBJECTS[objectKind];
  if (!obj) throw new Error(`Unknown object kind: ${objectKind}`);
  return obj.getAdapter.bind(obj);
}
