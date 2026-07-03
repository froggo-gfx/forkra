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
