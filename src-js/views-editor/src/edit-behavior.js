import { consolidateChanges } from "@fontra/core/changes.js";
import { polygonIsConvex } from "@fontra/core/convex-hull.js";
import {
  Transform,
  decomposedToTransform,
  prependTransformToDecomposed,
} from "@fontra/core/transform.js";
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
      let behaviorType = getBehaviorPreset("regular", behaviorName);
      if (!behaviorType) {
        console.log(`invalid behavior name: "${behaviorName}"`);
        behaviorType = getBehaviorPreset("regular", "default");
      }
      if (this.enableScalingEdit && behaviorType.canDoScalingEdit) {
        behaviorType = { ...behaviorType, enableScalingEdit: true };
      }
      behavior = new EditBehavior(
        this.contours,
        this.components,
        this.anchors,
        this.guidelines,
        this.backgroundImage,
        this.componentOriginIndices,
        this.componentTCenterIndices,
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
    behavior,
    doFullTransform
  ) {
    this.doFullTransform = doFullTransform;
    //// grid
    this.roundFunc = makeRoundFunc();
    this.constrainDelta = behavior.constrainDelta || ((v) => v);
    const [pointEditFuncs, participatingPointIndices] = makePointEditFuncs(
      contours,
      behavior
    );
    this.pointEditFuncs = pointEditFuncs;

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
    const pathChanges = this.pointEditFuncs
      ?.map((editFunc) => {
        const result = editFunc(transform);
        if (result) {
          const [pointIndex, x, y] = result;
          return makePointChange(pointIndex, this.roundFunc(x), this.roundFunc(y));
        }
      })
      .filter((change) => change);
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

function makePointEditFuncs(contours, behavior) {
  const pointEditFuncs = [];
  const participatingPointIndices = new Array(contours.length);
  for (let contourIndex = 0; contourIndex < contours.length; contourIndex++) {
    const contour = contours[contourIndex];
    if (!contour) {
      continue;
    }
    const [editFuncs, pointIndices] = makeContourPointEditFuncs(contour, behavior);
    pointEditFuncs.push(...editFuncs);
    participatingPointIndices[contourIndex] = pointIndices;
  }
  return [pointEditFuncs, participatingPointIndices];
}

function makeContourPointEditFuncs(contour, behavior) {
  const startIndex = contour.startIndex;
  const originalPoints = contour.points;
  const editPoints = Array.from(originalPoints); // will be modified
  const additionalEditPoints = Array.from(originalPoints); // will be modified
  const numPoints = originalPoints.length;
  let participatingPointIndices = [];
  const editFuncsTransform = [];
  const editFuncsConstrain = [];

  // console.log("------");
  for (let i = 0; i < numPoints; i++) {
    const [match, neighborIndices] = findPointMatch(
      behavior.matchTree,
      i,
      originalPoints,
      numPoints,
      contour.isClosed
    );
    if (match === undefined) {
      continue;
    }
    // console.log(i, match.action, match.ruleIndex);
    const [prevPrevPrev, prevPrev, prev, thePoint, next, nextNext, nextNextNext] =
      match.direction > 0 ? neighborIndices : reversed(neighborIndices);
    participatingPointIndices.push(thePoint);
    const actionFunctionFactory = behavior.actions[match.action];
    if (actionFunctionFactory === undefined) {
      console.log(`Undefined action function: ${match.action}`);
      continue;
    }
    const actionFunc = actionFunctionFactory(
      originalPoints[prevPrevPrev],
      originalPoints[prevPrev],
      originalPoints[prev],
      originalPoints[thePoint],
      originalPoints[next],
      originalPoints[nextNext]
    );
    if (!match.constrain) {
      // transform
      editFuncsTransform.push((transform) => {
        const point = actionFunc(
          transform,
          originalPoints[prevPrevPrev],
          originalPoints[prevPrev],
          originalPoints[prev],
          originalPoints[thePoint],
          originalPoints[next],
          originalPoints[nextNext]
        );
        editPoints[thePoint] = point;
        additionalEditPoints[thePoint] = point;
        return [thePoint + startIndex, point.x, point.y];
      });
    } else {
      // constrain
      editFuncsConstrain.push((transform) => {
        const point = actionFunc(
          transform,
          editPoints[prevPrevPrev],
          editPoints[prevPrev],
          editPoints[prev],
          editPoints[thePoint],
          editPoints[next],
          editPoints[nextNext]
        );
        additionalEditPoints[thePoint] = point;
        return [thePoint + startIndex, point.x, point.y];
      });
    }
  }

  let conditionFunc, segmentFunc;
  if (behavior.enableScalingEdit) {
    segmentFunc = makeSegmentScalingEditFuncs;
    conditionFunc = (segment, points) =>
      segment.length >= 4 &&
      (points[segment[0]].selected || points[segment.at(-1)].selected) &&
      segment.slice(1, -1).every((i) => !points[i].selected);
  } else {
    segmentFunc = makeSegmentFloatingOffCurveEditFuncs;
    conditionFunc = (segment, points) =>
      segment.length >= 5 &&
      points[segment[0]].selected &&
      points[segment.at(-1)].selected &&
      segment.slice(1, -1).every((i) => !points[i].selected);
  }

  const [additionalEditFuncs, additionalPointIndices] = makeAdditionalEditFuncs(
    contour,
    additionalEditPoints,
    conditionFunc,
    segmentFunc
  );
  if (additionalPointIndices.length) {
    participatingPointIndices = [
      ...new Set([...participatingPointIndices, ...additionalPointIndices]),
    ].sort((a, b) => a - b);
  }
  return [
    [...editFuncsTransform, ...editFuncsConstrain, ...additionalEditFuncs],
    participatingPointIndices,
  ];
}

function makeAdditionalEditFuncs(contour, editPoints, conditionFunc, segmentFunc) {
  const points = contour.points;
  const editFuncs = [];
  const participatingPointIndices = [];
  for (const segment of iterSegmentPointIndices(points, contour.isClosed)) {
    if (!conditionFunc(segment, points)) {
      continue;
    }
    const [segmentEditFunc, pointIndices] = segmentFunc(segment, contour, editPoints);
    editFuncs.push(...segmentEditFunc);
    participatingPointIndices.push(...pointIndices);
  }
  return [editFuncs, participatingPointIndices];
}

function makeSegmentFloatingOffCurveEditFuncs(segment, contour, editPoints) {
  const originalPoints = contour.points;
  const startIndex = contour.startIndex;
  const editFuncs = [];
  const pointIndices = [];

  for (const i of segment.slice(2, -2)) {
    pointIndices.push(i);
    editFuncs.push((transform) => {
      const point = transform.constrained(originalPoints[i]);
      return [i + startIndex, point.x, point.y];
    });
  }
  return [editFuncs, pointIndices];
}

function makeSegmentScalingEditFuncs(segment, contour, editPoints) {
  const originalPoints = contour.points;
  const startIndex = contour.startIndex;
  const editFuncs = [];
  const pointIndices = [];
  const A = makeSegmentTransform(originalPoints, segment, false);
  const Ainv = A?.inverse();

  if (A && Ainv) {
    let T;
    editFuncs.push((transform) => {
      const B = makeSegmentTransform(editPoints, segment, true);
      T = B?.transform(Ainv);
    });
    for (const i of segment.slice(1, -1)) {
      pointIndices.push(i);
      editFuncs.push((transform) => {
        let point;
        if (T) {
          point = T.transformPointObject(originalPoints[i]);
        } else {
          point = editPoints[i];
        }
        return [i + startIndex, point.x, point.y];
      });
    }
  }
  return [editFuncs, pointIndices];
}

function makeSegmentTransform(points, pointIndices, allowConcave) {
  const pt0 = points[pointIndices[0]];
  const pt1 = points[pointIndices[1]];
  const pt2 = points[pointIndices.at(-2)];
  const pt3 = points[pointIndices.at(-1)];
  if (!allowConcave && !polygonIsConvex([pt0, pt1, pt2, pt3])) {
    return;
  }
  const intersection = vector.intersect(pt0, pt1, pt2, pt3);
  if (!intersection) {
    return undefined;
  }
  const v1 = vector.subVectors(intersection, pt0);
  const v2 = vector.subVectors(pt3, intersection);
  return new Transform(v1.x, v1.y, v2.x, v2.y, pt0.x, pt0.y);
}

function* iterSegmentPointIndices(originalPoints, isClosed) {
  const lastPointIndex = originalPoints.length - 1;
  const firstOnCurve = findFirstOnCurvePoint(originalPoints, isClosed);
  if (firstOnCurve === undefined) {
    return;
  }
  let currentOnCurve = firstOnCurve;
  while (true) {
    const indices = [
      ...iterUntilNextOnCurvePoint(originalPoints, currentOnCurve, isClosed),
    ];
    if (!indices.length) {
      break;
    }
    yield indices;
    currentOnCurve = indices.at(-1);
    if (
      (isClosed && currentOnCurve == firstOnCurve) ||
      (!isClosed && currentOnCurve == lastPointIndex)
    ) {
      break;
    }
  }
}

function findFirstOnCurvePoint(points, isClosed) {
  const numPoints = points.length;
  for (let i = 0; i < numPoints; i++) {
    if (!points[i].type) {
      return i;
    }
  }
  return undefined;
}

function* iterUntilNextOnCurvePoint(points, startIndex, isClosed) {
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

// Central behavior hub for pointer object kinds.
// Step 7.5: introduce shared lookup tables only (wiring follows in Step 7.6).
const REGULAR_BEHAVIOR_PRESETS = behaviorTypes;

export const BEHAVIOR_TABLES = {
  regular: REGULAR_BEHAVIOR_PRESETS,
  // Skeleton currently mirrors regular presets.
  // If skeleton-specific deltas are needed later, override only those entries.
  skeleton: REGULAR_BEHAVIOR_PRESETS,
  // Rib points intentionally expose a reduced preset surface.
  rib: {
    default: REGULAR_BEHAVIOR_PRESETS.default,
    constrain: REGULAR_BEHAVIOR_PRESETS.constrain,
  },
};

const MODIFIER_FLAG_KEYS = Object.freeze(["shift", "alt", "z", "x"]);
const OBJECT_KINDS = Object.freeze(["regular", "skeleton", "rib"]);
const MODALITIES = Object.freeze(["drag", "nudge"]);

const INTENT_PRIORITY_BY_KIND = Object.freeze({
  regular: Object.freeze([
    Object.freeze({ intent: "alternate-constrain", requireAll: Object.freeze(["alt", "shift"]) }),
    Object.freeze({ intent: "alternate", requireAll: Object.freeze(["alt"]) }),
    Object.freeze({ intent: "constrain", requireAll: Object.freeze(["shift"]) }),
    Object.freeze({ intent: "default", requireAll: Object.freeze([]) }),
  ]),
  skeleton: Object.freeze([
    Object.freeze({ intent: "alternate-constrain", requireAll: Object.freeze(["alt", "shift"]) }),
    Object.freeze({ intent: "alternate", requireAll: Object.freeze(["alt"]) }),
    Object.freeze({ intent: "constrain", requireAll: Object.freeze(["shift"]) }),
    Object.freeze({ intent: "default", requireAll: Object.freeze([]) }),
  ]),
  rib: Object.freeze([
    Object.freeze({ intent: "equalize", requireAll: Object.freeze(["x"]) }),
    Object.freeze({ intent: "interpolate", requireAll: Object.freeze(["alt"]) }),
    Object.freeze({ intent: "tangent", requireAll: Object.freeze(["z"]) }),
    Object.freeze({ intent: "default", requireAll: Object.freeze([]) }),
  ]),
});

const MODIFIER_SPEC = Object.freeze({
  regular: Object.freeze({
    drag: Object.freeze({
      semanticFlags: Object.freeze(["shift", "alt"]),
      passiveFlags: Object.freeze(["z", "x"]),
      unsupportedFlags: Object.freeze([]),
      presetByIntent: Object.freeze({
        default: "default",
        constrain: "constrain",
        alternate: "alternate",
        "alternate-constrain": "alternate-constrain",
      }),
    }),
    nudge: Object.freeze({
      semanticFlags: Object.freeze(["alt"]),
      // Shift affects step magnitude in pointer, not behavior semantics.
      passiveFlags: Object.freeze(["shift", "z", "x"]),
      unsupportedFlags: Object.freeze([]),
      presetByIntent: Object.freeze({
        default: "default",
        constrain: "default",
        alternate: "alternate",
        "alternate-constrain": "alternate",
      }),
    }),
  }),
  skeleton: Object.freeze({
    drag: Object.freeze({
      semanticFlags: Object.freeze(["shift", "alt"]),
      passiveFlags: Object.freeze(["z", "x"]),
      unsupportedFlags: Object.freeze([]),
      presetByIntent: Object.freeze({
        default: "default",
        constrain: "constrain",
        alternate: "alternate",
        "alternate-constrain": "alternate-constrain",
      }),
    }),
    nudge: Object.freeze({
      semanticFlags: Object.freeze(["alt"]),
      passiveFlags: Object.freeze(["shift", "z", "x"]),
      unsupportedFlags: Object.freeze([]),
      presetByIntent: Object.freeze({
        default: "default",
        constrain: "default",
        alternate: "alternate",
        "alternate-constrain": "alternate",
      }),
    }),
  }),
  rib: Object.freeze({
    drag: Object.freeze({
      semanticFlags: Object.freeze(["alt", "z", "x"]),
      passiveFlags: Object.freeze(["shift"]),
      unsupportedFlags: Object.freeze([]),
      planByIntent: Object.freeze({
        default: Object.freeze({ useInterpolationBehavior: false }),
        tangent: Object.freeze({ useInterpolationBehavior: false }),
        interpolate: Object.freeze({ useInterpolationBehavior: true }),
        // Equalize currently follows interpolation motion policy for rib points.
        // The distinction is carried in intent so execution can diverge later without pointer rewiring.
        equalize: Object.freeze({ useInterpolationBehavior: true }),
      }),
    }),
    nudge: Object.freeze({
      semanticFlags: Object.freeze(["alt", "z", "x"]),
      passiveFlags: Object.freeze(["shift"]),
      unsupportedFlags: Object.freeze([]),
      planByIntent: Object.freeze({
        default: Object.freeze({ useInterpolationBehavior: false, constrainMode: null }),
        tangent: Object.freeze({ useInterpolationBehavior: false, constrainMode: "tangent" }),
        interpolate: Object.freeze({
          useInterpolationBehavior: true,
          constrainMode: null,
          fallbackConstrainWithoutInterpolationAxis: "tangent",
        }),
        equalize: Object.freeze({
          useInterpolationBehavior: true,
          constrainMode: null,
          fallbackConstrainWithoutInterpolationAxis: null,
        }),
      }),
    }),
  }),
});

function normalizeModifierFlags(flags = {}) {
  return {
    shift: !!(flags.shift || flags.shiftKey || flags.constrain),
    alt: !!(flags.alt || flags.altKey || flags.alternate || flags.interpolate),
    z: !!(flags.z || flags.zKey || flags.tangent),
    x: !!(flags.x || flags.xKey || flags.equalize),
  };
}

function getModifierSpec(objectKind = "regular", modality = "drag") {
  const kindSpec = MODIFIER_SPEC[objectKind] || MODIFIER_SPEC.regular;
  return kindSpec[modality] || kindSpec.drag;
}

function getIntentRules(objectKind = "regular") {
  return INTENT_PRIORITY_BY_KIND[objectKind] || INTENT_PRIORITY_BY_KIND.regular;
}

function getActiveFlagList(normalizedFlags = {}, flagList = []) {
  if (!normalizedFlags) {
    return [];
  }
  return flagList.filter((flagName) => !!normalizedFlags[flagName]);
}

function resolveModifierIntentFromNormalized(objectKind, normalizedFlags) {
  const rules = getIntentRules(objectKind);
  for (const rule of rules) {
    const matches = rule.requireAll.every((flagName) => !!normalizedFlags[flagName]);
    if (matches) {
      return rule.intent;
    }
  }
  return "default";
}

function validateModifierArchitectureCoverage() {
  for (const objectKind of OBJECT_KINDS) {
    const rules = getIntentRules(objectKind);
    if (!rules?.length) {
      throw new Error(`Missing intent rules for object kind "${objectKind}"`);
    }
    for (const modality of MODALITIES) {
      const spec = getModifierSpec(objectKind, modality);
      if (!spec) {
        throw new Error(`Missing modifier spec for ${objectKind}/${modality}`);
      }
      for (const flagName of MODIFIER_FLAG_KEYS) {
        const membershipCount =
          Number(spec.semanticFlags.includes(flagName)) +
          Number(spec.passiveFlags.includes(flagName)) +
          Number(spec.unsupportedFlags.includes(flagName));
        if (membershipCount !== 1) {
          throw new Error(
            `Modifier "${flagName}" must be classified exactly once for ${objectKind}/${modality}`
          );
        }
      }
      if (objectKind === "rib") {
        const planByIntent = spec.planByIntent || {};
        for (const rule of rules) {
          if (!planByIntent[rule.intent]) {
            throw new Error(
              `Missing rib plan mapping for intent "${rule.intent}" in ${objectKind}/${modality}`
            );
          }
        }
      } else {
        const presetByIntent = spec.presetByIntent || {};
        for (const rule of rules) {
          if (!presetByIntent[rule.intent]) {
            throw new Error(
              `Missing preset mapping for intent "${rule.intent}" in ${objectKind}/${modality}`
            );
          }
        }
      }
    }
  }
}

validateModifierArchitectureCoverage();

export function resolveBehaviorPresetName(flagsOrName) {
  if (typeof flagsOrName === "string" && flagsOrName) {
    return flagsOrName;
  }
  const normalizedFlags = normalizeModifierFlags(flagsOrName || {});
  return resolveModifierIntentFromNormalized("regular", normalizedFlags);
}

export function resolveModifierIntent(objectKind = "regular", flagsOrName = {}) {
  if (typeof flagsOrName === "string" && flagsOrName) {
    return flagsOrName;
  }
  const normalizedFlags = normalizeModifierFlags(flagsOrName || {});
  return resolveModifierIntentFromNormalized(objectKind, normalizedFlags);
}

function resolveRegularLikeModifierPlan(objectKind, modality, intent, normalizedFlags) {
  const spec = getModifierSpec(objectKind, modality);
  const presetName = spec.presetByIntent[intent] || spec.presetByIntent.default;
  const unsupportedModifiers = getActiveFlagList(normalizedFlags, spec.unsupportedFlags);
  const ignoredActiveModifiers = getActiveFlagList(normalizedFlags, spec.passiveFlags);
  return {
    objectKind,
    modality,
    intent,
    presetName,
    unsupportedModifiers,
    ignoredActiveModifiers,
  };
}

function resolveRibModifierPlan(modality, intent, normalizedFlags, context = {}) {
  const spec = getModifierSpec("rib", modality);
  const basePlan = spec.planByIntent[intent] || spec.planByIntent.default;
  const zActive = !!context.zActive;
  const hasInterpolationBehavior = context.hasInterpolationBehavior !== false;
  const useInterpolationBehavior = !!basePlan.useInterpolationBehavior;
  const fallbackConstrainWithoutInterpolationAxis =
    basePlan.fallbackConstrainWithoutInterpolationAxis || null;

  let constrainMode = basePlan.constrainMode || null;
  if (modality === "drag") {
    // Drag keeps the live-toggle contract for tangent constrain.
    constrainMode = zActive ? "tangent" : null;
  } else if (modality === "nudge" && useInterpolationBehavior && !hasInterpolationBehavior) {
    // Nudge fallback is intent-specific and comes from central plan mapping.
    constrainMode = fallbackConstrainWithoutInterpolationAxis;
  }

  return {
    objectKind: "rib",
    modality,
    intent,
    useInterpolationBehavior,
    constrainMode,
    unsupportedModifiers: getActiveFlagList(normalizedFlags, spec.unsupportedFlags),
    ignoredActiveModifiers: getActiveFlagList(normalizedFlags, spec.passiveFlags),
    // For mixed rib+skeleton drag, only default intent projects to base normal.
    shouldProjectToBaseNormal:
      modality === "drag" &&
      !!context.hasSkeletonSelection &&
      !useInterpolationBehavior &&
      constrainMode !== "tangent",
  };
}

export function resolveModifierPlan(
  objectKind = "regular",
  modality = "drag",
  flagsOrIntent = {},
  context = {}
) {
  const normalizedFlags =
    typeof flagsOrIntent === "string" ? null : normalizeModifierFlags(flagsOrIntent || {});
  const intent =
    typeof flagsOrIntent === "string"
      ? flagsOrIntent
      : resolveModifierIntentFromNormalized(objectKind, normalizedFlags);

  if (objectKind === "rib") {
    return resolveRibModifierPlan(modality, intent, normalizedFlags, context);
  }

  if (objectKind === "regular" || objectKind === "skeleton") {
    return resolveRegularLikeModifierPlan(objectKind, modality, intent, normalizedFlags);
  }

  return {
    objectKind,
    modality,
    intent,
    presetName: intent,
  };
}

export function getBehaviorPreset(objectKind = "regular", flagsOrName = "default") {
  const table = BEHAVIOR_TABLES[objectKind] || BEHAVIOR_TABLES.regular;
  const presetName = resolveBehaviorPresetName(flagsOrName);
  return table[presetName] || table.default || BEHAVIOR_TABLES.regular.default;
}

function buildMatchedEditEntry(points, match, neighborIndices) {
  // Direction controls neighbor ordering for the same logical rule.
  const [prevPrevPrev, prevPrev, prev, thePoint, next, nextNext] =
    match.direction > 0 ? neighborIndices : reversed(neighborIndices);

  const actionFactory = actionFactories[match.action];
  if (!actionFactory) {
    console.warn(`Unknown action: ${match.action}`);
    return null;
  }

  const actionFunc = actionFactory(
    points[prevPrevPrev],
    points[prevPrev],
    points[prev],
    points[thePoint],
    points[next],
    points[nextNext]
  );

  return {
    pointIndex: thePoint,
    neighborIndices: { prevPrevPrev, prevPrev, prev, thePoint, next, nextNext },
    constrain: match.constrain,
    actionFunc,
  };
}

function partitionTransformVsConstrain(editEntry, transformEntries, constrainEntries) {
  if (!editEntry.constrain) {
    transformEntries.push(editEntry);
  } else {
    constrainEntries.push(editEntry);
  }
}

function collectParticipatingIndices(participatingPointIndices, indices) {
  if (Array.isArray(indices)) {
    participatingPointIndices.push(...indices);
    return;
  }
  participatingPointIndices.push(indices);
}


/**
 * Skeleton and rib behavior adapters.
 * Consolidated from skeleton-edit-behavior.js (Step 7.7).
 */
export class SkeletonEditBehavior {
  constructor(
    skeletonData,
    contourIndex,
    selectedPointIndices,
    behaviorName = "default",
    enableScalingEdit = false,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.contour = skeletonData.contours[contourIndex];
    this.points = this.contour.points;
    this.isClosed = this.contour.isClosed;
    this.selectedIndices = new Set(selectedPointIndices);

    // Pull preset from the central behavior hub so regular/skeleton selection
    // resolves modifiers through one source of truth.
    const behavior = getBehaviorPreset("skeleton", behaviorName);
    this.matchTree = behavior.matchTree;
    this.constrainDelta = behavior.constrainDelta || ((v) => v);
    this.enableScalingEdit = enableScalingEdit;
    this.roundFunc = roundFunc;

    // Mark selected points
    this._preparePoints();

    // Build edit functions for each point
    this.editFuncs = this._buildEditFuncs();

    // Store original positions for rollback
    this.originalPositions = this.points.map((p) => ({ x: p.x, y: p.y }));
  }

  _preparePoints() {
    // Add 'selected' flag to points for findPointMatch
    for (let i = 0; i < this.points.length; i++) {
      this.points[i].selected = this.selectedIndices.has(i);
    }
  }

  _buildEditFuncs() {
    const editFuncsTransform = [];
    const editFuncsConstrain = [];
    const numPoints = this.points.length;
    const participatingPointIndices = [];

    for (let i = 0; i < numPoints; i++) {
      const [match, neighborIndices] = findPointMatch(
        this.matchTree,
        i,
        this.points,
        numPoints,
        this.isClosed
      );

      if (!match) continue;

      const editEntry = buildMatchedEditEntry(this.points, match, neighborIndices);
      if (!editEntry) {
        continue;
      }

      collectParticipatingIndices(participatingPointIndices, editEntry.pointIndex);
      partitionTransformVsConstrain(editEntry, editFuncsTransform, editFuncsConstrain);
    }

    // Add segment-based additional edit funcs (for interpolation)
    const additionalEditFuncs = this._makeAdditionalEditFuncs(participatingPointIndices);

    // Transform (non-constrain) first, then constrain, then additional
    return [...editFuncsTransform, ...editFuncsConstrain, ...additionalEditFuncs];
  }

  /**
   * Create additional edit functions for segments.
   * This handles floating off-curve points and scaling edits.
   */
  _makeAdditionalEditFuncs(participatingPointIndices) {
    const additionalFuncs = [];
    const points = this.points;

    // Determine condition and segment func based on scaling mode
    let conditionFunc, segmentFunc;
    if (this.enableScalingEdit) {
      segmentFunc = this._makeSegmentScalingEditFuncs.bind(this);
      conditionFunc = (segment) =>
        segment.length >= 4 &&
        (points[segment[0]].selected || points[segment.at(-1)].selected) &&
        segment.slice(1, -1).every((i) => !points[i].selected);
    } else {
      segmentFunc = this._makeSegmentFloatingOffCurveEditFuncs.bind(this);
      conditionFunc = (segment) =>
        segment.length >= 5 &&
        points[segment[0]].selected &&
        points[segment.at(-1)].selected &&
        segment.slice(1, -1).every((i) => !points[i].selected);
    }

    for (const segment of this._iterSegmentPointIndices()) {
      if (!conditionFunc(segment)) continue;
      const [editFuncs, indices] = segmentFunc(segment);
      additionalFuncs.push(...editFuncs);
      collectParticipatingIndices(participatingPointIndices, indices);
    }

    return additionalFuncs;
  }

  /**
   * Iterate over segments (on-curve to on-curve point spans)
   */
  *_iterSegmentPointIndices() {
    const points = this.points;
    const lastPointIndex = points.length - 1;
    const firstOnCurve = this._findFirstOnCurvePoint();
    if (firstOnCurve === undefined) {
      return;
    }
    let currentOnCurve = firstOnCurve;
    while (true) {
      const indices = [...this._iterUntilNextOnCurvePoint(currentOnCurve)];
      if (!indices.length) {
        break;
      }
      yield indices;
      currentOnCurve = indices.at(-1);
      if (
        (this.isClosed && currentOnCurve === firstOnCurve) ||
        (!this.isClosed && currentOnCurve === lastPointIndex)
      ) {
        break;
      }
    }
  }

  _findFirstOnCurvePoint() {
    const numPoints = this.points.length;
    for (let i = 0; i < numPoints; i++) {
      if (!this.points[i].type) {
        return i;
      }
    }
    return undefined;
  }

  *_iterUntilNextOnCurvePoint(startIndex) {
    yield startIndex;
    const numPoints = this.points.length;
    for (let i = startIndex + 1; i < numPoints; i++) {
      yield i;
      if (!this.points[i].type) {
        return;
      }
    }
    if (!this.isClosed || !startIndex) {
      return;
    }
    for (let i = 0; i < startIndex; i++) {
      yield i;
      if (!this.points[i].type) {
        return;
      }
    }
  }

  /**
   * Create edit functions for floating off-curve points between two selected on-curves.
   * These off-curves should move with the transform.
   */
  _makeSegmentFloatingOffCurveEditFuncs(segment) {
    const originalPoints = this.points;
    const editFuncs = [];
    const pointIndices = [];

    // segment.slice(2, -2) gets the "floating" off-curves (not the handles adjacent to endpoints)
    for (const i of segment.slice(2, -2)) {
      pointIndices.push(i);
      const pointIndex = i;
      editFuncs.push({
        pointIndex,
        neighborIndices: { thePoint: pointIndex },
        constrain: false,
        // The actionFunc takes transform and returns new point position
        actionFunc: (transform) => transform.constrained(originalPoints[pointIndex]),
        isAdditional: true,
      });
    }
    return [editFuncs, pointIndices];
  }

  /**
   * Create edit functions for scaling a segment proportionally.
   * When endpoints move, scale internal off-curves proportionally.
   */
  _makeSegmentScalingEditFuncs(segment) {
    const originalPoints = this.points;
    const editFuncs = [];
    const pointIndices = [];

    // Calculate original transform based on segment endpoints and their handles
    const A = this._makeSegmentTransform(originalPoints, segment, false);
    const Ainv = A?.inverse();

    if (A && Ainv) {
      // Shared state for transform calculation
      let T = null;

      // First entry calculates the new transform based on edited endpoint positions
      editFuncs.push({
        pointIndex: -1, // Marker for transform calculation
        neighborIndices: {},
        constrain: false,
        actionFunc: (transform, editedPoints) => {
          const B = this._makeSegmentTransform(editedPoints, segment, true);
          T = B?.transform(Ainv);
          return null; // Don't actually move any point
        },
        isTransformCalculation: true,
      });

      // Then create edit funcs for each internal point
      for (const i of segment.slice(1, -1)) {
        pointIndices.push(i);
        const pointIndex = i;
        editFuncs.push({
          pointIndex,
          neighborIndices: { thePoint: pointIndex },
          constrain: false,
          actionFunc: (transform, editedPoints) => {
            if (T) {
              return T.transformPointObject(originalPoints[pointIndex]);
            }
            return editedPoints ? editedPoints[pointIndex] : originalPoints[pointIndex];
          },
          isAdditional: true,
        });
      }
    }
    return [editFuncs, pointIndices];
  }

  /**
   * Create a transform matrix from segment endpoint and handle positions.
   */
  _makeSegmentTransform(points, pointIndices, allowConcave) {
    const pt0 = points[pointIndices[0]];
    const pt1 = points[pointIndices[1]];
    const pt2 = points[pointIndices.at(-2)];
    const pt3 = points[pointIndices.at(-1)];
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

  /**
   * Apply a delta to all affected points
   * Returns array of { pointIndex, x, y } for changed points
   */
  applyDelta(delta, roundFunc = this.roundFunc) {
    const editedPoints = [...this.points]; // Copy for mutation
    const changes = [];

    // Create transform object matching edit-behavior.js interface
    const constrainedDelta = this.constrainDelta(delta);
    const transformConstrained = (point) => ({
      x: point.x + constrainedDelta.x,
      y: point.y + constrainedDelta.y,
    });
    const transformFree = (point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    });

    const transform = {
      constrained: transformConstrained,
      free: transformFree,
      constrainDelta: this.constrainDelta,
    };

    for (const editEntry of this.editFuncs) {
      const { pointIndex, neighborIndices, actionFunc, isAdditional, isTransformCalculation } =
        editEntry;

      let newPoint;
      if (isAdditional || isTransformCalculation) {
        // Additional edit funcs take (transform, editedPoints) directly
        newPoint = actionFunc(transform, editedPoints);
      } else {
        // Regular rule-based edit funcs take neighbor points as arguments
        const { prevPrevPrev, prevPrev, prev, thePoint, next, nextNext } = neighborIndices;
        newPoint = actionFunc(
          transform,
          editedPoints[prevPrevPrev],
          editedPoints[prevPrev],
          editedPoints[prev],
          editedPoints[thePoint],
          editedPoints[next],
          editedPoints[nextNext]
        );
      }

      // Skip transform calculation entries (they don't produce points)
      if (isTransformCalculation || newPoint === null) {
        continue;
      }

      // Update edited points for subsequent constrain actions
      editedPoints[pointIndex] = { ...this.points[pointIndex], ...newPoint };

      changes.push({
        pointIndex,
        x: roundFunc(newPoint.x),
        y: roundFunc(newPoint.y),
      });
    }

    return changes;
  }

  /**
   * Get rollback data to restore original positions
   */
  getRollback() {
    return this.editFuncs
      .filter(({ pointIndex, isTransformCalculation }) => pointIndex >= 0 && !isTransformCalculation)
      .map(({ pointIndex }) => ({
        pointIndex,
        x: this.originalPositions[pointIndex].x,
        y: this.originalPositions[pointIndex].y,
      }));
  }
}

/**
 * Create a SkeletonEditBehavior for the given selection
 */
export function createSkeletonEditBehavior(
  skeletonData,
  selectedSkeletonPoints,
  behaviorName = "default",
  roundFunc = Math.round
) {
  // Group selected points by contour
  const byContour = new Map();

  for (const selKey of selectedSkeletonPoints) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    if (!byContour.has(contourIdx)) {
      byContour.set(contourIdx, []);
    }
    byContour.get(contourIdx).push(pointIdx);
  }

  // Create behaviors for each contour
  const behaviors = [];
  for (const [contourIdx, pointIndices] of byContour) {
    if (contourIdx < skeletonData.contours.length) {
      behaviors.push(
        new SkeletonEditBehavior(
          skeletonData,
          contourIdx,
          pointIndices,
          behaviorName,
          false,
          roundFunc
        )
      );
    }
  }

  return behaviors;
}

/**
 * Helper to get behavior name from event modifiers.
 * Same logic as getBehaviorName in edit-tools-pointer.js
 */
export function getSkeletonBehaviorName(shiftKey, altKey) {
  return resolveModifierIntent("skeleton", { shift: shiftKey, alt: altKey });
}

function getContourPoint(skeletonData, contourIndex, pointIndex) {
  const contour = skeletonData.contours[contourIndex];
  const point = contour.points[pointIndex];
  return { contour, point };
}

function getContourDefaultWidth(contour) {
  return contour.defaultWidth || 20;
}

function getOriginalHalfWidth(point, contourDefaultWidth, side) {
  if (side === "left") {
    return point.leftWidth !== undefined
      ? point.leftWidth
      : point.width !== undefined
      ? point.width / 2
      : contourDefaultWidth / 2;
  }
  return point.rightWidth !== undefined
    ? point.rightWidth
    : point.width !== undefined
    ? point.width / 2
    : contourDefaultWidth / 2;
}

function getOriginalNudge(point, side) {
  return point[getRibNudgeKey(side)] || 0;
}

function buildTangentFromNormal(normal) {
  return { x: -normal.y, y: normal.x };
}

function projectDelta(delta, axis) {
  return delta.x * axis.x + delta.y * axis.y;
}

function projectToNormalSigned(delta, normal, side) {
  const sign = side === "left" ? 1 : -1;
  return sign * projectDelta(delta, normal);
}

function projectToTangent(delta, tangent) {
  return projectDelta(delta, tangent);
}

function clampHalfWidth(value, min = 0) {
  return value < min ? min : value;
}

export function getRibNudgeKey(side) {
  return side === "left" ? "leftNudge" : "rightNudge";
}

export function getHandleOffsetKeys(side, handleType) {
  const prefix = side === "left" ? "left" : "right";
  const stem = handleType === "in" ? "HandleInOffset" : "HandleOutOffset";
  return {
    oneD: `${prefix}${stem}`,
    x: `${prefix}${stem}X`,
    y: `${prefix}${stem}Y`,
  };
}

export function getRibHandleOffsetKeys(side) {
  return {
    in: getHandleOffsetKeys(side, "in"),
    out: getHandleOffsetKeys(side, "out"),
  };
}

export function getHandleDetachedKey(side) {
  return side === "left" ? "leftHandleDetached" : "rightHandleDetached";
}

function getSkeletonHandleDirections(points, pointIndex, isClosed = true) {
  let skeletonHandleInDir = null;
  let skeletonHandleOutDir = null;
  let hasIncomingHandle = false;
  let hasOutgoingHandle = false;

  const prevIdx = isClosed || pointIndex > 0 ? (pointIndex - 1 + points.length) % points.length : null;
  if (prevIdx !== null && points[prevIdx]?.type) {
    hasIncomingHandle = true;
    const dx = points[prevIdx].x - points[pointIndex].x;
    const dy = points[prevIdx].y - points[pointIndex].y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      skeletonHandleInDir = { x: dx / len, y: dy / len };
    }
  }

  const nextIdx = isClosed || pointIndex < points.length - 1 ? (pointIndex + 1) % points.length : null;
  if (nextIdx !== null && points[nextIdx]?.type) {
    hasOutgoingHandle = true;
    const dx = points[nextIdx].x - points[pointIndex].x;
    const dy = points[nextIdx].y - points[pointIndex].y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      skeletonHandleOutDir = { x: dx / len, y: dy / len };
    }
  }

  return {
    skeletonHandleInDir,
    skeletonHandleOutDir,
    hasIncomingHandle,
    hasOutgoingHandle,
  };
}

function readNormalizedHandleOffsets(point, side, dirs, tangent) {
  const handleKeys = getRibHandleOffsetKeys(side);
  const has2DIn = point[handleKeys.in.x] !== undefined || point[handleKeys.in.y] !== undefined;
  const has2DOut = point[handleKeys.out.x] !== undefined || point[handleKeys.out.y] !== undefined;
  const has1DIn = point[handleKeys.in.oneD] !== undefined;
  const has1DOut = point[handleKeys.out.oneD] !== undefined;

  let inX = 0;
  let inY = 0;
  let outX = 0;
  let outY = 0;

  if (has2DIn) {
    inX = point[handleKeys.in.x] || 0;
    inY = point[handleKeys.in.y] || 0;
  } else if (has1DIn) {
    const dir = dirs.skeletonHandleInDir || tangent;
    inX = dir.x * (point[handleKeys.in.oneD] || 0);
    inY = dir.y * (point[handleKeys.in.oneD] || 0);
  }

  if (has2DOut) {
    outX = point[handleKeys.out.x] || 0;
    outY = point[handleKeys.out.y] || 0;
  } else if (has1DOut) {
    const dir = dirs.skeletonHandleOutDir || tangent;
    outX = dir.x * (point[handleKeys.out.oneD] || 0);
    outY = dir.y * (point[handleKeys.out.oneD] || 0);
  }

  return {
    inX,
    inY,
    outX,
    outY,
    // Presence flags are based on contour topology, not on stored offset keys.
    // This allows compensation to work even when offset values were not explicitly serialized.
    hasIncomingHandle: !!dirs.hasIncomingHandle,
    hasOutgoingHandle: !!dirs.hasOutgoingHandle,
    hasAny: has2DIn || has2DOut || has1DIn || has1DOut,
  };
}

function buildCompensatedOffsets(baseOffsets, tangent, deltaNudge, hasIncomingHandle, hasOutgoingHandle) {
  const handleOffsetDeltaX = -tangent.x * deltaNudge;
  const handleOffsetDeltaY = -tangent.y * deltaNudge;
  return {
    inX: baseOffsets.inX + (hasIncomingHandle ? handleOffsetDeltaX : 0),
    inY: baseOffsets.inY + (hasIncomingHandle ? handleOffsetDeltaY : 0),
    outX: baseOffsets.outX + (hasOutgoingHandle ? handleOffsetDeltaX : 0),
    outY: baseOffsets.outY + (hasOutgoingHandle ? handleOffsetDeltaY : 0),
  };
}

const RIB_STRATEGY_BASIC_WIDTH = "basic-width";
const RIB_STRATEGY_EDITABLE_WIDTH_NUDGE = "editable-width-nudge";
const RIB_STRATEGY_INTERPOLATE = "interpolate";

function createRibRuntimeContext(context) {
  return {
    tangent: buildTangentFromNormal(context.normal),
    originalNudge: 0,
    minHalfWidth: 0,
    hasIncomingHandle: false,
    hasOutgoingHandle: false,
    originalHandleOffsets: { inX: 0, inY: 0, outX: 0, outY: 0 },
    ...context,
  };
}

function withRibIdentity(context, payload) {
  return {
    contourIndex: context.contourIndex,
    pointIndex: context.pointIndex,
    side: context.side,
    ...payload,
  };
}

function runRibStrategy(context, delta, strategy, options = {}) {
  const roundFunc = options.roundFunc || Math.round;
  const constrainMode = options.constrainMode || null;

  if (strategy === RIB_STRATEGY_BASIC_WIDTH) {
    const projectedDelta = projectToNormalSigned(delta, context.normal, context.side);
    const newHalfWidth = clampHalfWidth(
      context.originalHalfWidth + projectedDelta,
      context.minHalfWidth
    );
    return withRibIdentity(context, {
      halfWidth: roundFunc(newHalfWidth),
    });
  }

  if (strategy === RIB_STRATEGY_EDITABLE_WIDTH_NUDGE) {
    let newNudge = context.originalNudge;
    let newHalfWidth = context.originalHalfWidth;

    if (constrainMode === "tangent") {
      const tangentDelta = projectToTangent(delta, context.tangent);
      newNudge = context.originalNudge + tangentDelta;
    } else {
      const normalDelta = projectToNormalSigned(delta, context.normal, context.side);
      newHalfWidth = clampHalfWidth(
        context.originalHalfWidth + normalDelta,
        context.minHalfWidth
      );
    }

    return withRibIdentity(context, {
      halfWidth: roundFunc(newHalfWidth),
      nudge: roundFunc(newNudge),
    });
  }

  if (strategy === RIB_STRATEGY_INTERPOLATE) {
    const lineDir = context.lineDir || context.tangent;
    const deltaAlongLine = projectDelta(delta, lineDir);
    const lineDirDotTangent = projectDelta(lineDir, context.tangent);
    const deltaNudge = lineDirDotTangent * deltaAlongLine;
    const newNudge = context.originalNudge + deltaNudge;

    const compensatedOffsets = buildCompensatedOffsets(
      context.originalHandleOffsets,
      context.tangent,
      deltaNudge,
      context.hasIncomingHandle,
      context.hasOutgoingHandle
    );

    return withRibIdentity(context, {
      halfWidth: roundFunc(context.originalHalfWidth),
      nudge: roundFunc(newNudge),
      handleInOffsetX: roundFunc(compensatedOffsets.inX),
      handleInOffsetY: roundFunc(compensatedOffsets.inY),
      handleOutOffsetX: roundFunc(compensatedOffsets.outX),
      handleOutOffsetY: roundFunc(compensatedOffsets.outY),
      isInterpolation: true,
    });
  }

  throw new Error(`Unknown rib strategy: ${strategy}`);
}

const RIB_ROLLBACK_MODE = Object.freeze({
  BASIC: "basic",
  EDITABLE: "editable",
  INTERPOLATE: "interpolate",
});

function getRibRollbackHandleOffsets(context) {
  // Interpolation runtime stores normalized offsets as an object,
  // while editable rib behavior keeps legacy scalar fields.
  if (context.originalHandleOffsets) {
    return context.originalHandleOffsets;
  }
  return {
    inX: context.originalHandleInOffsetX,
    inY: context.originalHandleInOffsetY,
    outX: context.originalHandleOutOffsetX,
    outY: context.originalHandleOutOffsetY,
  };
}

function buildRibRollbackPayload(context, mode, extras = {}) {
  const payload = {
    contourIndex: context.contourIndex,
    pointIndex: context.pointIndex,
    side: context.side,
    halfWidth: Math.round(context.originalHalfWidth),
  };

  if (mode === RIB_ROLLBACK_MODE.BASIC) {
    return { ...payload, ...extras };
  }

  payload.nudge = Math.round(context.originalNudge);

  if (mode === RIB_ROLLBACK_MODE.EDITABLE) {
    // Keep payload parity: include 2D handle offsets only when they were present before drag.
    if (context.hasHandleOffsets) {
      const offsets = getRibRollbackHandleOffsets(context);
      payload.handleInOffsetX = Math.round(offsets.inX);
      payload.handleInOffsetY = Math.round(offsets.inY);
      payload.handleOutOffsetX = Math.round(offsets.outX);
      payload.handleOutOffsetY = Math.round(offsets.outY);
      payload.hasHandleOffsets = true;
    }
    return { ...payload, ...extras };
  }

  if (mode === RIB_ROLLBACK_MODE.INTERPOLATE) {
    // Interpolation rollback always restores full 2D handle offset state.
    const offsets = getRibRollbackHandleOffsets(context);
    payload.handleInOffsetX = Math.round(offsets.inX);
    payload.handleInOffsetY = Math.round(offsets.inY);
    payload.handleOutOffsetX = Math.round(offsets.outX);
    payload.handleOutOffsetY = Math.round(offsets.outY);
    payload.isInterpolation = true;
    return { ...payload, ...extras };
  }

  throw new Error(`Unknown rib rollback mode: ${mode}`);
}

function buildHandleRollbackPayload(context, extras = {}) {
  return {
    contourIndex: context.contourIndex,
    pointIndex: context.pointIndex,
    side: context.side,
    handleType: context.handleType,
    offset: Math.round(context.originalOffset),
    ...extras,
  };
}

/**
 * RibEditBehavior - Handles dragging of rib points (width control points).
 * Constrains movement to the normal direction and updates point width.
 */
export class RibEditBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the on-curve point
   * @param {string} side - "left" or "right"
   * @param {Object} normal - The normal vector at this point
   * @param {Object} onCurvePoint - The on-curve point position
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.onCurvePoint = onCurvePoint;
    this.roundFunc = roundFunc;

    const { contour, point } = getContourPoint(skeletonData, contourIndex, pointIndex);
    const defaultWidth = getContourDefaultWidth(contour);
    this.originalHalfWidth = getOriginalHalfWidth(point, defaultWidth, side);

    // Minimum half-width (allow collapse to skeleton)
    this.minHalfWidth = 0;
  }

  /**
   * Constrain drag delta to the normal direction.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} Constrained delta projected onto normal
   */
  constrainToNormal(delta) {
    // For left side, positive projection means wider
    // For right side, negative projection means wider
    const sign = this.side === "left" ? 1 : -1;
    const dot = projectDelta(delta, this.normal);
    return {
      x: sign * dot * this.normal.x,
      y: sign * dot * this.normal.y,
    };
  }

  /**
   * Apply drag delta and return the new half-width.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { halfWidth, widthChange } - New half-width and width change object
   */
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    const context = createRibRuntimeContext({
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      normal: this.normal,
      originalHalfWidth: this.originalHalfWidth,
      minHalfWidth: this.minHalfWidth,
    });
    return runRibStrategy(context, delta, RIB_STRATEGY_BASIC_WIDTH, { roundFunc });
  }

  /**
   * Get rollback data to restore original width.
   */
  getRollback() {
    return buildRibRollbackPayload(this, RIB_ROLLBACK_MODE.BASIC);
  }
}

/**
 * Create a RibEditBehavior for the given rib point hit.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} ribHit - Hit test result from _hitTestRibPoints
 * @returns {RibEditBehavior} The behavior instance
 */
export function createRibEditBehavior(skeletonData, ribHit) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new RibEditBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    ribHit.roundFunc || Math.round
  );
}

/**
 * EditableRibBehavior - Handles dragging of editable rib points.
 * - Width follows normal component by default.
 * - Nudge follows tangent only when constrained (e.g. Shift).
 * - Constrain modes can lock width or nudge.
 */
export class EditableRibBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the on-curve point
   * @param {string} side - "left" or "right"
   * @param {Object} normal - The normal vector at this point
   * @param {Object} onCurvePoint - The on-curve point position
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.tangent = buildTangentFromNormal(normal); // Perpendicular to normal
    this.onCurvePoint = onCurvePoint;
    this.roundFunc = roundFunc;

    const { contour, point } = getContourPoint(skeletonData, contourIndex, pointIndex);
    const points = contour.points;
    const defaultWidth = getContourDefaultWidth(contour);
    this.originalHalfWidth = getOriginalHalfWidth(point, defaultWidth, side);
    this.originalNudge = getOriginalNudge(point, side);

    // Minimum half-width (allow collapse to skeleton)
    this.minHalfWidth = 0;

    // Store original 2D handle offsets for compensation when nudge changes
    // This ensures handles stay in place when rib point moves
    this._initHandleOffsets(point, points, pointIndex, side);
  }

  /**
   * Initialize handle offset tracking for nudge compensation.
   */
  _initHandleOffsets(point, points, pointIndex, side) {
    const dirs = getSkeletonHandleDirections(points, pointIndex, true);
    this.skeletonHandleInDir = dirs.skeletonHandleInDir;
    this.skeletonHandleOutDir = dirs.skeletonHandleOutDir;

    const offsets = readNormalizedHandleOffsets(point, side, dirs, this.tangent);
    this.hasIncomingHandle = offsets.hasIncomingHandle;
    this.hasOutgoingHandle = offsets.hasOutgoingHandle;
    this.hasHandleOffsets = offsets.hasAny;
    this.originalHandleInOffsetX = offsets.inX;
    this.originalHandleInOffsetY = offsets.inY;
    this.originalHandleOutOffsetX = offsets.outX;
    this.originalHandleOutOffsetY = offsets.outY;
  }

  /**
   * Apply drag delta and return changes to width and nudge.
   * - With constrainMode: lock to tangent or normal direction
   * Also compensates 2D handle offsets when nudge changes to keep handles stationary.
   * @param {Object} delta - The drag delta {x, y}
   * @param {string|null} constrainMode - null (free), "tangent" (nudge only), or "normal" (width only)
   * @returns {Object} { halfWidth, nudge, handleInOffsetX/Y, handleOutOffsetX/Y }
   */
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    const context = createRibRuntimeContext({
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      normal: this.normal,
      tangent: this.tangent,
      originalHalfWidth: this.originalHalfWidth,
      originalNudge: this.originalNudge,
      minHalfWidth: this.minHalfWidth,
    });
    const result = runRibStrategy(
      context,
      delta,
      RIB_STRATEGY_EDITABLE_WIDTH_NUDGE,
      { constrainMode, roundFunc }
    );

    // Note: we don't compensate handle offsets here.
    // Handles should move WITH the rib point in normal drag mode.
    // Handle offset compensation (keeping handles stationary) is only done
    // in InterpolatingRibBehavior (Alt+drag).

    return result;
  }

  /**
   * Get rollback data to restore original width, nudge, and handle offsets.
   */
  getRollback() {
    return buildRibRollbackPayload(this, RIB_ROLLBACK_MODE.EDITABLE);
  }

  /**
   * Set the original half-width.
   * Use this for single-sided mode where halfWidth = totalWidth.
   */
  setOriginalHalfWidth(halfWidth) {
    this.originalHalfWidth = halfWidth;
  }
}

/**
 * Create an EditableRibBehavior for editable rib points.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} ribHit - Hit test result from _hitTestRibPoints
 * @returns {EditableRibBehavior} The behavior instance
 */
export function createEditableRibBehavior(skeletonData, ribHit) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new EditableRibBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    ribHit.roundFunc || Math.round
  );
}

/**
 * InterpolatingRibBehavior - Handles dragging of editable rib points with Alt key.
 * The rib point slides along an interpolation axis:
 * - two handles: line between handles
 * - one handle: line between segment anchor and handle
 * Handles remain fixed in place while the rib point moves between them.
 * Uses 2D handle offsets for precise compensation.
 */
export class InterpolatingRibBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the skeleton contour
   * @param {number} pointIndex - Index of the on-curve skeleton point
   * @param {string} side - "left" or "right"
   * @param {Object} normal - The normal vector at this point
   * @param {Object} onCurvePoint - The skeleton on-curve point position {x, y}
   * @param {Object|null} interpolationAxis - Axis data:
   *   { prevHandle, nextHandle, segmentAnchor, lineStart, lineEnd, hasPrevHandle, hasNextHandle }
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    interpolationAxis = null,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.tangent = buildTangentFromNormal(normal);
    this.onCurvePoint = onCurvePoint;
    this.interpolationAxis = interpolationAxis || null;
    this.roundFunc = roundFunc;

    const { contour, point } = getContourPoint(skeletonData, contourIndex, pointIndex);
    const points = contour.points;
    const isClosed = !!contour.isClosed;
    const defaultWidth = getContourDefaultWidth(contour);

    // Compute skeleton handle directions for 1D->2D conversion.
    // Handle-side presence is resolved by readNormalizedHandleOffsets.
    const dirs = getSkeletonHandleDirections(points, pointIndex, isClosed);
    this.skeletonHandleInDir = dirs.skeletonHandleInDir;
    this.skeletonHandleOutDir = dirs.skeletonHandleOutDir;

    this.originalHalfWidth = getOriginalHalfWidth(point, defaultWidth, side);
    this.originalNudge = getOriginalNudge(point, side);

    // Store normalized original handle offsets (2D), including 1D->2D conversion.
    const offsets = readNormalizedHandleOffsets(point, side, dirs, this.tangent);
    this.hasIncomingHandle = offsets.hasIncomingHandle;
    this.hasOutgoingHandle = offsets.hasOutgoingHandle;
    this.originalHandleInOffsetX = offsets.inX;
    this.originalHandleInOffsetY = offsets.inY;
    this.originalHandleOutOffsetX = offsets.outX;
    this.originalHandleOutOffsetY = offsets.outY;

    // Calculate current rib point position
    this._recalculateRibPos();

    // Choose interpolation axis.
    const prevHandle = this.interpolationAxis?.prevHandle || null;
    const nextHandle = this.interpolationAxis?.nextHandle || null;
    const segmentAnchor = this.interpolationAxis?.segmentAnchor || null;
    let lineStart = this.interpolationAxis?.lineStart || null;
    let lineEnd = this.interpolationAxis?.lineEnd || null;

    if (!lineStart || !lineEnd) {
      if (prevHandle && nextHandle) {
        lineStart = prevHandle;
        lineEnd = nextHandle;
      } else if (prevHandle || nextHandle) {
        lineStart = segmentAnchor || this.originalRibPos;
        lineEnd = prevHandle || nextHandle;
      }
    }

    if (!lineStart || !lineEnd) {
      lineStart = this.originalRibPos;
      lineEnd = {
        x: this.originalRibPos.x + this.tangent.x,
        y: this.originalRibPos.y + this.tangent.y,
      };
    }

    this.hasIncomingHandle =
      this.interpolationAxis?.hasPrevHandle ?? this.hasIncomingHandle;
    this.hasOutgoingHandle =
      this.interpolationAxis?.hasNextHandle ?? this.hasOutgoingHandle;

    // Calculate the line direction from selected axis endpoints.
    this.lineDir = {
      x: lineEnd.x - lineStart.x,
      y: lineEnd.y - lineStart.y,
    };
    this.lineLength = Math.hypot(this.lineDir.x, this.lineDir.y);

    if (this.lineLength > 0.001) {
      this.lineDir.x /= this.lineLength;
      this.lineDir.y /= this.lineLength;
    } else {
      this.lineDir = { ...this.tangent };
      this.lineLength = 1;
    }
  }

  /**
   * Recalculate the original rib point position based on current originalHalfWidth.
   * Call this after overriding originalHalfWidth for single-sided mode.
   */
  _recalculateRibPos() {
    const sign = this.side === "left" ? 1 : -1;
    this.originalRibPos = {
      x: this.onCurvePoint.x + sign * this.normal.x * this.originalHalfWidth + this.tangent.x * this.originalNudge,
      y: this.onCurvePoint.y + sign * this.normal.y * this.originalHalfWidth + this.tangent.y * this.originalNudge,
    };
  }

  /**
   * Set the original half-width and recalculate rib position.
   * Use this for single-sided mode where halfWidth = totalWidth.
   */
  setOriginalHalfWidth(halfWidth) {
    this.originalHalfWidth = halfWidth;
    this._recalculateRibPos();
  }

  /**
   * Apply drag delta and return changes to nudge and 2D handle offsets.
   * Movement is constrained to the line between handles.
   * Handles stay fixed by compensating with 2D offsets.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { nudge, handleInOffsetX/Y, handleOutOffsetX/Y, isInterpolation }
   */
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    const context = createRibRuntimeContext({
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      normal: this.normal,
      tangent: this.tangent,
      lineDir: this.lineDir,
      originalHalfWidth: this.originalHalfWidth,
      originalNudge: this.originalNudge,
      hasIncomingHandle: this.hasIncomingHandle,
      hasOutgoingHandle: this.hasOutgoingHandle,
      originalHandleOffsets: {
        inX: this.originalHandleInOffsetX,
        inY: this.originalHandleInOffsetY,
        outX: this.originalHandleOutOffsetX,
        outY: this.originalHandleOutOffsetY,
      },
    });
    return runRibStrategy(context, delta, RIB_STRATEGY_INTERPOLATE, { roundFunc });
  }

  /**
   * Get rollback data to restore original nudge and 2D handle offsets.
   */
  getRollback() {
    return buildRibRollbackPayload(this, RIB_ROLLBACK_MODE.INTERPOLATE);
  }
}

/**
 * Create an InterpolatingRibBehavior for Alt+drag of editable rib points.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} ribHit - Hit test result
 * @param {Object|null} interpolationAxis - Axis data
 * @returns {InterpolatingRibBehavior} The behavior instance
 */
export function createInterpolatingRibBehavior(skeletonData, ribHit, interpolationAxis = null) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new InterpolatingRibBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    interpolationAxis,
    ribHit.roundFunc || Math.round
  );
}

/**
 * EditableHandleBehavior - Handles dragging of editable generated control points (handles).
 * Movement is constrained to the direction of the corresponding skeleton handle.
 */
export class EditableHandleBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the on-curve skeleton point
   * @param {string} side - "left" or "right"
   * @param {string} handleType - "in" or "out" (incoming or outgoing handle)
   * @param {Object} skeletonHandleDir - Normalized direction of skeleton handle
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    handleType,
    skeletonHandleDir,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.handleType = handleType;
    this.skeletonHandleDir = skeletonHandleDir;
    this.roundFunc = roundFunc;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];

    // Get the appropriate offset key based on side and handle type
    const handleKeys = getHandleOffsetKeys(side, handleType);
    this.offsetKey = handleKeys.oneD;

    // Check if 2D offsets exist (from interpolation)
    const has2D = point[handleKeys.x] !== undefined || point[handleKeys.y] !== undefined;

    if (has2D) {
      // Convert 2D offset to 1D by projecting onto skeletonHandleDir
      const offset2DX = point[handleKeys.x] || 0;
      const offset2DY = point[handleKeys.y] || 0;
      this.originalOffset = offset2DX * skeletonHandleDir.x + offset2DY * skeletonHandleDir.y;
    } else {
      // Use 1D offset directly
      this.originalOffset = point[this.offsetKey] || 0;
    }
  }

  /**
   * Apply drag delta and return the new offset.
   * Movement is constrained to skeleton handle direction.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { contourIndex, pointIndex, side, handleType, offset }
   */
  applyDelta(delta, roundFunc = this.roundFunc) {
    // Project delta onto skeleton handle direction
    const projectedDelta = projectDelta(delta, this.skeletonHandleDir);
    const newOffset = this.originalOffset + projectedDelta;

    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      handleType: this.handleType,
      offset: roundFunc(newOffset),
    };
  }

  /**
   * Get rollback data to restore original offset.
   */
  getRollback() {
    return buildHandleRollbackPayload(this);
  }
}

/**
 * Create an EditableHandleBehavior for editable generated handles.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} handleInfo - Handle info from _getEditableHandleForGeneratedPoint
 * @param {Object} skeletonHandleDir - Normalized direction of skeleton handle
 * @returns {EditableHandleBehavior} The behavior instance
 */
export function createEditableHandleBehavior(skeletonData, handleInfo, skeletonHandleDir) {
  return new EditableHandleBehavior(
    skeletonData,
    handleInfo.skeletonContourIndex,
    handleInfo.skeletonPointIndex,
    handleInfo.side,
    handleInfo.handleType,
    skeletonHandleDir,
    handleInfo.roundFunc || Math.round
  );
}
