import {
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
} from "@fontra/core/skeleton-model.js";
import { expect } from "chai";
import {
  applySkeletonRibExecutorResult,
  createSkeletonRibExecutor,
  getSkeletonRibAddress,
} from "../../views-editor/src/skeleton-ribs.js";

describe("skeleton rib executor", () => {
  const makeAddress = (side, pointData = {}) => {
    const skeleton = normalizeSkeletonData({
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
              ...pointData,
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
    return getSkeletonRibAddress(skeleton, 10, 1, side);
  };

  const makeDelta = (address, side, normalAmount, tangentAmount) => {
    const n = address.normal;
    const t = { x: -n.y, y: n.x };
    const normalSign = side === "left" ? 1 : -1;
    return {
      x: normalSign * normalAmount * n.x + tangentAmount * t.x,
      y: normalSign * normalAmount * n.y + tangentAmount * t.y,
    };
  };

  it("free drag on an editable rib changes width only, never nudge", () => {
    const address = makeAddress("left", { editable: { left: true } });
    const executor = createSkeletonRibExecutor(address, "rib-default");

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7));

    expect(result.halfWidth).to.equal(50);
    expect(result.nudge).to.equal(0);
  });

  it("rib-tangent drag on an editable rib changes nudge only", () => {
    const address = makeAddress("left", { editable: { left: true } });
    const executor = createSkeletonRibExecutor(address, "rib-tangent");

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7));

    expect(result.halfWidth).to.equal(40);
    expect(result.nudge).to.equal(7);
  });

  it("tangent constrain mode on an editable rib changes nudge only", () => {
    const address = makeAddress("left", { editable: { left: true } });
    const executor = createSkeletonRibExecutor(address, "rib-default");

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7), {
      constrainMode: "tangent",
    });

    expect(result.halfWidth).to.equal(40);
    expect(result.nudge).to.equal(7);
  });

  it("non-editable ribs never nudge, even under rib-tangent", () => {
    const address = makeAddress("left");
    const executor = createSkeletonRibExecutor(address, "rib-tangent");

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7));

    expect(result.halfWidth).to.equal(40);
    expect(result.nudge).to.equal(0);
  });

  it("alt-drag interpolation slides nudge along the axis and keeps width", () => {
    const address = makeAddress("left", {
      editable: { left: true },
      handleOffsets: {
        leftIn: { x: 3, y: 0 },
        leftOut: { x: -2, y: 0 },
      },
    });
    const n = address.normal;
    const tangent = { x: -n.y, y: n.x };
    const executor = createSkeletonRibExecutor(address, "rib-interpolate", {
      // Axis parallel to the tangent: full delta projection becomes nudge.
      interpolationAxis: {
        dir: tangent,
        hasHandle: { in: true, out: true },
      },
    });

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7));

    expect(result.halfWidth).to.equal(40);
    expect(result.nudge).to.equal(7);
    // Handles are compensated so they stay fixed on canvas.
    expect(result.handleOffsets.in).to.deep.include({
      x: Math.round(3 - tangent.x * 7),
      y: Math.round(0 - tangent.y * 7),
    });
    expect(result.handleOffsets.out).to.deep.include({
      x: Math.round(-2 - tangent.x * 7),
      y: Math.round(0 - tangent.y * 7),
    });
  });

  it("interpolation without an axis falls back to pure tangent nudge", () => {
    const address = makeAddress("left", { editable: { left: true } });
    const executor = createSkeletonRibExecutor(address, "rib-interpolate");

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7));

    expect(result.halfWidth).to.equal(40);
    expect(result.nudge).to.equal(7);
  });

  it("interpolation on non-editable ribs behaves like a plain width drag", () => {
    const address = makeAddress("left");
    const executor = createSkeletonRibExecutor(address, "rib-interpolate");

    const result = executor.applyDelta(makeDelta(address, "left", 10, 7));

    expect(result.halfWidth).to.equal(50);
    expect(result.nudge).to.equal(0);
  });

  it("applying an interpolation result persists compensated handle offsets", () => {
    const address = makeAddress("left", {
      editable: { left: true },
      handleOffsets: { leftOut: { x: 0, y: 0 } },
    });
    const n = address.normal;
    const tangent = { x: -n.y, y: n.x };
    const executor = createSkeletonRibExecutor(address, "rib-interpolate", {
      interpolationAxis: { dir: tangent, hasHandle: { out: true } },
    });

    const result = executor.applyDelta(makeDelta(address, "left", 0, 5));
    applySkeletonRibExecutorResult(address, result);

    expect(address.point.nudge.left).to.equal(5);
    expect(address.point.handleOffsets.leftOut).to.deep.include({
      x: Math.round(-tangent.x * 5) || 0,
      y: Math.round(-tangent.y * 5) || 0,
    });
    expect(address.point.handleOffsets.leftIn).to.equal(undefined);
  });

  it("applying an executor result persists nudge only for editable sides", () => {
    const address = makeAddress("right", { editable: { right: true } });
    const executor = createSkeletonRibExecutor(address, "rib-tangent");

    const result = executor.applyDelta(makeDelta(address, "right", 0, -5));
    applySkeletonRibExecutorResult(address, result);

    expect(address.point.nudge.right).to.equal(-5);
    expect(address.point.width.right).to.equal(40);
  });
});
