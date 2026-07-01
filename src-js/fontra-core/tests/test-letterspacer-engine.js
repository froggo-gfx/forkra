import {
  calculateSidebearing,
  closePolygon,
  computeParamAreaFromTargetArea,
  computeTargetAreaFromSidebearing,
  polygonArea,
  setDepth,
} from "@fontra/core/letterspacer-engine.js";
import { expect } from "chai";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("letterspacer-engine geometry", () => {
  it("polygonArea (shoelace) of a 10x10 square is 100", () => {
    expect(polygonArea(square)).to.be.closeTo(100, 1e-9);
  });

  it("setDepth clips left margins inward with min(x, extreme+maxDepth)", () => {
    const out = setDepth(
      [
        { x: 0, y: 0 },
        { x: 50, y: 10 },
      ],
      0,
      20,
      true
    );
    expect(out).to.deep.equal([
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    ]);
  });

  it("setDepth clips right margins inward with max(x, extreme-maxDepth)", () => {
    const out = setDepth(
      [
        { x: 100, y: 0 },
        { x: 50, y: 10 },
      ],
      100,
      20,
      false
    );
    expect(out).to.deep.equal([
      { x: 100, y: 0 },
      { x: 80, y: 10 },
    ]);
  });

  it("closePolygon appends the two extreme corners", () => {
    const out = closePolygon(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ],
      0,
      0,
      10
    );
    expect(out).to.deep.equal([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]);
  });

  it("calculateSidebearing = (targetArea - polygonArea) / amplitudeY", () => {
    expect(calculateSidebearing(square, 300, 10)).to.be.closeTo(20, 1e-9);
  });

  it("computeTargetAreaFromSidebearing is the inverse of calculateSidebearing", () => {
    const sb = calculateSidebearing(square, 300, 10);
    expect(computeTargetAreaFromSidebearing(polygonArea(square), sb, 10)).to.be.closeTo(
      300,
      1e-9
    );
  });

  it("computeParamAreaFromTargetArea scales by xHeight/(amp*100*upmScale*factor)", () => {
    expect(
      computeParamAreaFromTargetArea(1000, { upm: 1000, xHeight: 500 }, 500, 1)
    ).to.be.closeTo(10, 1e-9);
    expect(
      computeParamAreaFromTargetArea(1000, { upm: 1000, xHeight: 500 }, 0, 1)
    ).to.equal(0);
  });
});
