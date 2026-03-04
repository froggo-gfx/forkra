import { consolidateChanges } from "@fontra/core/changes.js";
import { polygonIsConvex } from "@fontra/core/convex-hull.js";
import {
  Transform,
  decomposedToTransform,
  prependTransformToDecomposed,
} from "@fontra/core/transform.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import {
  assert,
  enumerate,
  parseSelection,
  reversed,
  unionIndexSets,
} from "@fontra/core/utils.js";
import { copyBackgroundImage, copyComponent } from "@fontra/core/var-glyph.js";
import * as vector from "@fontra/core/vector.js";
import {
  ANY,
  NIL,
  OFF,
  SEL,
  SHA,
  SMO,
  UNS,
  buildPointMatchTree,
  findPointMatch,
} from "./edit-behavior-support.js";

export { ANY, NIL, OFF, SEL, SHA, SMO, UNS };

//// grid
let magneticSnapEnabled = false;
export function toggleMagneticSnap() {
      magneticSnapEnabled = !magneticSnapEnabled;
      console.log("Magnetic snap", magneticSnapEnabled ? "ON" : "OFF");
    }

function roundWithSnapRules(value, event = null, isArrowKey = false) {
  const coarseUnit = window.coarseGridSpacing || 1;
  const ctrlLikePressed =
    !!event?.ctrlKey || !!event?.metaKey || !!window.event?.ctrlKey || !!window.event?.metaKey;

  // 1. Ctrl / Cmd => always coarse grid
  if (ctrlLikePressed) {
    return Math.round(value / coarseUnit) * coarseUnit;
  }

  // 2. Arrow keys => ignore magnetic & coarse, use 1-unit steps
  if (isArrowKey) {
    return Math.round(value);
  }

  // 3. Magnetic snap only when explicitly enabled
  if (!magneticSnapEnabled || coarseUnit <= 1) {
    return Math.round(value);
  }

  const coarse = Math.round(value / coarseUnit) * coarseUnit;
  return Math.abs(value - coarse) <= coarseUnit * 0.35 ? coarse : Math.round(value);
}

export function makeRoundFunc(event = null) {
  return (value, isArrowKey = false) => roundWithSnapRules(value, event, isArrowKey);
}

export class EditBehaviorFactory {
  constructor(instance, selection, enableScalingEdit = false) {
    const {
      point: pointSelection,
      component: componentSelection,
      anchor: anchorSelection,
      guideline: guidelineSelection,
      componentOrigin: componentOriginSelection,
      componentTCenter: componentTCenterSelection,
      backgroundImage: backgroundImageSelection,
    } = parseSelection(selection);
    const componentOriginIndices = unionIndexSets(
      componentSelection,
      componentOriginSelection
    );
    const relevantComponentIndices = unionIndexSets(
      componentSelection,
      componentOriginSelection,
      componentTCenterSelection
    );
    this.contours = unpackContours(instance.path, pointSelection || []);
    this.components = unpackComponents(instance.components, relevantComponentIndices);
    this.anchors = unpackAnchors(instance.anchors, anchorSelection || []);
    this.guidelines = unpackGuidelines(instance.guidelines, guidelineSelection || []);
    this.backgroundImage = backgroundImageSelection
      ? copyBackgroundImage(instance.backgroundImage)
      : undefined;
    this.componentOriginIndices = componentOriginIndices || [];
    this.componentTCenterIndices = componentTCenterSelection || [];
    this.behaviors = {};
    this.enableScalingEdit = enableScalingEdit;
  }

  getBehavior(behaviorName) {
    return this._getBehavior(behaviorName);
  }

  getTransformBehavior(behaviorName) {
    return this._getBehavior(behaviorName, true);
  }

  _getBehavior(behaviorName, doFullTransform = false) {
    let behavior = this.behaviors[behaviorName];
    if (!behavior) {
      let behaviorType = behaviorTypes[behaviorName];
      if (!behaviorType) {
        console.log(`invalid behavior name: "${behaviorName}"`);
        behaviorType = behaviorTypes["default"];
      }
      const enableScalingEdit =
        this.enableScalingEdit && behaviorType.canDoScalingEdit;
      behavior = new EditBehavior(
        this.contours,
        this.components,
        this.anchors,
        this.guidelines,
        this.backgroundImage,
        this.componentOriginIndices,
        this.componentTCenterIndices,
        behaviorName,
        enableScalingEdit,
        behaviorType,
        doFullTransform
      );
      this.behaviors[behaviorName] = behavior;
    }
    return behavior;
  }
}

class EditBehavior {
  constructor(
    contours,
    components,
    anchors,
    guidelines,
    backgroundImage,
    componentOriginIndices,
    componentTCenterIndices,
    behaviorName,
    enableScalingEdit,
    behavior,
    doFullTransform
  ) {
    this.doFullTransform = doFullTransform;
    //// grid
    this.roundFunc = makeRoundFunc();
    this.constrainDelta = behavior.constrainDelta || ((v) => v);
    const { executors: pointExecutors, participatingPointIndices } =
      makePointExecutors(contours, behaviorName, enableScalingEdit, this.roundFunc);
    this.pointExecutors = pointExecutors;
    this.contours = contours;

    const componentRollbackChanges = [];
    this.componentEditFuncs = [];

    const makeCompoEditFunc = doFullTransform
      ? makeComponentTransformationEditFunc
      : makeComponentOriginEditFunc;

    for (const componentIndex of componentOriginIndices) {
      const [editFunc, compoRollback] = makeCompoEditFunc(
        components[componentIndex],
        componentIndex,
        this.roundFunc
      );
      this.componentEditFuncs.push(editFunc);
      componentRollbackChanges.push(compoRollback);
    }

    if (!doFullTransform) {
      for (const componentIndex of componentTCenterIndices) {
        const [editFunc, compoRollback] = makeComponentTCenterEditFunc(
          components[componentIndex],
          componentIndex,
          this.roundFunc
        );
        this.componentEditFuncs.push(editFunc);
        componentRollbackChanges.push(compoRollback);
      }
    }

    const anchorRollbackChanges = [];
    this.anchorEditFuncs = [];
    for (const [anchorIndex, anchor] of enumerate(anchors)) {
      if (!anchor) {
        continue;
      }
      const [editFunc, anchorRollback] = makeAnchorEditFunc(
        anchors[anchorIndex],
        anchorIndex,
        this.roundFunc
      );
      this.anchorEditFuncs.push(editFunc);
      anchorRollbackChanges.push(anchorRollback);
    }

    const guidelineRollbackChanges = [];
    this.guidelineEditFuncs = [];
    for (const [guidelineIndex, guideline] of enumerate(guidelines)) {
      if (!guideline) {
        continue;
      }
      const [editFunc, guidelineRollback] = makeGuidelineEditFunc(
        guidelines[guidelineIndex],
        guidelineIndex,
        this.roundFunc
      );
      this.guidelineEditFuncs.push(editFunc);
      guidelineRollbackChanges.push(guidelineRollback);
    }

    const backgroundImageRollbackChanges = [];
    this.backgroundImageEditFuncs = [];

    const makeBackgroundImageEditFunc = doFullTransform
      ? makeBackgroundImageTransformationEditFunc
      : makeBackgroundImageOriginEditFunc;

    if (backgroundImage) {
      const [editFunc, backgroundImageRollback] = makeBackgroundImageEditFunc(
        backgroundImage,
        this.roundFunc
      );
      this.backgroundImageEditFuncs.push(editFunc);
      backgroundImageRollbackChanges.push(backgroundImageRollback);
    }

    this.rollbackChange = makeRollbackChange(
      contours,
      participatingPointIndices,
      componentRollbackChanges,
      anchorRollbackChanges,
      guidelineRollbackChanges,
      backgroundImageRollbackChanges
    );
  }

  makeChangeForDelta(delta) {
    assert(
      !this.doFullTransform,
      "can't call makeChangeForDelta on transform behavior"
    );
    // For shift-constrain, we need two transform functions:
    // - one with the delta constrained to 0/45/90 degrees
    // - one with the 'free' delta
    // This is because shift-constrain does two fairly distinct things"
    // 1. Move points in only H or V directions
    // 2. Constrain Bézier handles to 0/45/90 degree angles
    // For the latter, we don't want the initial change (before the constraint)
    // to be constrained, but pin the handle angle based on the freely transformed
    // off-curve point.
    return this._makeChangeForTransformFunc(
      makePointTranslateFunction(this.constrainDelta(delta)),
      makePointTranslateFunction(delta)
    );
  }

  makeChangeForTransformation(transformation) {
    assert(
      this.doFullTransform,
      "can't call makeChangeForTransformation on delta behavior"
    );

    const pointTransformFunction =
      transformation.transformPointObject.bind(transformation);

    const componentTransformFunction = (component, componentIndex) => {
      component = copyComponent(component);
      component.transformation = prependTransformToDecomposed(
        transformation,
        component.transformation
      );
      return component;
    };

    const backgroundImageTransformFunction = (backgroundImage) => {
      backgroundImage = copyBackgroundImage(backgroundImage);
      backgroundImage.transformation = prependTransformToDecomposed(
        transformation,
        backgroundImage.transformation
      );
      return backgroundImage;
    };

    return this._makeChangeForTransformFunc(
      pointTransformFunction,
      null,
      componentTransformFunction,
      backgroundImageTransformFunction
    );
  }

  _makeChangeForTransformFunc(
    transformFunc,
    freeTransformFunc = null,
    transformComponentFunc = null,
    transformBackgroundImageFunc = null
  ) {
    const transform = {
      constrained: transformFunc,
      free: freeTransformFunc || transformFunc,
      constrainDelta: this.constrainDelta,
      transformComponent: transformComponentFunc,
      transformBackgroundImage: transformBackgroundImageFunc,
    };
    const pathChanges = [];
    if (this.pointExecutors?.length) {
      for (let contourIndex = 0; contourIndex < this.pointExecutors.length; contourIndex++) {
        const executor = this.pointExecutors[contourIndex];
        const contour = this.contours[contourIndex];
        if (!executor || !contour) {
          continue;
        }
        const contourChanges = executor.applyTransform(transform, this.roundFunc);
        for (const { pointIndex, x, y } of contourChanges) {
          pathChanges.push(
            makePointChange(pointIndex + contour.startIndex, x, y)
          );
        }
      }
    }
    const componentChanges = this.componentEditFuncs?.map((editFunc) => {
      return editFunc(transform);
    });
    const anchorChanges = this.anchorEditFuncs?.map((editFunc) => {
      return editFunc(transform);
    });
    const guidelineChanges = this.guidelineEditFuncs?.map((editFunc) => {
      return editFunc(transform);
    });
    const backgroundImageChanges = this.backgroundImageEditFuncs?.map((editFunc) => {
      return editFunc(transform);
    });
    const changes = [];
    if (pathChanges && pathChanges.length) {
      changes.push(consolidateChanges(pathChanges, ["path"]));
    }
    if (componentChanges && componentChanges.length) {
      changes.push(consolidateChanges(componentChanges, ["components"]));
    }
    if (anchorChanges && anchorChanges.length) {
      changes.push(consolidateChanges(anchorChanges, ["anchors"]));
    }
    if (guidelineChanges && guidelineChanges.length) {
      changes.push(consolidateChanges(guidelineChanges, ["guidelines"]));
    }
    if (backgroundImageChanges && backgroundImageChanges.length) {
      changes.push(consolidateChanges(backgroundImageChanges, ["backgroundImage"]));
    }
    return consolidateChanges(changes);
  }
}

function makeRollbackChange(
  contours,
  participatingPointIndices,
  componentRollback,
  anchorRollback,
  guidelineRollback,
  backgroundImageRollback
) {
  const pointRollback = [];
  for (let i = 0; i < contours.length; i++) {
    const contour = contours[i];
    const contourPointIndices = participatingPointIndices[i];
    if (!contour) {
      continue;
    }
    const point = contour.points;
    pointRollback.push(
      ...contourPointIndices.map((pointIndex) => {
        const point = contour.points[pointIndex];
        return makePointChange(pointIndex + contour.startIndex, point.x, point.y);
      })
    );
  }

  const changes = [];
  if (pointRollback.length) {
    changes.push(consolidateChanges(pointRollback, ["path"]));
  }
  if (componentRollback.length) {
    changes.push(consolidateChanges(componentRollback, ["components"]));
  }
  if (anchorRollback.length) {
    changes.push(consolidateChanges(anchorRollback, ["anchors"]));
  }
  if (guidelineRollback.length) {
    changes.push(consolidateChanges(guidelineRollback, ["guidelines"]));
  }
  if (backgroundImageRollback.length) {
    changes.push(consolidateChanges(backgroundImageRollback, ["backgroundImage"]));
  }
  return consolidateChanges(changes);
}

function makeComponentTransformationEditFunc(component, componentIndex) {
  const oldComponent = copyComponent(component);
  return [
    (transform) => {
      const newComponent = transform.transformComponent(component, componentIndex);
      return makeComponentChange(newComponent, componentIndex);
    },
    makeComponentChange(oldComponent, componentIndex),
  ];
}

function makeComponentChange(component, componentIndex) {
  return { f: "=", a: [componentIndex, component] };
}

function makeComponentOriginEditFunc(component, componentIndex, roundFunc) {
  const origin = {
    x: component.transformation.translateX,
    y: component.transformation.translateY,
  };
  return [
    (transform) => {
      const editedOrigin = transform.constrained(origin);
      return makeComponentOriginChange(
        componentIndex,
        roundFunc(editedOrigin.x),
        roundFunc(editedOrigin.y)
      );
    },
    makeComponentOriginChange(componentIndex, origin.x, origin.y),
  ];
}

function makeBackgroundImageOriginEditFunc(image, roundFunc) {
  const origin = {
    x: image.transformation.translateX,
    y: image.transformation.translateY,
  };
  return [
    (transform) => {
      const editedOrigin = transform.constrained(origin);
      return makeBackgroundImageOriginChange(
        roundFunc(editedOrigin.x),
        roundFunc(editedOrigin.y)
      );
    },
    makeBackgroundImageOriginChange(origin.x, origin.y),
  ];
}

function makeBackgroundImageTransformationEditFunc(image) {
  const oldBackgroundImage = copyBackgroundImage(image);
  return [
    (transform) => {
      const newBackgroundImage = transform.transformBackgroundImage(image);
      return makeBackgroundImageChange(newBackgroundImage);
    },
    makeBackgroundImageChange(oldBackgroundImage),
  ];
}

function makeBackgroundImageChange(image) {
  return { f: "=", a: ["transformation", image.transformation] };
}

function makeAnchorEditFunc(anchor, anchorIndex, roundFunc) {
  const oldAnchor = { ...anchor };
  return [
    (transform) => {
      const editedAnchor = transform.constrained(oldAnchor);
      return makeAnchorChange(
        anchorIndex,
        roundFunc(editedAnchor.x),
        roundFunc(editedAnchor.y)
      );
    },
    makeAnchorChange(anchorIndex, oldAnchor.x, oldAnchor.y),
  ];
}

function makeGuidelineEditFunc(guideline, guidelineIndex, roundFunc) {
  const oldGuideline = { ...guideline };
  return [
    (transform) => {
      const editedGuideline = transform.constrained(oldGuideline);
      return makeGuidelineChange(
        guidelineIndex,
        editedGuideline.x,
        editedGuideline.y,
        editedGuideline.angle,
        roundFunc
      );
    },
    makeGuidelineChange(
      guidelineIndex,
      oldGuideline.x,
      oldGuideline.y,
      oldGuideline.angle,
      roundFunc
    ),
  ];
}

function makeComponentTCenterEditFunc(component, componentIndex, roundFunc) {
  const transformation = { ...component.transformation };
  const origin = {
    x: transformation.translateX,
    y: transformation.translateY,
  };
  const tCenter = {
    x: transformation.tCenterX,
    y: transformation.tCenterY,
  };
  const affine = decomposedToTransform(transformation);
  const affineInv = affine.inverse();
  const localTCenter = affine.transformPointObject(tCenter);
  return [
    (transform) => {
      const editedTCenter = affineInv.transformPointObject(
        transform.constrained(localTCenter)
      );
      editedTCenter.x = roundFunc(editedTCenter.x);
      editedTCenter.y = roundFunc(editedTCenter.y);
      const editedAffine = decomposedToTransform({
        ...transformation,
        tCenterX: editedTCenter.x,
        tCenterY: editedTCenter.y,
      });
      const editedOrigin = {
        x: origin.x + affine.dx - editedAffine.dx,
        y: origin.y + affine.dy - editedAffine.dy,
      };
      return makeComponentTCenterChange(
        componentIndex,
        editedOrigin.x,
        editedOrigin.y,
        editedTCenter.x,
        editedTCenter.y
      );
    },
    makeComponentTCenterChange(
      componentIndex,
      origin.x,
      origin.y,
      tCenter.x,
      tCenter.y
    ),
  ];
}

function makePointTranslateFunction(delta) {
  return (point) => {
    return { x: point.x + delta.x, y: point.y + delta.y };
  };
}

function makePointChange(pointIndex, x, y) {
  return { f: "=xy", a: [pointIndex, x, y] };
}

function makeAnchorChange(anchorIndex, x, y) {
  return {
    p: [anchorIndex],
    c: [
      { f: "=", a: ["x", x] },
      { f: "=", a: ["y", y] },
    ],
  };
}

function makeGuidelineChange(guidelineIndex, x, y, angle, roundFunc) {
  let c = [];
  if (x !== undefined) {
    c.push({ f: "=", a: ["x", roundFunc(x)] });
  }
  if (y !== undefined) {
    c.push({ f: "=", a: ["y", roundFunc(y)] });
  }
  if (angle !== undefined) {
    c.push({ f: "=", a: ["angle", angle] });
  }
  return {
    p: [guidelineIndex],
    c: c,
  };
}

function makeComponentOriginChange(componentIndex, x, y) {
  return {
    p: [componentIndex, "transformation"],
    c: [
      { f: "=", a: ["translateX", x] },
      { f: "=", a: ["translateY", y] },
    ],
  };
}

function makeBackgroundImageOriginChange(x, y) {
  return {
    p: ["transformation"],
    c: [
      { f: "=", a: ["translateX", x] },
      { f: "=", a: ["translateY", y] },
    ],
  };
}

function makeComponentTCenterChange(componentIndex, x, y, cx, cy) {
  return {
    p: [componentIndex, "transformation"],
    c: [
      { f: "=", a: ["translateX", x] },
      { f: "=", a: ["translateY", y] },
      { f: "=", a: ["tCenterX", cx] },
      { f: "=", a: ["tCenterY", cy] },
    ],
  };
}

function unpackContours(path, selectedPointIndices) {
  // Return an array with one item per contour. An item is either `undefined`,
  // when no points from this contour are selected, or an object with contour info,
  const contours = new Array(path.contourInfo.length);
  let contourIndex = 0;
  const numPoints = path.numPoints;
  for (const pointIndex of selectedPointIndices) {
    if (pointIndex >= numPoints) {
      break;
    }
    while (path.contourInfo[contourIndex].endPoint < pointIndex) {
      contourIndex++;
    }
    const contourStartIndex = !contourIndex
      ? 0
      : path.contourInfo[contourIndex - 1].endPoint + 1;
    let contour = contours[contourIndex];
    if (contour === undefined) {
      const contourEndIndex = path.contourInfo[contourIndex].endPoint + 1;
      const contourNumPoints = contourEndIndex - contourStartIndex;
      const contourPoints = new Array(contourNumPoints);
      contour = {
        startIndex: contourStartIndex,
        points: contourPoints,
        isClosed: path.contourInfo[contourIndex].isClosed,
      };
      for (let i = 0; i < contourNumPoints; i++) {
        contourPoints[i] = path.getPoint(i + contourStartIndex);
      }
      contours[contourIndex] = contour;
    }
    contour.points[pointIndex - contourStartIndex].selected = true;
  }
  return contours;
}

function unpackComponents(components, selectedComponentIndices) {
  const unpackedComponents = new Array(components.length);
  for (const componentIndex of selectedComponentIndices) {
    unpackedComponents[componentIndex] = copyComponent(components[componentIndex]);
  }
  return unpackedComponents;
}

function unpackAnchors(anchors, selectedAnchorIndices) {
  const unpackedAnchors = new Array(anchors.length);
  for (const anchorIndex of selectedAnchorIndices) {
    unpackedAnchors[anchorIndex] = anchors[anchorIndex];
  }
  return unpackedAnchors;
}

function unpackGuidelines(guidelines, selectedGuidelineIndices) {
  const unpackedGuidelines = new Array(guidelines.length);
  for (const i of selectedGuidelineIndices) {
    const guideline = guidelines[i];
    if (!guideline.locked) {
      unpackedGuidelines[i] = guidelines[i];
    }
  }
  return unpackedGuidelines;
}

function collectSelectedIndices(points) {
  const selected = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i]?.selected) {
      selected.push(i);
    }
  }
  return selected;
}

function getParticipatingPointIndices(editEntries) {
  const indices = new Set();
  for (const entry of editEntries) {
    if (entry.pointIndex >= 0 && !entry.isTransformCalculation) {
      indices.add(entry.pointIndex);
    }
  }
  return [...indices].sort((a, b) => a - b);
}

function makePointExecutors(contours, behaviorName, enableScalingEdit, roundFunc) {
  const executors = new Array(contours.length);
  const participatingPointIndices = new Array(contours.length);

  for (let contourIndex = 0; contourIndex < contours.length; contourIndex++) {
    const contour = contours[contourIndex];
    if (!contour) {
      continue;
    }
    const selectedIndices = collectSelectedIndices(contour.points);
    const executor = createPointBehaviorExecutor({
      points: contour.points,
      isClosed: contour.isClosed,
      selectedIndices,
      behaviorName,
      enableScalingEdit,
      roundFunc,
    });
    executors[contourIndex] = executor;
    participatingPointIndices[contourIndex] = getParticipatingPointIndices(
      executor.editEntries
    );
  }

  return { executors, participatingPointIndices };
}

export function constrainHorVerDiag(vector) {
  const constrainedVector = { ...vector };
  const ax = Math.abs(vector.x);
  const ay = Math.abs(vector.y);
  let tan;
  if (ax < 0.001) {
    tan = 0;
  } else {
    tan = ay / ax;
  }
  if (0.414 < tan && tan < 2.414) {
    // between 22.5 and 67.5 degrees
    const d = 0.5 * (ax + ay);
    constrainedVector.x = d * Math.sign(constrainedVector.x);
    constrainedVector.y = d * Math.sign(constrainedVector.y);
  } else if (ax > ay) {
    constrainedVector.y = 0;
  } else {
    constrainedVector.x = 0;
  }
  return constrainedVector;
}

const actionFactories = {
  DontMove: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      return thePoint;
    };
  },

  Move: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      return transform.constrained(thePoint);
    };
  },

  RotateNext: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const handle = vector.subVectors(thePoint, prev);
    const handleLength = Math.hypot(handle.x, handle.y);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const delta = vector.subVectors(prev, prevPrev);
      if (!delta.x && !delta.y) {
        // The angle is undefined, atan2 will return 0, let's just not touch the point
        return thePoint;
      }
      const angle = Math.atan2(delta.y, delta.x);
      const handlePoint = {
        x: prev.x + handleLength * Math.cos(angle),
        y: prev.y + handleLength * Math.sin(angle),
      };
      return handlePoint;
    };
  },

  ConstrainPrevAngle: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prevPrev;
    const pt2 = prev;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        pt1,
        pt2,
        point,
        vector.addVectors(point, perpVector)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  ConstrainMiddle: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prev;
    const pt2 = next;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        pt1,
        pt2,
        point,
        vector.addVectors(point, perpVector)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  ConstrainMiddleTwo: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prevPrev;
    const pt2 = next;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        pt1,
        pt2,
        point,
        vector.addVectors(point, perpVector)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  TangentIntersect: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const nextHandle = vector.subVectors(thePoint, next);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        prevPrev,
        prev,
        next,
        vector.addVectors(next, nextHandle)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  TangentIntersectLive: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(prevPrev, prev, next, nextNext);
      if (!intersection) {
        return thePoint;
      }
      return intersection;
    };
  },

  HandleIntersect: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const handlePrev = vector.subVectors(thePoint, prev);
    const handleNext = vector.subVectors(thePoint, next);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const intersection = vector.intersect(
        prev,
        vector.addVectors(prev, handlePrev),
        next,
        vector.addVectors(next, handleNext)
      );
      if (!intersection) {
        return thePoint;
      }
      return intersection;
    };
  },

  ConstrainHandle: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(vector.subVectors(newPoint, prev));
      return vector.addVectors(prev, handleVector);
    };
  },

  ConstrainHandleIntersect: (
    prevPrevPrev,
    prevPrev,
    prev,
    thePoint,
    next,
    nextNext
  ) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handlePrev = transform.constrainDelta(vector.subVectors(newPoint, prev));
      const handleNext = transform.constrainDelta(vector.subVectors(newPoint, next));

      const intersection = vector.intersect(
        prev,
        vector.addVectors(prev, handlePrev),
        next,
        vector.addVectors(next, handleNext)
      );
      if (!intersection) {
        return newPoint;
      }
      return intersection;
    };
  },

  ConstrainHandleIntersectPrev: (
    prevPrevPrev,
    prevPrev,
    prev,
    thePoint,
    next,
    nextNext
  ) => {
    const tangentPrev = vector.subVectors(prev, prevPrev);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleNext = transform.constrainDelta(vector.subVectors(newPoint, next));

      const intersection = vector.intersect(
        prev,
        vector.addVectors(prev, tangentPrev),
        next,
        vector.addVectors(next, handleNext)
      );
      if (!intersection) {
        return newPoint;
      }
      return intersection;
    };
  },

   
  //// equalize
  Equalize: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const handle = vector.subVectors(thePoint, prev);
      const handleLength = Math.hypot(handle.x, handle.y);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
        const delta = vector.subVectors(prev, prevPrev);
        if (!delta.x && !delta.y) {
          // The angle is undefined, atan2 will return 0, let's just not touch the point
          return thePoint;
        }
        const angle = Math.atan2(delta.y, delta.x);
        const handlePoint = {
          x: prev.x + handleLength * Math.cos(angle),
          y: prev.y + handleLength * Math.sin(angle),
        };
        return handlePoint;
      };
    },

  //// equalize
  RotateNextEqualLength: (
  prevPrevPrev,
  prevPrev,
  prev,
  thePoint,
  next,
  nextNext
) => {
  // original positions
  const originDragged = prevPrev;   // the off-curve point that is being moved
  const originOpposite = thePoint;  // the opposite off-curve point
  const anchor = prev;              // the on-curve (smooth) point between them

  return (
    transform,
    /* unused */ prevPrevPrev,
    newDragged,
    /* unused */ newPrev,
    /* unused */ newOpposite,
    /* unused */ next,
    /* unused */ nextNext
  ) => {
    // vector from anchor to the NEW dragged handle
    const vec = { x: newDragged.x - anchor.x, y: newDragged.y - anchor.y };

    if (vec.x === 0 && vec.y === 0) {
      return originOpposite;        // avoid division by zero
    }

    // same distance, opposite direction
    const len = Math.hypot(vec.x, vec.y);
    const angle = Math.atan2(vec.y, vec.x);

    return {
      x: anchor.x - len * Math.cos(angle),
      y: anchor.y - len * Math.sin(angle),
    };
    };
  },

  InterpolatePrevPrevNext: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const lenPrevPrevNext = vector.distance(next, prevPrev);
    const lenPrevPrev = vector.distance(thePoint, prevPrev);
    let t = lenPrevPrevNext > 0.0001 ? lenPrevPrev / lenPrevPrevNext : 0;
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const prevPrevNext = vector.subVectors(next, prevPrev);
      return vector.addVectors(prevPrev, vector.mulVectorScalar(prevPrevNext, t));
    };
  },

  ConstrainAroundPrevPrev: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(
        vector.subVectors(newPoint, prevPrev)
      );
      return vector.addVectors(prevPrev, handleVector);
    };
  },

  ConstrainAroundPrevPrevPrev: (
    prevPrevPrev,
    prevPrev,
    prev,
    thePoint,
    next,
    nextNext
  ) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(
        vector.subVectors(newPoint, prevPrevPrev)
      );
      return vector.addVectors(prevPrevPrev, handleVector);
    };
  },
};

// prettier-ignore
const defaultRules = [
  //   prev3       prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Unselected off-curve point next to a smooth point next to a selected point
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point: its neighboring off-curve point should move
  [    ANY|NIL,    SHA|SMO|UNS,SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point, selected handle: constrain both on original angle
  [    ANY|NIL,    SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    OFF|SHA|NIL,ANY|NIL,    true,       "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY,        SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    OFF|SHA|NIL,true,       "ConstrainMiddle"],

  // Unselected free off-curve point, move with on-curve neighbor
  [    ANY|NIL,    ANY|NIL,    SHA|SMO|SEL,OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    false,      "Move"],
  [    ANY|NIL,    OFF,        SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    false,      "Move"],

  // An unselected off-curve between two on-curve points
  [    ANY|NIL,    ANY,        SMO|SHA|SEL,OFF|UNS,    SMO|SHA,    ANY|NIL,    true,       "HandleIntersect"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    SMO,        ANY|NIL,    true,       "TangentIntersectLive"],
  [    ANY|NIL,    SMO|SHA,    SMO|SEL,    OFF|UNS,    SMO|SHA,    ANY|NIL,    true,       "TangentIntersect"],
  [    ANY|NIL,    SMO|SHA,    SMO|UNS,    OFF|SEL,    SMO|SEL,    ANY|NIL,    true,       "HandleIntersect"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    SHA|SEL,    ANY|NIL,    true,       "TangentIntersect"],

  // Tangent bcp constraint
  [    ANY|NIL,    SMO|SHA,    SMO|UNS,    OFF|SEL,    ANY|UNS|NIL,ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    SMO|SHA,    SMO|UNS,    OFF|SEL,    SHA|OFF,    ANY|NIL,    false,      "ConstrainPrevAngle"],

  // Two selected points with an unselected smooth point between them
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    ANY|SEL,    false,      "DontMove"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    SMO|UNS,    false,      "DontMove"],

  // Selected tangent with selected handle: constrain at original tangent line
  [    ANY|NIL,    SMO|SHA|UNS,SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY,        SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    ANY|NIL,    true,       "ConstrainMiddle"],

  // Selected tangent, selected off-curve, selected smooth
  [    ANY|NIL,    SMO|SHA|UNS,SMO|SEL,    OFF|SEL,    SMO|SEL,    ANY|NIL,    true,       "HandleIntersect"],

  // Selected single off-curve, locked between two unselected smooth points
  [    ANY|NIL,    SHA|SMO|UNS,SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|SEL,    false,      "DontMove"],

];

// prettier-ignore
const constrainRules = defaultRules.concat([

  // Selected free off curve: constrain to 0, 45 or 90 degrees
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    OFF|SEL,    OFF|NIL,    ANY|NIL,    false,      "ConstrainHandle"],
  [    ANY|NIL,    ANY|NIL,    SHA|UNS,    OFF|SEL,    OFF|NIL,    ANY|NIL,    false,      "ConstrainHandle"],
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|UNS,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    ANY|NIL,    SHA|UNS,    OFF|SEL,    SHA|UNS,    ANY|NIL,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    OFF|SEL,    SHA|UNS,    ANY|NIL,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    SHA|SMO|UNS,SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|UNS,    false,      "ConstrainHandleIntersectPrev"],

  // Selected smooth between unselected on-curve and off-curve
  [    ANY|NIL,    ANY|UNS,    SMO|SHA|UNS,SMO|SEL,    OFF|UNS,    ANY|NIL,    false,      "ConstrainHandle"],

]);

// prettier-ignore
const alternateRules = [
  //   prev3       prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Selected smooth before unselected off-curve
  [    ANY|NIL,    ANY|NIL,    ANY|UNS,    SMO|SEL,    OFF,        ANY|NIL,    false,      "ConstrainMiddle"],
  [    ANY|NIL,    OFF,        SMO|SEL,    SMO|SEL,    OFF|UNS,    ANY|NIL,    false,      "ConstrainMiddleTwo"],
  [    ANY|NIL,    OFF|UNS,    SMO|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    false,      "ConstrainMiddleTwo"],
  [    ANY|NIL,    SMO|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "RotateNext"],
  [    ANY|NIL,    SMO|SEL,    SMO|UNS,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "ConstrainPrevAngle"],
  [    ANY|NIL,    SMO|UNS,    SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "ConstrainPrevAngle"],

  // Smooth with two selected neighbors
  [    ANY|NIL,    ANY|NIL,    ANY|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    false,      "ConstrainMiddle"],

  // Unselected smooth between sharp and off-curve, one of them selected
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "Equalize"],
  
  // Selected tangent point: its neighboring off-curve point should move
  [    ANY|NIL,    OFF|SEL,    SMO|UNS,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "RotateNextEqualLength"],

  // Two unselected smooth points between two off-curves, one of them selected
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "InterpolatePrevPrevNext"],
  [    ANY|NIL,    OFF|SEL,    SMO|UNS,    SMO|UNS,    OFF|UNS,    ANY|NIL,    true,       "InterpolatePrevPrevNext"],

  // Smooth on-curve with single off-curve (for on-curve interpolation)
  [    ANY|NIL,    ANY|NIL,    SHA|OFF|UNS,SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Interpolate"],
  [    ANY|NIL,    ANY|NIL,    SHA|OFF|SEL,SMO|UNS,    OFF|UNS,    ANY|NIL,    true,       "Interpolate"],

  // An unselected smooth point between two selected off-curves
  [    ANY|NIL,    ANY|NIL,    OFF|SEL,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Move"],

  // Two unselected smooth points between two selected off-curves
  [    ANY|NIL,    OFF|SEL,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Move"],

  // Two selected points locked by angle
  [    ANY|NIL,    ANY,        SHA|SEL,    SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,false,      "ConstrainMiddle"],
  [    ANY|NIL,    ANY,        SMO|SEL,    SHA|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY,        SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],

  // Selected off-curve locked between two selected smooth points
  [    ANY|NIL,    ANY|NIL,    SMO|SEL,    OFF|SEL,    SMO|SEL,    ANY|NIL,    false,      "DontMove"],

]


// prettier-ignore
const alternateConstrainRules = alternateRules.concat([

  [    ANY|NIL,    SHA|OFF|UNS,SMO|UNS,    SHA|OFF|SEL,ANY|NIL,    ANY|NIL,    false,      "ConstrainAroundPrevPrev"],

  // Two unselected smooth points between two off-curves, one of them selected
  [    ANY|UNS,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainAroundPrevPrevPrev"],

]);

const behaviorTypes = {
  "default": {
    matchTree: buildPointMatchTree(defaultRules),
    actions: actionFactories,
    canDoScalingEdit: true,
  },

  "constrain": {
    matchTree: buildPointMatchTree(constrainRules),
    actions: actionFactories,
    constrainDelta: constrainHorVerDiag,
    canDoScalingEdit: true,
  },

  "alternate": {
    matchTree: buildPointMatchTree(alternateRules),
    actions: actionFactories,
  },

  "alternate-constrain": {
    matchTree: buildPointMatchTree(alternateConstrainRules),
    actions: actionFactories,
    constrainDelta: constrainHorVerDiag,
  },
};

export function getPointBehaviorType(behaviorName) {
  return behaviorTypes[behaviorName] || behaviorTypes["default"];
}

export const POINT_BEHAVIOR_TYPES = behaviorTypes;

// Type-agnostic point behavior executor.
// Inputs:
// - points: array of point objects (will be read, not mutated except `selected`)
// - isClosed: contour closed flag
// - selectedIndices: indices of selected points in this contour
// - behaviorName: "default" | "constrain" | "alternate" | "alternate-constrain"
// - enableScalingEdit: enable segment-scaling behavior when supported
// - roundFunc: rounding function for output coordinates
// Outputs:
// - applyTransform(transform): returns [{ pointIndex, x, y }]
// - applyDelta(delta): delta wrapper around applyTransform
// - getRollback(): returns [{ pointIndex, x, y }]
// Invariants: no persistence, no layer knowledge, no selection parsing.
export function createPointBehaviorExecutor({
  points,
  isClosed,
  selectedIndices,
  behaviorName = "default",
  enableScalingEdit = false,
  roundFunc = Math.round,
}) {
  const behavior = getPointBehaviorType(behaviorName);
  const matchTree = behavior.matchTree;
  const constrainDelta = behavior.constrainDelta || ((v) => v);
  const actionFactories = behavior.actions || {};
  const selectedSet = new Set(selectedIndices || []);

  for (let i = 0; i < points.length; i++) {
    points[i].selected = selectedSet.has(i);
  }

  const editEntries = buildEditEntries();
  const originalPositions = points.map((p) => ({ x: p.x, y: p.y }));

  function buildEditEntries() {
    const editFuncsTransform = [];
    const editFuncsConstrain = [];
    const numPoints = points.length;
    const participatingPointIndices = [];

    for (let i = 0; i < numPoints; i++) {
      const [match, neighborIndices] = findPointMatch(
        matchTree,
        i,
        points,
        numPoints,
        isClosed
      );

      if (!match) continue;

      const [prevPrevPrev, prevPrev, prev, thePoint, next, nextNext] =
        match.direction > 0 ? neighborIndices : reversed(neighborIndices);

      const actionFactory = actionFactories[match.action];
      if (!actionFactory) {
        console.warn(`Unknown action: ${match.action}`);
        continue;
      }

      participatingPointIndices.push(thePoint);

      const actionFunc = actionFactory(
        points[prevPrevPrev],
        points[prevPrev],
        points[prev],
        points[thePoint],
        points[next],
        points[nextNext]
      );

      const editEntry = {
        pointIndex: thePoint,
        neighborIndices: { prevPrevPrev, prevPrev, prev, thePoint, next, nextNext },
        constrain: match.constrain,
        actionFunc,
      };

      if (!match.constrain) {
        editFuncsTransform.push(editEntry);
      } else {
        editFuncsConstrain.push(editEntry);
      }
    }

    const additionalEditFuncs = makeAdditionalEditEntries(participatingPointIndices);
    return [...editFuncsTransform, ...editFuncsConstrain, ...additionalEditFuncs];
  }

  function makeAdditionalEditEntries(participatingPointIndices) {
    const additionalFuncs = [];

    let conditionFunc;
    let segmentFunc;
    if (enableScalingEdit) {
      segmentFunc = makeSegmentScalingEditEntries;
      conditionFunc = (segment) =>
        segment.length >= 4 &&
        (points[segment[0]].selected || points[segment.at(-1)].selected) &&
        segment.slice(1, -1).every((i) => !points[i].selected);
    } else {
      segmentFunc = makeSegmentFloatingOffCurveEditEntries;
      conditionFunc = (segment) =>
        segment.length >= 5 &&
        points[segment[0]].selected &&
        points[segment.at(-1)].selected &&
        segment.slice(1, -1).every((i) => !points[i].selected);
    }

    for (const segment of iterSegmentPointIndices()) {
      if (!conditionFunc(segment)) continue;
      const [editFuncs, indices] = segmentFunc(segment);
      additionalFuncs.push(...editFuncs);
      participatingPointIndices.push(...indices);
    }

    return additionalFuncs;
  }

  function* iterSegmentPointIndices() {
    const lastPointIndex = points.length - 1;
    const firstOnCurve = findFirstOnCurvePoint();
    if (firstOnCurve === undefined) {
      return;
    }
    let currentOnCurve = firstOnCurve;
    while (true) {
      const indices = [...iterUntilNextOnCurvePoint(currentOnCurve)];
      if (!indices.length) {
        break;
      }
      yield indices;
      currentOnCurve = indices.at(-1);
      if (
        (isClosed && currentOnCurve === firstOnCurve) ||
        (!isClosed && currentOnCurve === lastPointIndex)
      ) {
        break;
      }
    }
  }

  function findFirstOnCurvePoint() {
    const numPoints = points.length;
    for (let i = 0; i < numPoints; i++) {
      if (!points[i].type) {
        return i;
      }
    }
    return undefined;
  }

  function* iterUntilNextOnCurvePoint(startIndex) {
    yield startIndex;
    const numPoints = points.length;
    for (let i = startIndex + 1; i < numPoints; i++) {
      yield i;
      if (!points[i].type) {
        return;
      }
    }
    if (!isClosed || !startIndex) {
      return;
    }
    for (let i = 0; i < startIndex; i++) {
      yield i;
      if (!points[i].type) {
        return;
      }
    }
  }

  function makeSegmentFloatingOffCurveEditEntries(segment) {
    const editFuncs = [];
    const pointIndices = [];

    for (const i of segment.slice(2, -2)) {
      pointIndices.push(i);
      const pointIndex = i;
      editFuncs.push({
        pointIndex,
        neighborIndices: { thePoint: pointIndex },
        constrain: false,
        actionFunc: (transform) => transform.constrained(points[pointIndex]),
        isAdditional: true,
      });
    }
    return [editFuncs, pointIndices];
  }

  function makeSegmentScalingEditEntries(segment) {
    const editFuncs = [];
    const pointIndices = [];

    const A = makeSegmentTransform(points, segment, false);
    const Ainv = A?.inverse();

    if (A && Ainv) {
      let T = null;

      editFuncs.push({
        pointIndex: -1,
        neighborIndices: {},
        constrain: false,
        actionFunc: (transform, editedPoints) => {
          const B = makeSegmentTransform(editedPoints, segment, true);
          T = B?.transform(Ainv);
          return null;
        },
        isTransformCalculation: true,
      });

      for (const i of segment.slice(1, -1)) {
        pointIndices.push(i);
        const pointIndex = i;
        editFuncs.push({
          pointIndex,
          neighborIndices: { thePoint: pointIndex },
          constrain: false,
          actionFunc: (transform, editedPoints) => {
            if (T) {
              return T.transformPointObject(points[pointIndex]);
            }
            return editedPoints ? editedPoints[pointIndex] : points[pointIndex];
          },
          isAdditional: true,
        });
      }
    }
    return [editFuncs, pointIndices];
  }

  function makeSegmentTransform(segmentPoints, pointIndices, allowConcave) {
    const pt0 = segmentPoints[pointIndices[0]];
    const pt1 = segmentPoints[pointIndices[1]];
    const pt2 = segmentPoints[pointIndices.at(-2)];
    const pt3 = segmentPoints[pointIndices.at(-1)];
    if (!pt0 || !pt1 || !pt2 || !pt3) {
      return undefined;
    }
    if (!allowConcave && !polygonIsConvex([pt0, pt1, pt2, pt3])) {
      return undefined;
    }
    const intersection = vector.intersect(pt0, pt1, pt2, pt3);
    if (!intersection) {
      return undefined;
    }
    const v1 = vector.subVectors(intersection, pt0);
    const v2 = vector.subVectors(pt3, intersection);
    return new Transform(v1.x, v1.y, v2.x, v2.y, pt0.x, pt0.y);
  }

  function applyTransform(transform, overrideRoundFunc = roundFunc) {
    const editedPoints = [...points];
    const changes = [];

    const resolvedTransform = {
      constrained: transform.constrained,
      free: transform.free || transform.constrained,
      constrainDelta: transform.constrainDelta || constrainDelta,
    };

    for (const editEntry of editEntries) {
      const { pointIndex, neighborIndices, actionFunc, isAdditional, isTransformCalculation } =
        editEntry;

      let newPoint;
      if (isAdditional || isTransformCalculation) {
        newPoint = actionFunc(resolvedTransform, editedPoints);
      } else {
        const { prevPrevPrev, prevPrev, prev, thePoint, next, nextNext } = neighborIndices;
        newPoint = actionFunc(
          resolvedTransform,
          editedPoints[prevPrevPrev],
          editedPoints[prevPrev],
          editedPoints[prev],
          editedPoints[thePoint],
          editedPoints[next],
          editedPoints[nextNext]
        );
      }

      if (isTransformCalculation || newPoint === null) {
        continue;
      }

      editedPoints[pointIndex] = { ...points[pointIndex], ...newPoint };
      changes.push({
        pointIndex,
        x: overrideRoundFunc(newPoint.x),
        y: overrideRoundFunc(newPoint.y),
      });
    }

    return changes;
  }

  function applyDelta(delta, overrideRoundFunc = roundFunc) {
    const constrainedDelta = constrainDelta(delta);
    const transformConstrained = (point) => ({
      x: point.x + constrainedDelta.x,
      y: point.y + constrainedDelta.y,
    });
    const transformFree = (point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    });

    return applyTransform(
      {
        constrained: transformConstrained,
        free: transformFree,
        constrainDelta,
      },
      overrideRoundFunc
    );
  }

  function getRollback() {
    return editEntries
      .filter(({ pointIndex, isTransformCalculation }) => pointIndex >= 0 && !isTransformCalculation)
      .map(({ pointIndex }) => ({
        pointIndex,
        x: originalPositions[pointIndex].x,
        y: originalPositions[pointIndex].y,
      }));
  }

  return {
    applyTransform,
    applyDelta,
    getRollback,
    originalPositions,
    editEntries,
    constrainDelta,
  };
}

/**
 * Skeleton behavior helpers (modifiers, ribs, and editable handles).
 */
/**
 * Helper to get behavior name from event modifiers.
 * Same logic as getBehaviorName in edit-tools-pointer.js
 */
export function getSkeletonBehaviorName(shiftKey, altKey) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[(shiftKey ? 1 : 0) + (altKey ? 2 : 0)];
}

export function createRibEditBehavior(skeletonData, ribHit) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  const roundFunc = ribHit.roundFunc || Math.round;
  const contour = skeletonData.contours[contourIndex];
  const point = contour.points[pointIndex];
  const defaultWidth = contour.defaultWidth || 20;

  return {
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    roundFunc,
    originalHalfWidth:
      side === "left"
        ? point.leftWidth !== undefined
          ? point.leftWidth
          : point.width !== undefined
            ? point.width / 2
            : defaultWidth / 2
        : point.rightWidth !== undefined
          ? point.rightWidth
          : point.width !== undefined
            ? point.width / 2
            : defaultWidth / 2,
    minHalfWidth: 0,
    constrainToNormal(delta) {
      const sign = this.side === "left" ? 1 : -1;
      const dot = delta.x * this.normal.x + delta.y * this.normal.y;
      return {
        x: sign * dot * this.normal.x,
        y: sign * dot * this.normal.y,
      };
    },
    applyDelta(delta, constrainMode = null, round = this.roundFunc) {
      const sign = this.side === "left" ? 1 : -1;
      const dot = delta.x * this.normal.x + delta.y * this.normal.y;
      const projectedDelta = sign * dot;

      let newHalfWidth = this.originalHalfWidth + projectedDelta;
      if (newHalfWidth < this.minHalfWidth) {
        newHalfWidth = this.minHalfWidth;
      }

      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: round(newHalfWidth),
      };
    },
    getRollback() {
      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: Math.round(this.originalHalfWidth),
      };
    },
  };
}

/**
 * EditableRibBehavior - Handles dragging of editable rib points.
 * - Width follows normal component by default.
 * - Nudge follows tangent only when constrained (e.g. Shift).
 * - Constrain modes can lock width or nudge.
 */
export function createEditableRibBehavior(skeletonData, ribHit) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  const roundFunc = ribHit.roundFunc || Math.round;
  const contour = skeletonData.contours[contourIndex];
  const point = contour.points[pointIndex];
  const points = contour.points;
  const defaultWidth = contour.defaultWidth || 20;
  const tangent = { x: -normal.y, y: normal.x };

  const behavior = {
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    tangent,
    onCurvePoint,
    roundFunc,
    originalHalfWidth:
      side === "left"
        ? point.leftWidth !== undefined
          ? point.leftWidth
          : point.width !== undefined
            ? point.width / 2
            : defaultWidth / 2
        : point.rightWidth !== undefined
          ? point.rightWidth
          : point.width !== undefined
            ? point.width / 2
            : defaultWidth / 2,
    originalNudge: point[side === "left" ? "leftNudge" : "rightNudge"] || 0,
    minHalfWidth: 0,
    skeletonHandleInDir: null,
    skeletonHandleOutDir: null,
    hasHandleOffsets: false,
    originalHandleInOffsetX: 0,
    originalHandleInOffsetY: 0,
    originalHandleOutOffsetX: 0,
    originalHandleOutOffsetY: 0,
    applyDelta(delta, constrainMode = null, round = this.roundFunc) {
      let newNudge = this.originalNudge;
      let newHalfWidth = this.originalHalfWidth;

      if (constrainMode === "tangent") {
        const tangentDot = delta.x * this.tangent.x + delta.y * this.tangent.y;
        newNudge = this.originalNudge + tangentDot;
      } else {
        const sign = this.side === "left" ? 1 : -1;
        const normalDot = delta.x * this.normal.x + delta.y * this.normal.y;
        const normalDelta = sign * normalDot;
        newHalfWidth = this.originalHalfWidth + normalDelta;
        if (newHalfWidth < this.minHalfWidth) {
          newHalfWidth = this.minHalfWidth;
        }
      }

      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: round(newHalfWidth),
        nudge: round(newNudge),
      };
    },
    getRollback() {
      const result = {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: Math.round(this.originalHalfWidth),
        nudge: Math.round(this.originalNudge),
      };

      if (this.hasHandleOffsets) {
        result.handleInOffsetX = Math.round(this.originalHandleInOffsetX);
        result.handleInOffsetY = Math.round(this.originalHandleInOffsetY);
        result.handleOutOffsetX = Math.round(this.originalHandleOutOffsetX);
        result.handleOutOffsetY = Math.round(this.originalHandleOutOffsetY);
        result.hasHandleOffsets = true;
      }

      return result;
    },
    setOriginalHalfWidth(halfWidth) {
      this.originalHalfWidth = halfWidth;
    },
  };

  const prevIdx = (pointIndex - 1 + points.length) % points.length;
  if (points[prevIdx]?.type) {
    const dx = points[prevIdx].x - point.x;
    const dy = points[prevIdx].y - point.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      behavior.skeletonHandleInDir = { x: dx / len, y: dy / len };
    }
  }

  const nextIdx = (pointIndex + 1) % points.length;
  if (points[nextIdx]?.type) {
    const dx = points[nextIdx].x - point.x;
    const dy = points[nextIdx].y - point.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      behavior.skeletonHandleOutDir = { x: dx / len, y: dy / len };
    }
  }

  const handleInXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
  const handleInYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
  const handleOutXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
  const handleOutYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";
  const handleIn1DKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
  const handleOut1DKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";

  const has2DIn = point[handleInXKey] !== undefined || point[handleInYKey] !== undefined;
  const has2DOut = point[handleOutXKey] !== undefined || point[handleOutYKey] !== undefined;
  behavior.hasHandleOffsets =
    has2DIn ||
    has2DOut ||
    point[handleIn1DKey] !== undefined ||
    point[handleOut1DKey] !== undefined;

  if (has2DIn) {
    behavior.originalHandleInOffsetX = point[handleInXKey] || 0;
    behavior.originalHandleInOffsetY = point[handleInYKey] || 0;
  } else if (point[handleIn1DKey]) {
    const dir = behavior.skeletonHandleInDir || behavior.tangent;
    behavior.originalHandleInOffsetX = dir.x * point[handleIn1DKey];
    behavior.originalHandleInOffsetY = dir.y * point[handleIn1DKey];
  }

  if (has2DOut) {
    behavior.originalHandleOutOffsetX = point[handleOutXKey] || 0;
    behavior.originalHandleOutOffsetY = point[handleOutYKey] || 0;
  } else if (point[handleOut1DKey]) {
    const dir = behavior.skeletonHandleOutDir || behavior.tangent;
    behavior.originalHandleOutOffsetX = dir.x * point[handleOut1DKey];
    behavior.originalHandleOutOffsetY = dir.y * point[handleOut1DKey];
  }

  return behavior;
}

export function createInterpolatingRibBehavior(
  skeletonData,
  ribHit,
  interpolationAxis = null
) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  const roundFunc = ribHit.roundFunc || Math.round;
  const contour = skeletonData.contours[contourIndex];
  const point = contour.points[pointIndex];
  const points = contour.points;
  const isClosed = !!contour.isClosed;
  const defaultWidth = contour.defaultWidth || 20;
  const tangent = { x: -normal.y, y: normal.x };

  const behavior = {
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    tangent,
    onCurvePoint,
    interpolationAxis: interpolationAxis || null,
    roundFunc,
    skeletonHandleInDir: null,
    skeletonHandleOutDir: null,
    hasIncomingHandle: false,
    hasOutgoingHandle: false,
    originalHalfWidth:
      side === "left"
        ? point.leftWidth !== undefined
          ? point.leftWidth
          : point.width !== undefined
            ? point.width / 2
            : defaultWidth / 2
        : point.rightWidth !== undefined
          ? point.rightWidth
          : point.width !== undefined
            ? point.width / 2
            : defaultWidth / 2,
    originalNudge: point[side === "left" ? "leftNudge" : "rightNudge"] || 0,
    originalHandleInOffsetX: 0,
    originalHandleInOffsetY: 0,
    originalHandleOutOffsetX: 0,
    originalHandleOutOffsetY: 0,
    originalRibPos: null,
    lineDir: { x: 0, y: 0 },
    lineLength: 0,
    _recalculateRibPos() {
      const sign = this.side === "left" ? 1 : -1;
      this.originalRibPos = {
        x:
          this.onCurvePoint.x +
          sign * this.normal.x * this.originalHalfWidth +
          this.tangent.x * this.originalNudge,
        y:
          this.onCurvePoint.y +
          sign * this.normal.y * this.originalHalfWidth +
          this.tangent.y * this.originalNudge,
      };
    },
    setOriginalHalfWidth(halfWidth) {
      this.originalHalfWidth = halfWidth;
      this._recalculateRibPos();
    },
    applyDelta(delta, constrainMode = null, round = this.roundFunc) {
      const deltaAlongLine = delta.x * this.lineDir.x + delta.y * this.lineDir.y;

      const lineDirDotTangent = this.lineDir.x * this.tangent.x + this.lineDir.y * this.tangent.y;
      const deltaNudge = lineDirDotTangent * deltaAlongLine;
      const newNudge = this.originalNudge + deltaNudge;

      const handleOffsetDeltaX = -this.tangent.x * deltaNudge;
      const handleOffsetDeltaY = -this.tangent.y * deltaNudge;

      const newHandleInOffsetX =
        this.originalHandleInOffsetX + (this.hasIncomingHandle ? handleOffsetDeltaX : 0);
      const newHandleInOffsetY =
        this.originalHandleInOffsetY + (this.hasIncomingHandle ? handleOffsetDeltaY : 0);
      const newHandleOutOffsetX =
        this.originalHandleOutOffsetX + (this.hasOutgoingHandle ? handleOffsetDeltaX : 0);
      const newHandleOutOffsetY =
        this.originalHandleOutOffsetY + (this.hasOutgoingHandle ? handleOffsetDeltaY : 0);

      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: round(this.originalHalfWidth),
        nudge: round(newNudge),
        handleInOffsetX: round(newHandleInOffsetX),
        handleInOffsetY: round(newHandleInOffsetY),
        handleOutOffsetX: round(newHandleOutOffsetX),
        handleOutOffsetY: round(newHandleOutOffsetY),
        isInterpolation: true,
      };
    },
    getRollback() {
      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: Math.round(this.originalHalfWidth),
        nudge: Math.round(this.originalNudge),
        handleInOffsetX: Math.round(this.originalHandleInOffsetX),
        handleInOffsetY: Math.round(this.originalHandleInOffsetY),
        handleOutOffsetX: Math.round(this.originalHandleOutOffsetX),
        handleOutOffsetY: Math.round(this.originalHandleOutOffsetY),
        isInterpolation: true,
      };
    },
  };

  const prevIdx =
    isClosed || pointIndex > 0 ? (pointIndex - 1 + points.length) % points.length : null;
  if (prevIdx !== null && points[prevIdx]?.type) {
    behavior.hasIncomingHandle = true;
    const dx = points[prevIdx].x - point.x;
    const dy = points[prevIdx].y - point.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      behavior.skeletonHandleInDir = { x: dx / len, y: dy / len };
    }
  }

  const nextIdx =
    isClosed || pointIndex < points.length - 1 ? (pointIndex + 1) % points.length : null;
  if (nextIdx !== null && points[nextIdx]?.type) {
    behavior.hasOutgoingHandle = true;
    const dx = points[nextIdx].x - point.x;
    const dy = points[nextIdx].y - point.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      behavior.skeletonHandleOutDir = { x: dx / len, y: dy / len };
    }
  }

  const handleInXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
  const handleInYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
  const handleOutXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
  const handleOutYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";
  const handleIn1DKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
  const handleOut1DKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";

  const has2DIn = point[handleInXKey] !== undefined || point[handleInYKey] !== undefined;
  const has2DOut = point[handleOutXKey] !== undefined || point[handleOutYKey] !== undefined;

  if (has2DIn) {
    behavior.originalHandleInOffsetX = point[handleInXKey] || 0;
    behavior.originalHandleInOffsetY = point[handleInYKey] || 0;
  } else if (point[handleIn1DKey]) {
    const dir = behavior.skeletonHandleInDir || behavior.tangent;
    behavior.originalHandleInOffsetX = dir.x * point[handleIn1DKey];
    behavior.originalHandleInOffsetY = dir.y * point[handleIn1DKey];
  }

  if (has2DOut) {
    behavior.originalHandleOutOffsetX = point[handleOutXKey] || 0;
    behavior.originalHandleOutOffsetY = point[handleOutYKey] || 0;
  } else if (point[handleOut1DKey]) {
    const dir = behavior.skeletonHandleOutDir || behavior.tangent;
    behavior.originalHandleOutOffsetX = dir.x * point[handleOut1DKey];
    behavior.originalHandleOutOffsetY = dir.y * point[handleOut1DKey];
  }

  behavior._recalculateRibPos();

  const prevHandle = behavior.interpolationAxis?.prevHandle || null;
  const nextHandle = behavior.interpolationAxis?.nextHandle || null;
  const segmentAnchor = behavior.interpolationAxis?.segmentAnchor || null;
  let lineStart = behavior.interpolationAxis?.lineStart || null;
  let lineEnd = behavior.interpolationAxis?.lineEnd || null;

  if (!lineStart || !lineEnd) {
    if (prevHandle && nextHandle) {
      lineStart = prevHandle;
      lineEnd = nextHandle;
    } else if (prevHandle || nextHandle) {
      lineStart = segmentAnchor || behavior.originalRibPos;
      lineEnd = prevHandle || nextHandle;
    }
  }

  if (!lineStart || !lineEnd) {
    lineStart = behavior.originalRibPos;
    lineEnd = {
      x: behavior.originalRibPos.x + behavior.tangent.x,
      y: behavior.originalRibPos.y + behavior.tangent.y,
    };
  }

  behavior.hasIncomingHandle = behavior.interpolationAxis?.hasPrevHandle ?? behavior.hasIncomingHandle;
  behavior.hasOutgoingHandle = behavior.interpolationAxis?.hasNextHandle ?? behavior.hasOutgoingHandle;

  behavior.lineDir = {
    x: lineEnd.x - lineStart.x,
    y: lineEnd.y - lineStart.y,
  };
  behavior.lineLength = Math.hypot(behavior.lineDir.x, behavior.lineDir.y);
  if (behavior.lineLength > 0.001) {
    behavior.lineDir.x /= behavior.lineLength;
    behavior.lineDir.y /= behavior.lineLength;
  } else {
    behavior.lineDir = { ...behavior.tangent };
    behavior.lineLength = 1;
  }

  return behavior;
}

export function createEditableHandleBehavior(skeletonData, handleInfo, skeletonHandleDir) {
  const contourIndex = handleInfo.skeletonContourIndex;
  const pointIndex = handleInfo.skeletonPointIndex;
  const side = handleInfo.side;
  const handleType = handleInfo.handleType;
  const roundFunc = handleInfo.roundFunc || Math.round;

  const contour = skeletonData.contours[contourIndex];
  const point = contour.points[pointIndex];

  const offsetKey =
    side === "left"
      ? handleType === "in"
        ? "leftHandleInOffset"
        : "leftHandleOutOffset"
      : handleType === "in"
        ? "rightHandleInOffset"
        : "rightHandleOutOffset";

  const offsetXKey =
    side === "left"
      ? handleType === "in"
        ? "leftHandleInOffsetX"
        : "leftHandleOutOffsetX"
      : handleType === "in"
        ? "rightHandleInOffsetX"
        : "rightHandleOutOffsetX";
  const offsetYKey =
    side === "left"
      ? handleType === "in"
        ? "leftHandleInOffsetY"
        : "leftHandleOutOffsetY"
      : handleType === "in"
        ? "rightHandleInOffsetY"
        : "rightHandleOutOffsetY";

  const has2D = point[offsetXKey] !== undefined || point[offsetYKey] !== undefined;
  const originalOffset = has2D
    ? (point[offsetXKey] || 0) * skeletonHandleDir.x +
      (point[offsetYKey] || 0) * skeletonHandleDir.y
    : point[offsetKey] || 0;

  return {
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    handleType,
    skeletonHandleDir,
    roundFunc,
    offsetKey,
    originalOffset,
    applyDelta(delta, round = this.roundFunc) {
      const projectedDelta = delta.x * this.skeletonHandleDir.x + delta.y * this.skeletonHandleDir.y;
      const newOffset = this.originalOffset + projectedDelta;

      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        handleType: this.handleType,
        offset: round(newOffset),
      };
    },
    getRollback() {
      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        handleType: this.handleType,
        offset: Math.round(this.originalOffset),
      };
    },
  };
}

export function findEqualizeHandleForPath(positionedGlyph, point, size) {
  if (!positionedGlyph?.glyph?.path) {
    return null;
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  const path = positionedGlyph.glyph.path;
  const pointIndex = path.pointIndexNearPoint(glyphPoint, size);
  if (pointIndex === undefined) return null;

  return getEqualizeHandleInfoForPointIndex(path, pointIndex);
}

export function getEqualizeHandleInfoForPointIndex(path, pointIndex) {
  if (!path || pointIndex === undefined || pointIndex < 0) {
    return null;
  }

  const pointType = path.pointTypes[pointIndex];
  const pointTypeBase = pointType & VarPackedPath.POINT_TYPE_MASK;
  const isOnCurve = pointTypeBase === VarPackedPath.ON_CURVE;
  if (isOnCurve || pointTypeBase !== VarPackedPath.OFF_CURVE_CUBIC) {
    return null;
  }

  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
  const numContourPoints = path.getNumPointsOfContour(contourIndex);
  const contourStart = pointIndex - contourPointIndex;
  const contourEnd = contourStart + numContourPoints; // exclusive

  const getPrevIdx = (idx) => (idx > contourStart ? idx - 1 : contourEnd - 1);
  const getNextIdx = (idx) => (idx < contourEnd - 1 ? idx + 1 : contourStart);

  const prevIdx = getPrevIdx(pointIndex);
  const nextIdx = getNextIdx(pointIndex);

  const prevType = path.pointTypes[prevIdx] & VarPackedPath.POINT_TYPE_MASK;
  const nextType = path.pointTypes[nextIdx] & VarPackedPath.POINT_TYPE_MASK;
  const prevIsOnCurve = prevType === VarPackedPath.ON_CURVE;
  const nextIsOnCurve = nextType === VarPackedPath.ON_CURVE;

  let smoothIndex = null;
  let oppositeIndex = null;

  if (prevIsOnCurve) {
    const prevIsSmooth = (path.pointTypes[prevIdx] & VarPackedPath.SMOOTH_FLAG) !== 0;
    const oppositeIdx = getPrevIdx(prevIdx);
    const oppositeType = path.pointTypes[oppositeIdx] & VarPackedPath.POINT_TYPE_MASK;
    if (prevIsSmooth && oppositeType === VarPackedPath.OFF_CURVE_CUBIC) {
      smoothIndex = prevIdx;
      oppositeIndex = oppositeIdx;
    }
  }

  if (smoothIndex === null && nextIsOnCurve) {
    const nextIsSmooth = (path.pointTypes[nextIdx] & VarPackedPath.SMOOTH_FLAG) !== 0;
    const oppositeIdx = getNextIdx(nextIdx);
    const oppositeType = path.pointTypes[oppositeIdx] & VarPackedPath.POINT_TYPE_MASK;
    if (nextIsSmooth && oppositeType === VarPackedPath.OFF_CURVE_CUBIC) {
      smoothIndex = nextIdx;
      oppositeIndex = oppositeIdx;
    }
  }

  if (smoothIndex === null || oppositeIndex === null) {
    return null;
  }

  return { pointIndex, smoothIndex, oppositeIndex };
}

export function makeEqualizeDragChanges(
  path,
  equalizeHandleInfo,
  currentGlyphPoint,
  shiftKey
) {
  if (!path || !equalizeHandleInfo || !currentGlyphPoint) {
    return null;
  }

  const { pointIndex, smoothIndex, oppositeIndex } = equalizeHandleInfo;
  const smoothPt = path.getPoint(smoothIndex);
  if (!smoothPt) {
    return null;
  }

  let newDragVec = {
    x: currentGlyphPoint.x - smoothPt.x,
    y: currentGlyphPoint.y - smoothPt.y,
  };
  if (shiftKey) {
    newDragVec = constrainHorVerDiag(newDragVec);
  }
  const newDragLen = Math.hypot(newDragVec.x, newDragVec.y);
  if (newDragLen < 1) {
    return null;
  }

  const newDragPos = {
    x: Math.round(smoothPt.x + newDragVec.x),
    y: Math.round(smoothPt.y + newDragVec.y),
  };
  const newOppPos = {
    x: Math.round(smoothPt.x - newDragVec.x),
    y: Math.round(smoothPt.y - newDragVec.y),
  };

  return [
    { f: "=xy", a: [pointIndex, newDragPos.x, newDragPos.y] },
    { f: "=xy", a: [oppositeIndex, newOppPos.x, newOppPos.y] },
  ];
}
