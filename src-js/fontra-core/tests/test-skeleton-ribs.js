import {
  getSkeletonData,
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
  setSkeletonData,
  setSkeletonHandleDetached,
  setSkeletonHandleOffset,
} from "@fontra/core/skeleton-model.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { expect } from "chai";
import { editSkeleton } from "../../views-editor/src/skeleton-editing.js";
import { findGeneratedPathAddress } from "../../views-editor/src/skeleton-generated.js";
import { computeRibDetachConversions } from "../../views-editor/src/skeleton-panel-edits.js";
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

describe("rib detach toggle", () => {
  const makeCurveLayer = () => {
    const layer = {
      path: new VarPackedPath(),
      components: [],
      anchors: [],
      guidelines: [],
      customData: {},
    };
    setSkeletonData(
      layer,
      normalizeSkeletonData({
        contours: [
          makeSkeletonContour({
            id: 80,
            defaultWidth: 80,
            points: [
              makeSkeletonPoint({ id: 1, x: 0, y: 0 }),
              makeSkeletonPoint({ id: 2, x: 30, y: 40, type: "cubic" }),
              makeSkeletonPoint({ id: 3, x: 70, y: 40, type: "cubic" }),
              makeSkeletonPoint({
                id: 4,
                x: 100,
                y: 0,
                smooth: true,
                editable: { left: true },
                handleOffsets: { leftOut: { x: 6, y: 4, detached: false } },
              }),
              makeSkeletonPoint({ id: 5, x: 130, y: -40, type: "cubic" }),
              makeSkeletonPoint({ id: 6, x: 170, y: -40, type: "cubic" }),
              makeSkeletonPoint({ id: 7, x: 200, y: 0 }),
            ],
          }),
        ],
      })
    );
    editSkeleton(layer, () => {});
    return layer;
  };

  const positionOf = (layer, role) => {
    const pathAddress = findGeneratedPathAddress(
      getSkeletonData(layer),
      80,
      4,
      "left",
      role
    );
    return layer.path.getPoint(
      layer.path.getAbsolutePointIndex(
        pathAddress.pathContourIndex,
        pathAddress.contourPointIndex
      )
    );
  };

  const applyConversions = (layer, conversions, detached) => {
    editSkeleton(layer, (working) => {
      const point = working.contours[0].points[3];
      for (const conversion of conversions) {
        for (const [role, offset] of Object.entries(conversion.offsets)) {
          setSkeletonHandleOffset(point, "left", role, offset);
        }
        setSkeletonHandleDetached(point, "left", detached);
      }
    });
  };

  it("toggling detach on and off keeps the handles in place", () => {
    const layer = makeCurveLayer();
    const addresses = [{ contourId: 80, pointId: 4, side: "left" }];
    const before = {
      in: positionOf(layer, "in"),
      out: positionOf(layer, "out"),
    };

    const detachConversions = computeRibDetachConversions(
      layer,
      getSkeletonData(layer),
      addresses,
      true
    );
    expect(detachConversions).to.have.length(1);
    applyConversions(layer, detachConversions, true);

    const detachedPoint = getSkeletonData(layer).contours[0].points[3];
    expect(detachedPoint.handleOffsets.leftOut.detached).to.equal(true);
    for (const role of ["in", "out"]) {
      const position = positionOf(layer, role);
      expect(Math.abs(position.x - before[role].x), `${role} x`).to.be.at.most(1);
      expect(Math.abs(position.y - before[role].y), `${role} y`).to.be.at.most(1);
    }

    const attachConversions = computeRibDetachConversions(
      layer,
      getSkeletonData(layer),
      addresses,
      false
    );
    expect(attachConversions).to.have.length(1);
    applyConversions(layer, attachConversions, false);

    const attachedPoint = getSkeletonData(layer).contours[0].points[3];
    expect(attachedPoint.handleOffsets.leftOut.detached).to.equal(false);
    for (const role of ["in", "out"]) {
      const position = positionOf(layer, role);
      expect(Math.abs(position.x - before[role].x), `${role} x`).to.be.at.most(2);
      expect(Math.abs(position.y - before[role].y), `${role} y`).to.be.at.most(2);
    }
  });
});
