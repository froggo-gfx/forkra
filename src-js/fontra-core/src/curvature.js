// src-js/fontra-core/src/curvature.js
// --- Adapted from Speed Punk's Python logic to JavaScript ---
//
// Full helper set (position/derivatives, curvature sampling) with
// corrected curvatureToColor that supports per-segment normalization.
//
// Exports:
//  solveCubicBezier, solveQuadraticBezier,
//  solveCubicBezierCurvature, solveQuadraticBezierCurvature,
//  calculateCurvatureForSegment, calculateCurvatureForQuadraticSegment,
//  curvatureToColor

// --- cubic solver
export function solveCubicBezier(p1, p2, p3, p4, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  // Position r(t)
  const r_x = p1[0] * mt2 * mt + 3 * p2[0] * mt2 * t + 3 * p3[0] * mt * t2 + p4[0] * t2 * t;
  const r_y = p1[1] * mt2 * mt + 3 * p2[1] * mt2 * t + 3 * p3[1] * mt * t2 + p4[1] * t2 * t;

  // First derivative r'(t) * 3
  const r1_x = (p2[0] - p1[0]) * mt2 + 2 * (p3[0] - p2[0]) * mt * t + (p4[0] - p3[0]) * t2;
  const r1_y = (p2[1] - p1[1]) * mt2 + 2 * (p3[1] - p2[1]) * mt * t + (p4[1] - p3[1]) * t2;
  const r1 = [r1_x * 3, r1_y * 3];

  // Second derivative r''(t) * 6
  const r2_x = (p3[0] - 2 * p2[0] + p1[0]) * mt + (p4[0] - 2 * p3[0] + p2[0]) * t;
  const r2_y = (p3[1] - 2 * p2[1] + p1[1]) * mt + (p4[1] - 2 * p3[1] + p2[1]) * t;
  const r2 = [r2_x * 6, r2_y * 6];

  return { r: [r_x, r_y], r1: r1, r2: r2 };
}

// --- quadratic solver
export function solveQuadraticBezier(p1, p2, p3, t) {
  const mt = 1 - t;

  const r_x = p1[0] * mt * mt + 2 * p2[0] * mt * t + p3[0] * t * t;
  const r_y = p1[1] * mt * mt + 2 * p2[1] * mt * t + p3[1] * t * t;

  // first derivative *2 then scaled *2 (matching prior code)
  const r1_x = 2 * (p2[0] - p1[0]) * mt + 2 * (p3[0] - p2[0]) * t;
  const r1_y = 2 * (p2[1] - p1[1]) * mt + 2 * (p3[1] - p2[1]) * t;
  const r1 = [r1_x * 2, r1_y * 2];

  // second derivative constant *2 then scaled *2
  const r2_x = 2 * (p1[0] - 2 * p2[0] + p3[0]);
  const r2_y = 2 * (p1[1] - 2 * p2[1] + p3[1]);
  const r2 = [r2_x * 2, r2_y * 2];

  return { r: [r_x, r_y], r1: r1, r2: r2 };
}

// --- curvature calculation (signed or unsigned depending on needs)
// the existing code used absolute values in many places; keep returning ABS (old behavior),
// but callers may use Math.sign(...) if they want signed height.
export function solveCubicBezierCurvature(r1, r2) {
  const dx = r1[0], dy = r1[1];
  const d2x = r2[0], d2y = r2[1];
  const cross = dx * d2y - dy * d2x;
  const mag_r1_sq = dx * dx + dy * dy;
  if (mag_r1_sq === 0) {
    return 0;
  }
  const mag_r1 = Math.sqrt(mag_r1_sq);
  // curvature = |r' x r''| / |r'|^3
  return Math.abs(cross) / (mag_r1 * mag_r1 * mag_r1);
}

export function solveQuadraticBezierCurvature(r1, r2) {
  const dx = r1[0], dy = r1[1];
  const d2x = r2[0], d2y = r2[1];
  const cross = dx * d2y - dy * d2x;
  const mag_r1_sq = dx * dx + dy * dy;
  if (mag_r1_sq === 0) {
    return 0;
  }
  const mag_r1 = Math.sqrt(mag_r1_sq);
  return Math.abs(cross) / (mag_r1 * mag_r1 * mag_r1);
}

/**
 * Sample cubic segment; returns samples array:
 * [{ t, curvature, r?: [x,y], r1?: [dx,dy] }, ...]
 * (Note: the visualization code uses solveCubicBezier separately to get r/r1)
 */
export function calculateCurvatureForSegment(p1, p2, p3, p4, steps = 20) {
  const curvs = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { r1, r2 } = solveCubicBezier(p1, p2, p3, p4, t);
    const k = solveCubicBezierCurvature(r1, r2);
    curvs.push({ t, curvature: k });
  }
  return curvs;
}

/**
 * Sample quadratic segment; same shape as cubic.
 */
export function calculateCurvatureForQuadraticSegment(p1, p2, p3, steps = 20) {
  const curvs = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { r1, r2 } = solveQuadraticBezier(p1, p2, p3, t);
    const k = solveQuadraticBezierCurvature(r1, r2);
    curvs.push({ t, curvature: k });
  }
  return curvs;
}

/* ---------- color helpers ---------- */

// convert "#rrggbb" to [r,g,b]
function _hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function interpolateColor(color1, color2, t) {
  const a = _hexToRgb(color1);
  const b = _hexToRgb(color2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgba(${r}, ${g}, ${bl}, 1)`;
}

/**
 * Map absolute curvature -> color using per-segment min/max normalization.
 * NEW SIGNATURE:
 *   curvatureToColor(curvatureAbs, minAbs, maxAbs, colorStops)
 *
 * - curvatureAbs: non-negative absolute curvature value
 * - minAbs, maxAbs: per-segment min/max absolute curvature (the visualization must pass these)
 * - colorStops: array of hex strings
 */
export function curvatureToColor(curvatureAbs, minAbs, maxAbs, colorStops = ["#8b939c", "#f29400", "#e3004f"]) {
  // safe defaults
  if (!Array.isArray(colorStops) || colorStops.length === 0) {
    return "rgba(0,0,0,1)";
  }

  // degenerate: all identical -> return middle or last stop
  if (maxAbs <= minAbs) {
    const mid = Math.floor((colorStops.length - 1) / 2);
    return interpolateColor(colorStops[mid], colorStops[mid], 0);
  }

  // normalize to [0,1]
  let t = (curvatureAbs - minAbs) / (maxAbs - minAbs);
  t = Math.max(0, Math.min(1, t));

  const segments = colorStops.length - 1;
  const segIndex = Math.min(Math.floor(t * segments), segments - 1);
  const localT = t * segments - segIndex;
  return interpolateColor(colorStops[segIndex], colorStops[segIndex + 1], localT);
}
