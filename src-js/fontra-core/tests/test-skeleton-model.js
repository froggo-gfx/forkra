import {
  DEFAULT_SKELETON_WIDTH,
  SKELETON_SCHEMA_VERSION,
  appendSkeletonContour,
  appendSkeletonPoint,
  deleteSkeletonPoint,
  getSkeletonContour,
  getSkeletonPoint,
  makeEmptySkeletonData,
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
  updateSkeletonPoint,
} from "@fontra/core/skeleton-model.js";
import { expect } from "chai";

describe("skeleton-model constructors and normalization", () => {
  it("creates an empty skeleton data object", () => {
    expect(makeEmptySkeletonData()).to.deep.equal({
      version: SKELETON_SCHEMA_VERSION,
      nextId: 1,
      contours: [],
      generated: [],
    });
  });

  it("allocates stable contour and point ids from nextId", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = makeSkeletonContour({}, skeleton);
    const p0 = makeSkeletonPoint({ x: 10, y: 20 }, skeleton);
    const p1 = makeSkeletonPoint({ x: 30, y: 40, type: "cubic" }, skeleton);

    expect(contour.id).to.equal(1);
    expect(p0.id).to.equal(2);
    expect(p1.id).to.equal(3);
    expect(skeleton.nextId).to.equal(4);
    expect(contour.defaultWidth).to.equal(DEFAULT_SKELETON_WIDTH);
    expect(p0.type).to.equal(null);
    expect(p1.type).to.equal("cubic");
  });

  it("normalizes missing and malformed fields without reusing ids", () => {
    const normalized = normalizeSkeletonData({
      version: 99,
      nextId: 2,
      contours: [
        {
          id: 10,
          closed: true,
          singleSided: "right",
          points: [
            { id: 11, x: 1, y: 2, width: { left: 10, right: 20, linked: false } },
            { x: Number.NaN, y: Infinity, type: "bogus" },
          ],
        },
      ],
      generated: [{ skeletonContourId: 10, pathContourIndex: 3, pointMap: [] }],
    });

    expect(normalized.version).to.equal(1);
    expect(normalized.nextId).to.equal(13);
    expect(normalized.contours[0].id).to.equal(10);
    expect(normalized.contours[0].closed).to.equal(true);
    expect(normalized.contours[0].singleSided).to.equal("right");
    expect(normalized.contours[0].points[0].id).to.equal(11);
    expect(normalized.contours[0].points[1]).to.include({
      id: 12,
      x: 0,
      y: 0,
      type: null,
    });
    expect(normalized.generated).to.deep.equal([
      { skeletonContourId: 10, pathContourIndex: 3, pointMap: [] },
    ]);
  });

  it("preserves cap and corner parameters through normalization", () => {
    const normalized = normalizeSkeletonData({
      nextId: 1,
      contours: [
        {
          capStyle: "round",
          reversed: true,
          cornerTrimRatio: 0.5,
          cornerRadiusBoost: 1.5,
          points: [
            { x: 0, y: 0, capStyle: "square", capAngle: 30, capDistance: 12 },
            {
              x: 10,
              y: 0,
              capStyle: "bogus",
              capRadiusRatio: 0.25,
              capTension: 0.6,
              roundnessStrength: 0.8,
              cornerAsymmetry: -0.2,
            },
          ],
        },
      ],
    });

    const contour = normalized.contours[0];
    expect(contour).to.include({
      capStyle: "round",
      reversed: true,
      cornerTrimRatio: 0.5,
      cornerRadiusBoost: 1.5,
    });
    expect(contour.points[0]).to.include({
      capStyle: "square",
      capAngle: 30,
      capDistance: 12,
    });
    expect(contour.points[1].capStyle).to.equal(null);
    expect(contour.points[1]).to.include({
      capRadiusRatio: 0.25,
      capTension: 0.6,
      roundnessStrength: 0.8,
      cornerAsymmetry: -0.2,
    });
  });
});

describe("skeleton-model id accessors and mutators", () => {
  it("appends contours and points using stable ids", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = appendSkeletonContour(skeleton, { closed: true });
    const p0 = appendSkeletonPoint(skeleton, contour.id, { x: 100, y: 200 });
    const p1 = appendSkeletonPoint(skeleton, contour.id, { x: 150, y: 250 });

    expect(getSkeletonContour(skeleton, contour.id)).to.equal(contour);
    expect(getSkeletonPoint(skeleton, contour.id, p0.id)).to.equal(p0);
    expect(getSkeletonPoint(skeleton, contour.id, p1.id)).to.equal(p1);
    expect(skeleton.nextId).to.equal(4);
  });

  it("updates a point by id and keeps canonical point shape", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = appendSkeletonContour(skeleton);
    const point = appendSkeletonPoint(skeleton, contour.id, { x: 10, y: 20 });

    const updated = updateSkeletonPoint(skeleton, contour.id, point.id, {
      x: Number.NaN,
      y: 35,
      type: "bogus",
      width: { left: 14, right: 18, linked: false },
    });

    expect(updated).to.equal(getSkeletonPoint(skeleton, contour.id, point.id));
    expect(updated).to.include({ id: point.id, x: 0, y: 35, type: null });
    expect(updated.width).to.deep.equal({ left: 14, right: 18, linked: false });
  });

  it("deletes points by id and reports missing targets", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = appendSkeletonContour(skeleton);
    const point = appendSkeletonPoint(skeleton, contour.id, { x: 10, y: 20 });

    expect(deleteSkeletonPoint(skeleton, contour.id, point.id)).to.equal(true);
    expect(getSkeletonPoint(skeleton, contour.id, point.id)).to.equal(null);
    expect(deleteSkeletonPoint(skeleton, contour.id, point.id)).to.equal(false);
    expect(appendSkeletonPoint(skeleton, 999, { x: 1, y: 2 })).to.equal(null);
    expect(updateSkeletonPoint(skeleton, 999, point.id, { x: 1 })).to.equal(null);
  });
});
