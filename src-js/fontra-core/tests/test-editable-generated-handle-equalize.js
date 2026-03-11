import { expect } from "chai";

function resolveHandlePosition(state, point, anchorPos) {
  if (state.detachedMode) {
    return {
      x: anchorPos.x + (point[state.keys.offsetXKey] || 0),
      y: anchorPos.y + (point[state.keys.offsetYKey] || 0),
    };
  }
  return {
    x: state.baseControlPos.x + (point[state.keys.offsetXKey] || 0),
    y: state.baseControlPos.y + (point[state.keys.offsetYKey] || 0),
  };
}

describe("editable generated handle equalize helpers", () => {
  let buildEditableGeneratedHandleEqualizeState;
  let applyEditableGeneratedHandleEqualizeDelta;
  let canonicalNudgeAdapters;

  before(async () => {
    globalThis.window = {
      coarseGridSpacing: 1,
      event: null,
      addEventListener() {},
      removeEventListener() {},
    };
    globalThis.localStorage = {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    };

    ({
      buildEditableGeneratedHandleEqualizeState,
      applyEditableGeneratedHandleEqualizeDelta,
      canonicalNudgeAdapters,
    } = await import("../../views-editor/src/edit-behavior-adapters.js"));
  });

  it("equalizes editable generated attached handles while preserving their directions", () => {
    const point = {
      leftHandleInOffset: 0,
      leftHandleOutOffset: 0,
    };
    const anchorPos = { x: 0, y: 0 };
    const equalizeState = buildEditableGeneratedHandleEqualizeState({
      point,
      side: "left",
      handleType: "out",
      anchorPos,
      draggedHandlePos: { x: 50, y: 0 },
      oppositeHandlePos: { x: 0, y: 80 },
      draggedSkeletonHandleDir: { x: 1, y: 0 },
      oppositeSkeletonHandleDir: { x: 0, y: 1 },
      detachedMode: false,
    });

    applyEditableGeneratedHandleEqualizeDelta(point, equalizeState, { x: 10, y: 0 });

    const draggedPos = resolveHandlePosition(equalizeState.draggedState, point, anchorPos);
    const oppositePos = resolveHandlePosition(equalizeState.oppositeState, point, anchorPos);

    expect(draggedPos).to.deep.equal({ x: 60, y: 0 });
    expect(oppositePos).to.deep.equal({ x: 0, y: 60 });
    expect(point.leftHandleOutOffsetX).to.equal(10);
    expect(point.leftHandleOutOffsetY).to.equal(0);
    expect(point.leftHandleInOffsetX).to.equal(0);
    expect(point.leftHandleInOffsetY).to.equal(-20);
  });

  it("equalizes detached editable generated handles using anchor-relative offsets", () => {
    const point = {
      rightHandleDetached: true,
      rightHandleInOffsetX: 0,
      rightHandleInOffsetY: -40,
      rightHandleOutOffsetX: 30,
      rightHandleOutOffsetY: 0,
    };
    const anchorPos = { x: 10, y: 20 };
    const equalizeState = buildEditableGeneratedHandleEqualizeState({
      point,
      side: "right",
      handleType: "out",
      anchorPos,
      draggedHandlePos: { x: 40, y: 20 },
      oppositeHandlePos: { x: 10, y: -20 },
      draggedSkeletonHandleDir: { x: 1, y: 0 },
      oppositeSkeletonHandleDir: { x: 0, y: -1 },
      detachedMode: true,
    });

    applyEditableGeneratedHandleEqualizeDelta(point, equalizeState, { x: 5, y: 0 });

    const draggedPos = resolveHandlePosition(equalizeState.draggedState, point, anchorPos);
    const oppositePos = resolveHandlePosition(equalizeState.oppositeState, point, anchorPos);

    expect(draggedPos).to.deep.equal({ x: 45, y: 20 });
    expect(oppositePos).to.deep.equal({ x: 10, y: -15 });
    expect(point.rightHandleOutOffsetX).to.equal(35);
    expect(point.rightHandleOutOffsetY).to.equal(0);
    expect(point.rightHandleInOffsetX).to.equal(0);
    expect(point.rightHandleInOffsetY).to.equal(-35);
  });

  it("treats Shift+X nudge for editable generated handles as a no-op", async () => {
    const handled = await canonicalNudgeAdapters.editableGeneratedHandle({
      sceneController: {
        selection: new Set(),
      },
      pointerTool: {
        equalizeMode: true,
        sceneModel: {
          getSelectedPositionedGlyph() {
            throw new Error("should not evaluate generated-handle nudge state");
          },
        },
      },
      event: {
        key: "ArrowRight",
        shiftKey: true,
        altKey: false,
      },
      editableHandles: [{ pointIndex: 12 }],
    });

    expect(handled).to.equal(false);
  });
});
