import { applyChange } from "@fontra/core/changes.js";
import {
  getSkeletonData,
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
  setSkeletonData,
} from "@fontra/core/skeleton-model.js";
import {
  applyFixedRibDelta,
  equalizeEditableGeneratedHandleOffsets,
  equalizeSkeletonHandleFromDelta,
  equalizeSkeletonHandleToPoint,
  getSkeletonHandleEqualizeInfo,
} from "@fontra/core/skeleton-modifiers.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { expect } from "chai";
import { EditBehaviorFactory } from "../../views-editor/src/edit-behavior.js";
import {
  makeSkeletonPointKey,
  makeSkeletonPointTargetEntry,
} from "../../views-editor/src/skeleton-editing.js";
import { createEditableGeneratedHandleTargetEntries } from "../../views-editor/src/skeleton-generated.js";

before(() => {
  globalThis.window = {
    coarseGridSpacing: 1,
    event: null,
  };
});

describe("skeleton modifier fixed-rib helpers", () => {
  it("moves selected on-curve points and expands the opposite anchored width", () => {
    const original = makeLineSkeleton();
    const working = normalizeSkeletonData(structuredClone(original));

    const changed = applyFixedRibDelta(
      original,
      working,
      new Set(["skeletonPoint/10/1"]),
      "skeletonPoint/10/1",
      { x: 0, y: -10 }
    );

    expect(changed).to.equal(true);
    expect(working.contours[0].points[0]).to.include({ x: 0, y: -10 });
    expect(working.contours[0].points[0].width).to.deep.equal({
      left: 50,
      right: 50,
      linked: true,
    });
  });

  it("compresses the drag-side anchored width", () => {
    const original = makeLineSkeleton();
    const working = normalizeSkeletonData(structuredClone(original));

    applyFixedRibDelta(
      original,
      working,
      new Set(["skeletonPoint/10/1"]),
      "skeletonPoint/10/1",
      { x: 0, y: -10 },
      { compress: true }
    );

    expect(working.contours[0].points[0]).to.include({ x: 0, y: -10 });
    expect(working.contours[0].points[0].width).to.deep.equal({
      left: 30,
      right: 30,
      linked: true,
    });
  });

  it("returns false without a clicked point or with a clicked off-curve point", () => {
    const original = makeLineSkeleton();
    const working = normalizeSkeletonData(structuredClone(original));

    expect(
      applyFixedRibDelta(original, working, new Set(["skeletonPoint/10/1"]), null, {
        x: 0,
        y: -10,
      })
    ).to.equal(false);

    const cubicOriginal = normalizeSkeletonData({
      contours: [
        {
          id: 20,
          points: [
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 50, y: 50, type: "cubic" },
            { id: 3, x: 100, y: 0 },
          ],
        },
      ],
    });
    const cubicWorking = normalizeSkeletonData(structuredClone(cubicOriginal));
    expect(
      applyFixedRibDelta(
        cubicOriginal,
        cubicWorking,
        new Set(["skeletonPoint/20/2"]),
        "skeletonPoint/20/2",
        { x: 0, y: -10 }
      )
    ).to.equal(false);
  });

  it("moves cubic control points with selected segment endpoints", () => {
    const original = normalizeSkeletonData({
      contours: [
        {
          id: 30,
          defaultWidth: 80,
          points: [
            { id: 1, x: 0, y: 0, width: { left: 40, right: 40, linked: true } },
            { id: 2, x: 30, y: 50, type: "cubic" },
            { id: 3, x: 70, y: 50, type: "cubic" },
            { id: 4, x: 100, y: 0, width: { left: 40, right: 40, linked: true } },
          ],
        },
      ],
    });
    const working = normalizeSkeletonData(structuredClone(original));

    applyFixedRibDelta(
      original,
      working,
      new Set(["skeletonPoint/30/1", "skeletonPoint/30/4"]),
      "skeletonPoint/30/1",
      { x: 0, y: -10 },
      { scaleControlPoints: true }
    );

    expect(working.contours[0].points[1]).not.to.include({ x: 30, y: 50 });
    expect(working.contours[0].points[2]).not.to.include({ x: 70, y: 50 });
    expect(working.contours[0].points[1].y).to.be.lessThan(50);
    expect(working.contours[0].points[2].y).to.be.lessThan(50);
  });
});

describe("skeleton modifier equalize helpers", () => {
  it("finds the smooth on-curve and opposite handle for a cubic off-curve", () => {
    const contour = makeSmoothHandleContour();

    expect(getSkeletonHandleEqualizeInfo(contour, 2)).to.deep.equal({
      smoothPointId: 1,
      oppositePointId: 3,
      smoothIndex: 1,
      oppositeIndex: 3,
    });
  });

  it("equalizes skeleton handle drag around the smooth point", () => {
    const contour = makeSmoothHandleContour();

    const changed = equalizeSkeletonHandleToPoint(contour, 2, { x: 80, y: 0 });

    expect(changed).to.equal(true);
    expect(contour.points[2]).to.include({ x: 80, y: 0 });
    expect(contour.points[3]).to.include({ x: 20, y: 0 });
  });

  it("equalizes skeleton handle arrow nudge while preserving opposite direction", () => {
    const contour = makeSmoothHandleContour();

    const changed = equalizeSkeletonHandleFromDelta(contour, 2, { x: 20, y: 0 });

    expect(changed).to.equal(true);
    expect(contour.points[2]).to.include({ x: 80, y: 0 });
    expect(contour.points[3]).to.include({ x: 20, y: 0 });
  });

  it("equalizes editable generated handle offsets for the same side", () => {
    const point = makeSkeletonPoint({
      handleOffsets: {
        leftIn: { x: -5, y: 0, detached: true },
        leftOut: { x: 10, y: 0, detached: true },
      },
    });

    const changed = equalizeEditableGeneratedHandleOffsets(
      point,
      "left",
      "out",
      { x: 5, y: 0 },
      {
        draggedDirection: { x: 1, y: 0 },
        oppositeDirection: { x: -1, y: 0 },
        detached: true,
        originalDraggedLength: 10,
        originalOppositeLength: 5,
      }
    );

    expect(changed).to.equal(true);
    expect(point.handleOffsets.leftOut).to.deep.equal({
      x: 15,
      y: 0,
      detached: true,
    });
    expect(point.handleOffsets.leftIn).to.deep.equal({
      x: -15,
      y: 0,
      detached: true,
    });
  });
});

describe("skeleton modifier target-entry parity fixtures", () => {
  it("applies fixed-rib skeleton point movement through target-entry persistence", () => {
    const layer = makeLayerGlyph(makeLineSkeleton());
    const selection = new Set(["skeletonPoint/10/1"]);
    const targetEntry = makeSkeletonPointTargetEntry(
      layer,
      selection,
      "fixed-rib",
      getSkeletonData(layer),
      { clickedSkeletonPointKey: makeSkeletonPointKey(10, 1) }
    );
    const behavior = new EditBehaviorFactory(layer, selection, false, {
      targetEntries: [targetEntry],
    }).getBehavior("fixed-rib");

    applyChange(layer, behavior.makeChangeForDelta({ x: 0, y: -10 }));

    const point = getSkeletonData(layer).contours[0].points[0];
    expect(point).to.include({ x: 0, y: -10 });
    expect(point.width).to.deep.equal({ left: 50, right: 50, linked: true });
    expect(layer.path.numContours).to.be.greaterThan(0);
  });

  it("applies fixed-rib-compress skeleton point movement through target-entry persistence", () => {
    const layer = makeLayerGlyph(makeLineSkeleton());
    const selection = new Set(["skeletonPoint/10/1"]);
    const targetEntry = makeSkeletonPointTargetEntry(
      layer,
      selection,
      "fixed-rib-compress",
      getSkeletonData(layer),
      { clickedSkeletonPointKey: makeSkeletonPointKey(10, 1) }
    );
    const behavior = new EditBehaviorFactory(layer, selection, false, {
      targetEntries: [targetEntry],
    }).getBehavior("fixed-rib-compress");

    applyChange(layer, behavior.makeChangeForDelta({ x: 0, y: -10 }));

    const point = getSkeletonData(layer).contours[0].points[0];
    expect(point).to.include({ x: 0, y: -10 });
    expect(point.width).to.deep.equal({ left: 30, right: 30, linked: true });
  });

  it("ignores fixed-rib skeleton point selections on layers without skeleton data", () => {
    const layer = makeLayerGlyph();

    expect(
      makeSkeletonPointTargetEntry(
        layer,
        new Set(["skeletonPoint/10/1"]),
        "fixed-rib",
        null,
        { clickedSkeletonPointKey: makeSkeletonPointKey(10, 1) }
      )
    ).to.equal(null);
  });

  it("equalizes skeleton handles through target-entry persistence", () => {
    const layer = makeLayerGlyph(
      normalizeSkeletonData({
        contours: [
          makeSkeletonContour({
            id: 40,
            points: makeSmoothHandleContour().points,
          }),
        ],
      })
    );
    const selection = new Set(["skeletonPoint/40/2"]);
    const targetEntry = makeSkeletonPointTargetEntry(
      layer,
      selection,
      "equalize",
      getSkeletonData(layer)
    );
    const behavior = new EditBehaviorFactory(layer, selection, false, {
      targetEntries: [targetEntry],
    }).getBehavior("equalize");

    applyChange(layer, behavior.makeChangeForDelta({ x: 20, y: 0 }));

    const points = getSkeletonData(layer).contours[0].points;
    expect(points[2]).to.include({ x: 80, y: 0 });
    expect(points[3]).to.include({ x: 20, y: 0 });
  });

  it("equalizes editable generated handles through the live target-entry path", () => {
    const layer = makeLayerGlyph(makeEditableGeneratedHandleSkeleton());
    const selection = new Set(["editableGeneratedHandle/80/2/left/out"]);
    const targetEntries = createEditableGeneratedHandleTargetEntries(
      layer,
      selection,
      "equalize",
      { referenceSkeletonData: getSkeletonData(layer) }
    );
    const behavior = new EditBehaviorFactory(layer, selection, false, {
      targetEntries,
    }).getBehavior("equalize");

    applyChange(layer, behavior.makeChangeForDelta({ x: 5, y: 0 }));

    const point = getSkeletonData(layer).contours[0].points[1];
    expect(point.handleOffsets.leftOut).to.deep.equal({
      x: 15,
      y: 0,
      detached: true,
    });
    expect(point.handleOffsets.leftIn).to.deep.equal({
      x: -15,
      y: 0,
      detached: true,
    });
  });
});

function makeLineSkeleton() {
  return normalizeSkeletonData({
    contours: [
      makeSkeletonContour({
        id: 10,
        defaultWidth: 80,
        points: [
          makeSkeletonPoint({
            id: 1,
            x: 0,
            y: 0,
            width: { left: 40, right: 40, linked: true },
          }),
          makeSkeletonPoint({
            id: 2,
            x: 100,
            y: 0,
            width: { left: 40, right: 40, linked: true },
          }),
        ],
      }),
    ],
  });
}

function makeSmoothHandleContour() {
  return makeSkeletonContour({
    id: 40,
    points: [
      makeSkeletonPoint({ id: 4, x: 0, y: 0 }),
      makeSkeletonPoint({ id: 1, x: 50, y: 0, smooth: true }),
      makeSkeletonPoint({ id: 2, x: 60, y: 0, type: "cubic" }),
      makeSkeletonPoint({ id: 3, x: 40, y: 0, type: "cubic" }),
      makeSkeletonPoint({ id: 5, x: 100, y: 0 }),
    ],
  });
}

function makeLayerGlyph(skeletonData = null) {
  const layer = {
    path: new VarPackedPath(),
    components: [],
    anchors: [],
    guidelines: [],
    customData: {},
  };
  if (skeletonData) {
    setSkeletonData(layer, skeletonData);
  }
  return layer;
}

function makeEditableGeneratedHandleSkeleton() {
  return normalizeSkeletonData({
    contours: [
      makeSkeletonContour({
        id: 80,
        defaultWidth: 80,
        points: [
          makeSkeletonPoint({ id: 1, x: 40, y: 0, type: "cubic" }),
          makeSkeletonPoint({
            id: 2,
            x: 50,
            y: 0,
            editable: { left: true },
            handleOffsets: {
              leftIn: { x: -5, y: 0, detached: true },
              leftOut: { x: 10, y: 0, detached: true },
            },
          }),
          makeSkeletonPoint({ id: 3, x: 60, y: 0, type: "cubic" }),
        ],
        generated: undefined,
      }),
    ],
    generated: [
      {
        skeletonContourId: 80,
        pathContourIndex: 0,
        pointMap: [
          { skeletonPointId: 2, side: "left", role: "in" },
          { skeletonPointId: 2, side: "left", role: "onCurve" },
          { skeletonPointId: 2, side: "left", role: "out" },
        ],
      },
    ],
  });
}
