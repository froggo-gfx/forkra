// WS-16 Task 8: generated contours must stay interpolation-compatible across
// designspace sources whose skeletons are structurally identical. Fontra
// interpolates by point index, so two sources must produce the same number of
// contours, matching closed flags, and identical per-contour point counts and
// on/off-curve type sequences. Only coordinates/widths may differ.

import { generateFromSkeleton } from "@fontra/core/skeleton-generator.js";
import { SKELETON_SCHEMA_VERSION } from "@fontra/core/skeleton-model.js";
import { expect } from "chai";

// A structurally fixed skeleton: same contour/point ids and types, parameterized
// only by coordinates and half-widths (the things that vary across sources).
function makeSkeleton({ x0, y0, x1, y1, width }) {
  return {
    version: SKELETON_SCHEMA_VERSION,
    nextId: 10,
    contours: [
      {
        id: 1,
        closed: false,
        singleSided: null,
        defaultWidth: 80,
        points: [
          {
            id: 2,
            x: x0,
            y: y0,
            type: null,
            smooth: false,
            width: { left: width, right: width, linked: true },
          },
          {
            id: 3,
            x: x1,
            y: y1,
            type: null,
            smooth: false,
            width: { left: width, right: width, linked: true },
          },
        ],
      },
    ],
    generated: [],
  };
}

function contourSignature(contours) {
  return contours.map((contour) => ({
    isClosed: contour.isClosed === true,
    pointTypes: contour.points.map((point) => point.type || null),
  }));
}

describe("skeleton generated-contour interpolation compatibility", () => {
  it("produces identical structure for two coordinate-only source variants", () => {
    const a = generateFromSkeleton(
      makeSkeleton({ x0: 100, y0: 0, x1: 100, y1: 700, width: 40 })
    );
    const b = generateFromSkeleton(
      makeSkeleton({ x0: 140, y0: 0, x1: 160, y1: 720, width: 40 })
    );
    expect(a.contours.length).to.equal(b.contours.length);
    expect(contourSignature(a.contours)).to.deep.equal(contourSignature(b.contours));
  });

  it("stays compatible when widths differ but structure matches", () => {
    const thin = generateFromSkeleton(
      makeSkeleton({ x0: 100, y0: 0, x1: 100, y1: 700, width: 20 })
    );
    const bold = generateFromSkeleton(
      makeSkeleton({ x0: 100, y0: 0, x1: 100, y1: 700, width: 90 })
    );
    expect(contourSignature(thin.contours)).to.deep.equal(
      contourSignature(bold.contours)
    );
  });

  it("documents that a structural difference (extra point) is incompatible", () => {
    const base = generateFromSkeleton(
      makeSkeleton({ x0: 100, y0: 0, x1: 100, y1: 700, width: 40 })
    );
    const withExtra = makeSkeleton({ x0: 100, y0: 0, x1: 100, y1: 700, width: 40 });
    withExtra.contours[0].points.push({
      id: 4,
      x: 100,
      y: 350,
      type: null,
      smooth: false,
      width: { left: 40, right: 40, linked: true },
    });
    const extra = generateFromSkeleton(withExtra);
    // The generator faithfully reflects the different skeleton structure, so the
    // outputs are NOT interpolation-compatible — this is the caller's contract to
    // keep skeleton structure identical across sources, not a generator bug.
    const baseCount = base.contours.reduce((n, c) => n + c.points.length, 0);
    const extraCount = extra.contours.reduce((n, c) => n + c.points.length, 0);
    expect(extraCount).to.not.equal(baseCount);
  });
});
