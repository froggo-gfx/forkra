import {
  calculateHandleMeasure,
  calculateProjectedDistanceComponents,
} from "@fontra/core/distance-angle.js";
import { calculateSegmentTension } from "@fontra/core/tunni-calculations.js";
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

  it("calculateHandleMeasure reports per-handle tension, distinct from segment tension on an unbalanced curve", () => {
    // Unbalanced curve: the start handle (length 50) is shorter than the end
    // handle (length 100). Both anchors are 200 from the Tunni point at (0, 200).
    const seg = [
      { x: 0, y: 0 }, // onStart
      { x: 0, y: 50 }, // offStart -> handle length 50
      { x: 100, y: 200 }, // offEnd -> handle length 100
      { x: 200, y: 200 }, // onEnd
    ];
    const start = calculateHandleMeasure(seg, "start");
    const end = calculateHandleMeasure(seg, "end");
    // Per-handle tension = handle length / (anchor -> Tunni point distance).
    expect(start.tension).to.be.closeTo(50 / 200, 1e-9); // 0.25
    expect(end.tension).to.be.closeTo(100 / 200, 1e-9); // 0.5
    // The two handles differ, and neither equals the symmetric segment tension.
    expect(start.tension).to.not.be.closeTo(end.tension, 1e-6);
    const segmentTension = calculateSegmentTension(seg[1], seg[0], seg[2], seg[3]);
    expect(start.tension).to.not.be.closeTo(segmentTension, 1e-6);
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
