import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Four levels up from tests/scripts/ reaches the repo root; the donor checkout
// lives at <repo>/skeleton.
import { generateContoursFromSkeleton as generateDonorContours } from "../../../../skeleton/src-js/fontra-core/src/skeleton-contour-generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(
  __dirname,
  "..",
  "data",
  "skeleton-generator",
  "fixtures.json"
);

const CAP_CORNER_POINT_FIELDS = [
  "capStyle",
  "capRadiusRatio",
  "capTension",
  "capAngle",
  "capDistance",
  "roundnessStrength",
  "cornerAsymmetry",
];

const fixtures = [
  {
    name: "open-line-butt-cap",
    canonical: {
      version: 1,
      nextId: 4,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [point(2, 0, 0), point(3, 100, 0)],
        },
      ],
      generated: [],
    },
  },
  {
    name: "closed-triangle",
    canonical: {
      version: 1,
      nextId: 5,
      contours: [
        {
          id: 1,
          closed: true,
          defaultWidth: 60,
          singleSided: null,
          points: [point(2, 0, 0), point(3, 100, 0), point(4, 50, 80)],
        },
      ],
      generated: [],
    },
  },
  {
    name: "open-cubic-round-cap",
    canonical: {
      version: 1,
      nextId: 6,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 70,
          singleSided: null,
          points: [
            point(2, 0, 0, { capStyle: "round" }),
            offCurve(3, 40, 120),
            offCurve(4, 120, 120),
            point(5, 160, 0, { capStyle: "round" }),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "single-sided-left",
    canonical: {
      version: 1,
      nextId: 4,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: "left",
          points: [point(2, 0, 0), point(3, 120, 0)],
        },
      ],
      generated: [],
    },
  },
  {
    name: "asymmetric-editable-nudge",
    canonical: {
      version: 1,
      nextId: 4,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            point(2, 0, 0, {
              width: { left: 20, right: 45, linked: false },
              editable: { left: true, right: true },
              nudge: { left: 8, right: -6 },
            }),
            point(3, 140, 0, {
              width: { left: 35, right: 10, linked: false },
              editable: { left: true, right: true },
              nudge: { left: -4, right: 5 },
            }),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "detached-handle-offsets",
    canonical: {
      version: 1,
      nextId: 6,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            point(2, 0, 0, {
              editable: { left: true, right: true },
              handleOffsets: {
                leftOut: { x: -12, y: 20, detached: true },
                rightOut: { x: 12, y: -16, detached: true },
              },
            }),
            offCurve(3, 40, 90),
            offCurve(4, 100, 90),
            point(5, 140, 0, {
              editable: { left: true, right: true },
              handleOffsets: {
                leftIn: { x: 10, y: 22, detached: true },
                rightIn: { x: -10, y: -18, detached: true },
              },
            }),
          ],
        },
      ],
      generated: [],
    },
  },
];

for (const fixture of fixtures) {
  fixture.donorInput = canonicalToDonor(fixture.canonical);
  fixture.expectedContours = generateDonorContours(fixture.donorInput);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);

function point(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    type: null,
    smooth: false,
    width: { left: 40, right: 40, linked: true },
    nudge: { left: 0, right: 0 },
    editable: { left: false, right: false },
    handleOffsets: {},
    ...extra,
  };
}

function offCurve(id, x, y) {
  return { id, x, y, type: "cubic", smooth: false };
}

function canonicalToDonor(skeletonData) {
  return {
    contours: skeletonData.contours.map((contour) => ({
      isClosed: contour.closed,
      defaultWidth: contour.defaultWidth,
      singleSided: contour.singleSided !== null,
      singleSidedDirection: contour.singleSided || "left",
      capStyle: contour.capStyle || "butt",
      reversed: contour.reversed === true,
      cornerTrimRatio: contour.cornerTrimRatio,
      cornerRadiusBoost: contour.cornerRadiusBoost,
      points: contour.points.map(canonicalPointToDonor),
    })),
  };
}

function canonicalPointToDonor(point) {
  const donorPoint = {
    x: point.x,
    y: point.y,
    smooth: point.smooth === true,
  };
  if (point.type) {
    donorPoint.type = point.type;
    return donorPoint;
  }

  donorPoint.leftWidth = point.width?.left ?? 40;
  donorPoint.rightWidth = point.width?.right ?? 40;
  donorPoint.leftNudge = point.nudge?.left ?? 0;
  donorPoint.rightNudge = point.nudge?.right ?? 0;
  donorPoint.leftEditable = point.editable?.left === true;
  donorPoint.rightEditable = point.editable?.right === true;
  for (const field of CAP_CORNER_POINT_FIELDS) {
    if (point[field] !== null && point[field] !== undefined) {
      donorPoint[field] = point[field];
    }
  }

  copyHandleOffsetsToDonor(donorPoint, "left", point.handleOffsets?.leftIn, "In");
  copyHandleOffsetsToDonor(donorPoint, "left", point.handleOffsets?.leftOut, "Out");
  copyHandleOffsetsToDonor(donorPoint, "right", point.handleOffsets?.rightIn, "In");
  copyHandleOffsetsToDonor(donorPoint, "right", point.handleOffsets?.rightOut, "Out");
  return donorPoint;
}

function copyHandleOffsetsToDonor(donorPoint, side, offset, inOut) {
  if (!offset) {
    return;
  }
  const prefix = `${side}Handle${inOut}`;
  donorPoint[`${prefix}OffsetX`] = offset.x ?? 0;
  donorPoint[`${prefix}OffsetY`] = offset.y ?? 0;
  donorPoint[`${prefix}Detached`] = offset.detached === true;
}
