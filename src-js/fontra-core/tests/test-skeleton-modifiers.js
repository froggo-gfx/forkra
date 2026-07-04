import {
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
} from "@fontra/core/skeleton-model.js";
import { applyFixedRibDelta } from "@fontra/core/skeleton-modifiers.js";
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
