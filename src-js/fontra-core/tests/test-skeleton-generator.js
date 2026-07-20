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

  // Regression: the round-cap terminal split rebuilt the trimmed segment
  // without provenance, so the endpoint-facing generated handles of the
  // neighboring skeleton point lost their side/role attribution and stopped
  // being addressable (editable handles next to a round cap unselectable).
  it("keeps provenance on handles next to a round-capped endpoint", () => {
    const skeleton = {
      version: 1,
      nextId: 20,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 60,
          singleSided: null,
          points: [
            { id: 2, x: 0, y: 0, type: null, smooth: false },
            { id: 3, x: 60, y: 10, type: "cubic" },
            { id: 4, x: 140, y: 30, type: "cubic" },
            { id: 5, x: 200, y: 50, type: null, smooth: true },
            { id: 6, x: 260, y: 70, type: "cubic" },
            { id: 7, x: 340, y: 90, type: "cubic" },
            {
              id: 8,
              x: 400,
              y: 100,
              type: null,
              smooth: false,
              capStyle: "round",
              capRadiusRatio: 1 / 8,
              capTension: 0.55,
            },
          ],
        },
      ],
      generated: [],
    };
    const { provenance } = generateFromSkeleton(skeleton);
    const pointMap = provenance[0].pointMap;
    for (const side of ["left", "right"]) {
      const entry = pointMap.find(
        (item) =>
          item?.skeletonPointId === 5 && item.side === side && item.role === "out"
      );
      expect(entry, `point 5 ${side} out`).to.not.equal(undefined);
    }
  });
});

describe("skeleton-generator drop caps", () => {
  function makeDropSkeleton(endpointFields = {}, points = null) {
    return {
      version: 1,
      nextId: 10,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: points || [
            { id: 2, x: 0, y: 0, type: null, smooth: false },
            { id: 3, x: 200, y: 0, type: null, smooth: false },
            {
              id: 4,
              x: 400,
              y: 60,
              type: null,
              smooth: false,
              capStyle: "drop",
              ...endpointFields,
            },
          ],
        },
      ],
      generated: [],
    };
  }

  function allFinite(result) {
    return result.contours
      .flatMap((contour) => contour.points)
      .every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  it("produces a finite closed contour on a straight terminal", () => {
    const result = generateFromSkeleton(makeDropSkeleton());
    expect(result.contours.length).to.equal(1);
    expect(result.contours[0].isClosed).to.equal(true);
    expect(allFinite(result)).to.equal(true);
  });

  it("differs from a butt cap (the ball adds outline points)", () => {
    const drop = generateFromSkeleton(makeDropSkeleton());
    const butt = generateFromSkeleton(makeDropSkeleton({ capStyle: "butt" }));
    expect(drop.contours[0].points.length).to.be.greaterThan(
      butt.contours[0].points.length
    );
  });

  it("scales the ball with capBallRatio", () => {
    const boundsSpan = (result) => {
      const xs = result.contours[0].points.map((p) => p.x);
      const ys = result.contours[0].points.map((p) => p.y);
      return Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys));
    };
    const small = generateFromSkeleton(makeDropSkeleton({ capBallRatio: 0.8 }));
    const big = generateFromSkeleton(makeDropSkeleton({ capBallRatio: 2.5 }));
    expect(boundsSpan(big)).to.be.greaterThan(boundsSpan(small));
  });

  it("the capBallSide override changes which side swells", () => {
    const left = generateFromSkeleton(makeDropSkeleton({ capBallSide: "left" }));
    const right = generateFromSkeleton(makeDropSkeleton({ capBallSide: "right" }));
    expect(left.contours[0].points).to.not.deep.equal(right.contours[0].points);
    expect(allFinite(left)).to.equal(true);
    expect(allFinite(right)).to.equal(true);
  });

  it("handles a curved terminal (auto side inference)", () => {
    const result = generateFromSkeleton(
      makeDropSkeleton({}, [
        { id: 2, x: 0, y: 0, type: null, smooth: false },
        { id: 3, x: 120, y: 40, type: "cubic" },
        { id: 4, x: 260, y: 60, type: "cubic" },
        { id: 5, x: 380, y: 40, type: null, smooth: false, capStyle: "drop" },
      ])
    );
    expect(result.contours.length).to.equal(1);
    expect(allFinite(result)).to.equal(true);
  });

  it("capTension eases the neck further back along the inner edge", () => {
    // Horizontal stroke (width 80): outer edge y=80, inner edge y=160. The neck
    // rejoins the inner edge at a point that tension pulls back toward the
    // stroke (smaller x). The eased neck must not dip below the edge (no valley).
    const analyze = (tension) => {
      const points = generateFromSkeleton({
        version: 1,
        nextId: 10,
        contours: [
          {
            id: 1,
            closed: false,
            defaultWidth: 80,
            singleSided: null,
            points: [
              { id: 2, x: 40, y: 120, type: null, smooth: false },
              { id: 3, x: 240, y: 120, type: null, smooth: false },
              {
                id: 4,
                x: 440,
                y: 120,
                type: null,
                smooth: false,
                capStyle: "drop",
                capTension: tension,
              },
            ],
          },
        ],
        generated: [],
      }).contours[0].points;
      // Where the outline rejoins the inner edge near the neck (smaller x = the
      // neck reaches further back), and the lowest y anywhere near the neck.
      const nearEdge = points.filter(
        (p) => Math.abs(p.y - 160) <= 2 && p.x >= 300 && p.x <= 420
      );
      const region = points.filter((p) => p.x >= 300 && p.x <= 415);
      return {
        rejoinX: Math.min(...nearEdge.map((p) => p.x)),
        minY: Math.min(...region.map((p) => p.y)),
      };
    };
    const crisp = analyze(0);
    const soft = analyze(0.9);
    expect(soft.rejoinX).to.be.lessThan(crisp.rejoinX - 10); // eased further back
    expect(soft.minY).to.be.gte(159.5); // eases in from above — no dip below edge
  });

  it("works on the start endpoint too", () => {
    const result = generateFromSkeleton(
      makeDropSkeleton({}, [
        {
          id: 2,
          x: 0,
          y: 0,
          type: null,
          smooth: false,
          capStyle: "drop",
        },
        { id: 3, x: 200, y: 0, type: null, smooth: false },
        { id: 4, x: 400, y: 60, type: null, smooth: false },
      ])
    );
    expect(result.contours.length).to.equal(1);
    expect(allFinite(result)).to.equal(true);
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
