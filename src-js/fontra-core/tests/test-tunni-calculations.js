import {
  calculateControlHandlePoint,
  calculateSegmentTension,
  calculateTunniPoint,
} from "@fontra/core/tunni-calculations.js";
import { expect } from "chai";

describe("tunni-calculations: calculateSegmentTension", () => {
  it("returns 1.0 when both handles point at the corner (a=b=c=d)", () => {
    const t = calculateSegmentTension(
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    );
    expect(t).to.be.closeTo(1.0, 1e-9);
  });

  it("returns 2/3 for an asymmetric handle (a=5,b=10,c=10,d=10)", () => {
    const t = calculateSegmentTension(
      { x: 5, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    );
    expect(t).to.be.closeTo(2 / 3, 1e-9);
  });

  it("returns 0 for a degenerate (zero-length) handle", () => {
    const t = calculateSegmentTension(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    );
    expect(t).to.equal(0);
  });
});

describe("tunni-calculations: geometry naming (D2/D3)", () => {
  const seg = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 200 },
    { x: 200, y: 200 },
  ];

  it("calculateControlHandlePoint is the midpoint of the two controls", () => {
    expect(calculateControlHandlePoint(seg)).deep.equals({ x: 50, y: 150 });
  });

  it("calculateTunniPoint is the tangent-ray intersection", () => {
    const p = calculateTunniPoint(seg);
    expect(p.x).to.be.closeTo(0, 1e-9);
    expect(p.y).to.be.closeTo(200, 1e-9);
  });
});
