import {
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
} from "@fontra/core/skeleton-model.js";
import {
  applyFixedRibDelta,
  equalizeEditableGeneratedHandleOffsets,
  equalizeSkeletonHandleFromDelta,
  equalizeSkeletonHandleToPoint,
  getSkeletonHandleEqualizeInfo,
} from "@fontra/core/skeleton-modifiers.js";
import { expect } from "chai";

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
