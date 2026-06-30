import {
  calculateHandleMeasure,
  calculateProjectedDistanceComponents,
} from "@fontra/core/distance-angle.js";
import { expect } from "chai";

describe("distance-angle measure helpers", () => {
  it("calculateProjectedDistanceComponents returns absolute deltas", () => {
    expect(
      calculateProjectedDistanceComponents({ x: 10, y: 20 }, { x: 13, y: 16 })
    ).deep.equals({
      dx: 3,
      dy: 4,
    });
    expect(
      calculateProjectedDistanceComponents({ x: 13, y: 16 }, { x: 10, y: 20 })
    ).deep.equals({
      dx: 3,
      dy: 4,
    });
  });

  it("calculateHandleMeasure returns distance/angle/tension for the start handle", () => {
    const seg = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const m = calculateHandleMeasure(seg, "start");
    expect(m).to.not.equal(null);
    expect(m.distance).to.be.closeTo(100, 1e-6);
    expect(m.angle).to.be.closeTo(90, 1e-6);
    expect(m.tension).to.be.a("number");
  });

  it("calculateHandleMeasure measures the end handle from the end anchor", () => {
    const seg = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const m = calculateHandleMeasure(seg, "end");
    expect(m.distance).to.be.closeTo(100, 1e-6);
  });

  it("calculateHandleMeasure rejects malformed input", () => {
    expect(calculateHandleMeasure(null, "start")).to.equal(null);
    expect(calculateHandleMeasure([{ x: 0, y: 0 }], "start")).to.equal(null);
    expect(
      calculateHandleMeasure(
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 0 },
        ],
        "middle"
      )
    ).to.equal(null);
  });
});
