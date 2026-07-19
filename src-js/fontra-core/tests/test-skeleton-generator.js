import {
  generateFromSkeleton,
  outlineContourToPackedPath,
} from "@fontra/core/skeleton-generator.js";
import { packContour } from "@fontra/core/var-path.js";
import { expect } from "chai";

import { readRepoPathAsJSON } from "./test-support.js";

const fixtures = readRepoPathAsJSON("tests/data/skeleton-generator/fixtures.json");

describe("skeleton-generator golden master", () => {
  for (const fixture of fixtures) {
    it(`matches donor output for ${fixture.name}`, () => {
      const result = generateFromSkeleton(fixture.canonical);
      expect(roundContours(result.contours)).to.deep.equal(
        roundContours(fixture.expectedContours)
      );
    });
  }

  it("outlineContourToPackedPath matches packContour", () => {
    const contour = fixtures[0].expectedContours[0];
    expect(outlineContourToPackedPath(contour)).to.deep.equal(packContour(contour));
  });
});

describe("skeleton-generator provenance", () => {
  it("emits contour-level provenance keyed by skeleton contour id", () => {
    const fixture = fixtures.find((item) => item.name === "open-line-butt-cap");
    const result = generateFromSkeleton(fixture.canonical);
    expect(result.provenance).to.have.length(result.contours.length);
    expect(result.provenance[0]).to.include({
      skeletonContourId: 1,
      generatedContourIndex: 0,
    });
    expect(result.provenance[0].pointMap).to.have.length(
      result.contours[0].points.length
    );
  });

  it("maps generated points to stable skeleton point ids and roles", () => {
    const fixture = fixtures.find((item) => item.name === "open-cubic-round-cap");
    const result = generateFromSkeleton(fixture.canonical);
    const pointMaps = result.provenance.flatMap((entry) => entry.pointMap);
    expect(pointMaps.some((entry) => entry?.skeletonPointId === 2)).to.equal(true);
    expect(pointMaps.some((entry) => entry?.skeletonPointId === 5)).to.equal(true);
    expect(pointMaps.some((entry) => entry?.role === "onCurve")).to.equal(true);
    expect(pointMaps.some((entry) => entry?.role === "in")).to.equal(true);
    expect(pointMaps.some((entry) => entry?.role === "out")).to.equal(true);
  });

  it("does not persist private provenance on output contour points", () => {
    const fixture = fixtures.find((item) => item.name === "open-line-butt-cap");
    const result = generateFromSkeleton(fixture.canonical);
    expect(
      result.contours.some((contour) =>
        contour.points.some((point) => Object.hasOwn(point, "_provenance"))
      )
    ).to.equal(false);
  });

  it("emits side-bearing on-curve provenance for every rib point", () => {
    const fixture = fixtures.find((item) => item.name === "open-line-butt-cap");
    const result = generateFromSkeleton(fixture.canonical);
    const pointMaps = result.provenance.flatMap((entry) => entry.pointMap);
    for (const skeletonPointId of [2, 3]) {
      for (const side of ["left", "right"]) {
        expect(
          pointMaps.some(
            (entry) =>
              entry?.skeletonPointId === skeletonPointId &&
              entry.side === side &&
              entry.role === "onCurve"
          ),
          `onCurve ${skeletonPointId}/${side}`
        ).to.equal(true);
      }
    }
  });

  it("emits side-bearing handle provenance adjacent to skeleton on-curves", () => {
    // Butt-cap variant: split-outline round caps (3.4) consume the terminal
    // side segment, so terminal handle provenance only survives on cap styles
    // that keep the side outline intact.
    const fixture = fixtures.find((item) => item.name === "open-cubic-butt-cap");
    const result = generateFromSkeleton(fixture.canonical);
    const pointMaps = result.provenance.flatMap((entry) => entry.pointMap);
    for (const side of ["left", "right"]) {
      expect(
        pointMaps.some(
          (entry) =>
            entry?.skeletonPointId === 2 && entry.side === side && entry.role === "out"
        ),
        `out handle 2/${side}`
      ).to.equal(true);
      expect(
        pointMaps.some(
          (entry) =>
            entry?.skeletonPointId === 5 && entry.side === side && entry.role === "in"
        ),
        `in handle 5/${side}`
      ).to.equal(true);
    }
  });
});

describe("skeleton-generator corner rounding input", () => {
  function makeAnglePointSkeleton(cornerFields = {}) {
    // open polyline with a sharp angle at the middle point
    return {
      version: 1,
      nextId: 5,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            { id: 2, x: 0, y: 0, type: null, smooth: false },
            { id: 3, x: 100, y: 0, type: null, smooth: false, ...cornerFields },
            { id: 4, x: 100, y: 100, type: null, smooth: false },
          ],
        },
      ],
      generated: [],
    };
  }

  it("corner rounding parameters change the generated outline", () => {
    const plain = generateFromSkeleton(makeAnglePointSkeleton());
    const rounded = generateFromSkeleton(
      makeAnglePointSkeleton({ cornerRoundness: 0.8, cornerReach: 0.6 })
    );
    expect(rounded.contours).to.not.deep.equal(plain.contours);
  });
});

describe("skeleton-generator round caps", () => {
  // Regression: round caps on line terminal segments threw in bezier-js
  // (linear beziers must be constructed with the point[] form).
  it("generates round caps on straight-line terminal segments", () => {
    const skeleton = {
      version: 1,
      nextId: 5,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 60,
          singleSided: null,
          points: [
            {
              id: 2,
              x: 0,
              y: 0,
              type: null,
              smooth: false,
              capStyle: "round",
              capRadiusRatio: 1 / 8,
              capTension: 0.55,
            },
            { id: 3, x: 200, y: 0, type: null, smooth: false },
            { id: 4, x: 400, y: 50, type: null, smooth: false },
          ],
        },
      ],
      generated: [],
    };
    const generated = generateFromSkeleton(skeleton);
    expect(generated.contours.length).to.equal(1);
  });
});

describe("skeleton-generator near-zero handle stabilization", () => {
  it("does not flip near-zero handles across the anchor", () => {
    const skeleton = {
      version: 1,
      nextId: 6,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            {
              id: 2,
              x: 0,
              y: 0,
              type: null,
              smooth: false,
              width: { left: 40, right: 40, linked: true },
              nudge: { left: 0, right: 0 },
              editable: { left: false, right: false },
              handleOffsets: {},
            },
            { id: 3, x: 0.00001, y: 0, type: "cubic", smooth: false },
            { id: 4, x: 120, y: 40, type: "cubic", smooth: false },
            {
              id: 5,
              x: 160,
              y: 0,
              type: null,
              smooth: false,
              width: { left: 40, right: 40, linked: true },
              nudge: { left: 0, right: 0 },
              editable: { left: false, right: false },
              handleOffsets: {},
            },
          ],
        },
      ],
      generated: [],
    };

    const result = generateFromSkeleton(skeleton);
    const allPoints = result.contours.flatMap((contour) => contour.points);
    for (const point of allPoints) {
      expect(Number.isFinite(point.x)).to.equal(true);
      expect(Number.isFinite(point.y)).to.equal(true);
    }
  });
});

function roundContours(contours) {
  return contours.map((contour) => ({
    isClosed: contour.isClosed === true,
    points: contour.points.map((point) => {
      const rounded = {
        x: round(point.x),
        y: round(point.y),
      };
      if (point.type) rounded.type = point.type;
      if (point.smooth) rounded.smooth = true;
      return rounded;
    }),
  }));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
