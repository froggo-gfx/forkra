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
