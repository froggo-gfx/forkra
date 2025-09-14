// src-js/fontra-core/src/curvature.js

// --- Adapted from Speed Punk's Python logic to JavaScript ---

/**
 * Calculates the position, first derivative, and second derivative
 * of a cubic Bezier curve at parameter t.
 * @param {Array} p1 - Start point [x, y]
 * @param {Array} p2 - First control point [x, y]
 * @param {Array} p3 - Second control point [x, y]
 * @param {Array} p4 - End point [x, y]
 * @param {number} t - Parameter (0 <= t <= 1)
 * @returns {Object} Object containing {r: position, r1: 1st derivative, r2: 2nd derivative}
 */
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
  const r1 = [r1_x * 3, r1_y * 3]; // Speed Punk uses unscaled derivative

  // Second derivative r''(t) * 6
  const r2_x = (p3[0] - 2 * p2[0] + p1[0]) * mt + (p4[0] - 2 * p3[0] + p2[0]) * t;
  const r2_y = (p3[1] - 2 * p2[1] + p1[1]) * mt + (p4[1] - 2 * p3[1] + p2[1]) * t;
  const r2 = [r2_x * 6, r2_y * 6]; // Speed Punk uses unscaled derivative

  return { r: [r_x, r_y], r1: r1, r2: r2 };
}

/**
 * Calculates the curvature of a parametric curve given its first and second derivatives.
 * Handles cases where the first derivative is zero (straight line segment).
 * @param {Array} r1 - First derivative [dx/dt, dy/dt] (unscaled by Speed Punk)
 * @param {Array} r2 - Second derivative [d2x/dt2, d2y/dt2] (unscaled by Speed Punk)
 * @returns {number|null} The curvature, or null if calculation fails (e.g., straight line).
 */
export function solveCubicBezierCurvature(r1, r2) {
  // Speed Punk uses unscaled derivatives, so we compensate by multiplying by 3 or 6
  // and then dividing by 3^3 in the curvature formula.
  // k = |r' x r''| / |r'|^3
  // Using unscaled r1 (3 * actual) and r2 (6 * actual):
  // k = |(r1/3) x (r2/6)| / |r1/3|^3 = (1/18) * |r1 x r2| / (1/27) * |r1|^3
  // k = (27/18) * (|r1 x r2| / |r1|^3) = 1.5 * (|r1 x r2| / |r1|^3)
  // However, Speed Punk's `Value` method uses `abs(set[3])` where `set[3]` is `k`.
  // And it applies `drawfactor` afterwards. So, we just calculate `k` directly here.

  const dx_dt = r1[0];
  const dy_dt = r1[1];
  const d2x_dt2 = r2[0];
  const d2y_dt2 = r2[1];

  const cross = dx_dt * d2y_dt2 - dy_dt * d2x_dt2; // z-component of cross product
  const mag_r1_sq = dx_dt * dx_dt + dy_dt * dy_dt;

  if (mag_r1_sq === 0) {
    // Handle straight line segments or cusps where velocity is zero
    // Speed Punk likely skips these or assigns zero curvature
    return 0; // Or return null and handle in calling code
  }

  const mag_r1 = Math.sqrt(mag_r1_sq);
  // k = |r' x r''| / |r'|^3
  const curvature = Math.abs(cross) / (mag_r1 * mag_r1 * mag_r1);
  return curvature;
}

/**
 * Calculates curvature values along a cubic Bezier segment.
 * @param {Array} p1 - Start point [x, y]
 * @param {Array} p2 - First control point [x, y]
 * @param {Array} p3 - Second control point [x, y]
 * @param {Array} p4 - End point [x, y]
 * @param {number} steps - Number of steps to sample curvature.
 * @returns {Array} Array of {t, curvature} objects.
 */
export function calculateCurvatureForSegment(p1, p2, p3, p4, steps = 20) {
  const curvatures = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { r1, r2 } = solveCubicBezier(p1, p2, p3, p4, t);
    try {
      const k = solveCubicBezierCurvature(r1, r2);
      if (k !== null) {
        curvatures.push({ t: t, curvature: k });
      } else {
        // Handle null curvature if necessary (e.g., push a default value)
        curvatures.push({ t: t, curvature: 0 });
      }
    } catch (e) {
      console.error("Error calculating curvature:", e);
      curvatures.push({ t: t, curvature: 0 }); // Default on error
    }
  }
  return curvatures;
}

/**
 * Calculates the position, first derivative, and second derivative
 * of a quadratic Bezier curve at parameter t.
 * @param {Array} p1 - Start point [x, y]
 * @param {Array} p2 - Control point [x, y]
 * @param {Array} p3 - End point [x, y]
 * @param {number} t - Parameter (0 <= t <= 1)
 * @returns {Object} Object containing {r: position, r1: 1st derivative, r2: 2nd derivative}
*/
export function solveQuadraticBezier(p1, p2, p3, t) {
  const mt = 1 - t;
  
  // Position r(t)
  const r_x = p1[0] * mt * mt + 2 * p2[0] * mt * t + p3[0] * t * t;
  const r_y = p1[1] * mt * mt + 2 * p2[1] * mt * t + p3[1] * t * t;
  
  // First derivative r'(t) * 2
  const r1_x = 2 * (p2[0] - p1[0]) * mt + 2 * (p3[0] - p2[0]) * t;
  const r1_y = 2 * (p2[1] - p1[1]) * mt + 2 * (p3[1] - p2[1]) * t;
  const r1 = [r1_x * 2, r1_y * 2]; // Speed Punk uses unscaled derivative
  
  // Second derivative r''(t) * 2
  const r2_x = 2 * (p1[0] - 2 * p2[0] + p3[0]);
  const r2_y = 2 * (p1[1] - 2 * p2[1] + p3[1]);
  const r2 = [r2_x * 2, r2_y * 2]; // Speed Punk uses unscaled derivative
  
  return { r: [r_x, r_y], r1: r1, r2: r2 };
}

/**
* Calculates the curvature of a parametric curve given its first and second derivatives.
 * Handles cases where the first derivative is zero (straight line segment).
 * @param {Array} r1 - First derivative [dx/dt, dy/dt] (unscaled by Speed Punk)
 * @param {Array} r2 - Second derivative [d2x/dt2, d2y/dt2] (unscaled by Speed Punk)
 * @returns {number|null} The curvature, or null if calculation fails (e.g., straight line).
*/
export function solveQuadraticBezierCurvature(r1, r2) {
  // Speed Punk uses unscaled derivatives, so we compensate by multiplying by 2 or 4
  // and then dividing by 2^3 in the curvature formula.
  // k = |r' x r''| / |r'|^3
  // Using unscaled r1 (2 * actual) and r2 (4 * actual):
  // k = |(r1/2) x (r2/4)| / |r1/2|^3 = (1/8) * |r1 x r2| / (1/8) * |r1|^3
  // k = (8/8) * (|r1 x r2| / |r1|^3) = |r1 x r2| / |r1|^3
  
  const dx_dt = r1[0];
  const dy_dt = r1[1];
  const d2x_dt2 = r2[0];
  const d2y_dt2 = r2[1];
  
  const cross = dx_dt * d2y_dt2 - dy_dt * d2x_dt2; // z-component of cross product
  const mag_r1_sq = dx_dt * dx_dt + dy_dt * dy_dt;
  
  if (mag_r1_sq === 0) {
    // Handle straight line segments or cusps where velocity is zero
    // Speed Punk likely skips these or assigns zero curvature
    return 0; // Or return null and handle in calling code
  }
  
  const mag_r1 = Math.sqrt(mag_r1_sq);
  // k = |r' x r''| / |r'|^3
  const curvature = Math.abs(cross) / (mag_r1 * mag_r1 * mag_r1);
  return curvature;
}

/**
 * Calculates curvature values along a quadratic Bezier segment.
 * @param {Array} p1 - Start point [x, y]
* @param {Array} p2 - Control point [x, y]
 * @param {Array} p3 - End point [x, y]
 * @param {number} steps - Number of steps to sample curvature.
 * @returns {Array} Array of {t, curvature} objects.
 */
export function calculateCurvatureForQuadraticSegment(p1, p2, p3, steps = 20) {
  const curvatures = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { r1, r2 } = solveQuadraticBezier(p1, p2, p3, t);
    try {
      const k = solveQuadraticBezierCurvature(r1, r2);
      if (k !== null) {
        curvatures.push({ t: t, curvature: k });
      } else {
        // Handle null curvature if necessary (e.g., push a default value)
        curvatures.push({ t: t, curvature: 0 });
      }
    } catch (e) {
      console.error("Error calculating curvature:", e);
      curvatures.push({ t: t, curvature: 0 }); // Default on error
    }
  }
  return curvatures;
}

/**
 * Interpolates between two hex colors.
 * @param {string} color1 - Hex color string (e.g., "#RRGGBB" or "RRGGBB")
 * @param {string} color2 - Hex color string (e.g., "#RRGGBB" or "RRGGBB")
 * @param {number} t - Interpolation factor (0.0 to 1.0)
 * @returns {string} RGBA color string "rgba(r, g, b, 1)"
 */
export function interpolateColor(color1, color2, t) {
    // Ensure color strings are clean (remove # if present)
    const c1 = color1.startsWith('#') ? color1.substring(1) : color1;
    const c2 = color2.startsWith('#') ? color2.substring(1) : color2;

    const r1 = parseInt(c1.substring(0, 2), 16);
    const g1 = parseInt(c1.substring(2, 4), 16);
    const b1 = parseInt(c1.substring(4, 6), 16);

    const r2 = parseInt(c2.substring(0, 2), 16);
    const g2 = parseInt(c2.substring(2, 4), 16);
    const b2 = parseInt(c2.substring(4, 6), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `rgba(${r}, ${g}, ${b}, 1)`;
}

/**
* Maps a curvature value to a color based on local normalization.
 * @param {number} curvature - The curvature value.
 * @param {Array<string>} colorStops - Array of hex color strings for the gradient.
 * @returns {string} RGBA color string.
 */
export function curvatureToColor(curvature, colorStops) {
    const kAbs = Math.abs(curvature);
    const drawFactor = 0.01;          // same constant Speed-Punk uses
    const curveGain  = 1.0;           // keep configurable later
    const unitsEm    = 1000;          // UPM – will be passed in step 2
    const normalised = kAbs * drawFactor * curveGain * unitsEm * unitsEm;
    
    // map to 0-1 with a soft clamp exactly like Python
    const t = Math.max(0, Math.min(1, normalised));   // no global min/max needed

    // Simple linear interpolation between stops
    // For N stops, we have N-1 segments
    const numSegments = colorStops.length - 1;
    if (numSegments <= 0) return `rgba(0, 0, 0, 1)`; // Fallback

    const segmentIndex = Math.min(Math.floor(t * numSegments), numSegments - 1);
    const segmentT = (t * numSegments) - segmentIndex; // t within the segment (0-1)

    const color1 = colorStops[segmentIndex];
    const color2 = colorStops[segmentIndex + 1];

    return interpolateColor(color1, color2, segmentT);
}

