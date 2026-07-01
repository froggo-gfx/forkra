import { PathHitTester } from "./path-hit-tester.js";

export function polygonArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    s += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(s) * 0.5;
}

export function setDepth(margins, extreme, maxDepth, isLeft) {
  if (isLeft) {
    const limit = extreme + maxDepth;
    return margins.map((p) => ({
      x: Math.min(p.x, limit),
      y: p.y,
    }));
  } else {
    const limit = extreme - maxDepth;
    return margins.map((p) => ({
      x: Math.max(p.x, limit),
      y: p.y,
    }));
  }
}

export function closePolygon(margins, extreme, minY, maxY) {
  const polygon = [...margins];
  polygon.push({ x: extreme, y: maxY });
  polygon.push({ x: extreme, y: minY });
  return polygon;
}

export function calculateSidebearing(polygon, targetArea, amplitudeY) {
  const currentArea = polygonArea(polygon);
  const shortfall = targetArea - currentArea;
  return shortfall / amplitudeY;
}

export function computeTargetAreaFromSidebearing(
  polygonAreaValue,
  sidebearing,
  amplitudeY
) {
  return polygonAreaValue + sidebearing * amplitudeY;
}

export function computeParamAreaFromTargetArea(
  targetArea,
  fontMetrics,
  amplitudeY,
  factor = 1
) {
  const upmScale = Math.pow(fontMetrics.upm / 1000, 2);
  if (amplitudeY === 0 || upmScale === 0 || factor === 0) {
    return 0;
  }
  return (targetArea * fontMetrics.xHeight) / (amplitudeY * 100 * upmScale * factor);
}

export class LetterspacerEngine {
  constructor(params, fontMetrics) {
    this.params = params;
    this.upm = fontMetrics.upm;
    this.xHeight = fontMetrics.xHeight;
    this.angle = fontMetrics.italicAngle || 0;
    this.scanLines = [];
    this.leftPolygon = [];
    this.rightPolygon = [];
    this.leftSBPolygon = [];
    this.rightSBPolygon = [];
    this.leftSBLine = null;
    this.rightSBLine = null;
    this.lsb = null;
    this.rsb = null;
    this.leftMargins = [];
    this.rightMargins = [];
    this.leftMarginsProcessed = [];
    this.rightMarginsProcessed = [];
    this.leftExtreme = null;
    this.rightExtreme = null;
    this.leftExtremeDepthLimited = null;
    this.rightExtremeDepthLimited = null;
    this.leftDepthLimit = null;
    this.rightDepthLimit = null;
  }

  computeSpacing(path, bounds, refMinY, refMaxY, factor = 1) {
    const freq = 5;
    const amplitudeY = refMaxY - refMinY;

    this.scanLines = [];
    this.leftPolygon = [];
    this.rightPolygon = [];
    this.leftSBPolygon = [];
    this.rightSBPolygon = [];
    this.leftMarginsProcessed = [];
    this.rightMarginsProcessed = [];

    const areaUPM = this.params.area * factor * Math.pow(this.upm / 1000, 2);
    const targetArea = (amplitudeY * areaUPM * 100) / this.xHeight;

    const maxDepth = (this.xHeight * this.params.depth) / 100;

    const margins = this.collectMargins(path, bounds, refMinY, refMaxY, freq);
    this.leftMargins = margins.leftMargins;
    this.rightMargins = margins.rightMargins;
    this.leftExtreme = margins.leftExtreme;
    this.rightExtreme = margins.rightExtreme;

    if (!margins.hasRefIntersections) {
      return { lsb: null, rsb: null, noRefIntersections: true };
    }

    if (this.leftMargins.length < 2 || this.rightMargins.length < 2) {
      return { lsb: null, rsb: null };
    }

    const processedLeft = setDepth(this.leftMargins, this.leftExtreme, maxDepth, true);
    const processedRight = setDepth(
      this.rightMargins,
      this.rightExtreme,
      maxDepth,
      false
    );

    this.leftMarginsProcessed = [...processedLeft];
    this.rightMarginsProcessed = [...processedRight];

    this.leftDepthLimit = this.leftExtreme + maxDepth;
    this.rightDepthLimit = this.rightExtreme - maxDepth;

    this.leftExtremeDepthLimited = Math.min(...processedLeft.map((p) => p.x));
    this.rightExtremeDepthLimited = Math.max(...processedRight.map((p) => p.x));

    this.leftPolygon = closePolygon(processedLeft, this.leftExtreme, refMinY, refMaxY);
    this.rightPolygon = closePolygon(
      processedRight,
      this.rightExtreme,
      refMinY,
      refMaxY
    );

    this.lsb = calculateSidebearing(this.leftPolygon, targetArea, amplitudeY);
    this.rsb = calculateSidebearing(this.rightPolygon, targetArea, amplitudeY);

    this.leftSBLine = this.leftExtremeDepthLimited - this.lsb;
    this.rightSBLine = this.rightExtremeDepthLimited + this.rsb;

    this.leftSBPolygon = [...this.leftPolygon];
    this.rightSBPolygon = [...this.rightPolygon];

    return { lsb: this.lsb, rsb: this.rsb, noRefIntersections: false };
  }

  collectMargins(path, bounds, minY, maxY, freq) {
    const hitTester = new PathHitTester(path, bounds);
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = Infinity;
    let rightExtreme = -Infinity;
    let hasRefIntersections = false;

    this.scanLines = [];

    for (let y = minY; y <= maxY; y += freq) {
      const lineStart = { x: bounds.xMin - 100, y };
      const lineEnd = { x: bounds.xMax + 100, y };

      const intersections = hitTester.lineIntersections(lineStart, lineEnd);

      this.scanLines.push({
        start: lineStart,
        end: lineEnd,
        intersections: [...intersections],
        y,
      });

      if (intersections.length >= 2) {
        hasRefIntersections = true;
        const sorted = intersections
          .map((i) => (i.x !== undefined ? i : { x: i.point?.x }))
          .filter((i) => i.x !== undefined)
          .sort((a, b) => a.x - b.x);

        if (sorted.length >= 2) {
          const left = sorted[0].x;
          const right = sorted[sorted.length - 1].x;

          leftMargins.push({ x: left, y });
          rightMargins.push({ x: right, y });

          leftExtreme = Math.min(leftExtreme, left);
          rightExtreme = Math.max(rightExtreme, right);
        }
      }
    }

    if (leftExtreme === Infinity) {
      leftExtreme = bounds.xMin;
    }
    if (rightExtreme === -Infinity) {
      rightExtreme = bounds.xMax;
    }

    return {
      leftMargins,
      rightMargins,
      leftExtreme,
      rightExtreme,
      hasRefIntersections,
    };
  }
}
