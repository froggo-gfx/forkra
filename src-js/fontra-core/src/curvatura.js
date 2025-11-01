/**
 * Curvatura: Mathematical functions for curvature operations in Fontra
 * 
 * This module implements the core mathematical functionality from the Curvatura FontForge plugin
 * adapted for Fontra's JavaScript environment. It provides functions for harmonizing,
 * tunnifying, adding inflection points, and adjusting curve handles based on curvature.
 */

import * as vector from "./vector.js";

/**
 * Returns the signed distance of the point p from the line
 * starting in q and going to r. The value is positive, iff
 * p is right from the line.
 */
export function side(px, py, qx, qy, rx, ry) {
  const a = rx - qx;
  const b = ry - qy;
  return ((py - qy) * a - (px - qx) * b) / Math.sqrt(a * a + b * b);
}

/**
 * Returns for a cubic bezier path (a,b), (c,d), (e,f), (g,h)
 * the direction at (a,b). Other than the derivative, the direction
 * has never length 0 as long as (a,b) != (g,h)
 */
export function directionAtStart(a, b, c, d, e, f, g, h) {
  if (c === a && d === b && e === g && f === h) {
    return [g - a, h - b];
  } else if (c === a && d === b) {
    return [e - a, f - b];
  } else { // generic case
    return [c - a, d - b];
  }
}

/**
 * Returns for a cubic bezier path (a,b), (c,d), (e,f), (g,h)
 * the curvature at (a,b). 
 */
export function curvatureAtStart(a, b, c, d, e, f, g, h) {
  if (b === d && a === c) {
    return 0;
  }
  return (2.0 / 3.0) * (c * f - a * f - d * e + b * e + a * d - b * c) / Math.pow((b - d) * (b - d) + (a - c) * (a - c), 1.5);
}

/**
 * Returns for a cubic bezier path from (0,0) to (1,0) with
 * enclosing angles alpha and beta with the x-axis and 
 * handle lengths a and b the energy with simpson's rule (10 divisions).
 */
export function energy(alpha, beta, a, b) {
  const sa = Math.sin(alpha);
  const sb = Math.sin(beta);
  const ca = Math.cos(alpha);
  const cb = Math.cos(beta);
  const xx_2 = 3 * b * cb + 3 * a * ca - 2;
  const xx_1 = -2 * b * cb - 4 * a * ca + 2;
  const xx_0 = a * ca;
  const yy_2 = -3 * b * sb + 3 * a * sa;
  const yy_1 = -4 * a * sa + 2 * b * sb;
  const yy_0 = a * sa;
  const xxx_1 = 3 * b * cb + 3 * a * ca - 2;
  const xxx_0 = -b * cb - 2 * a * ca + 1;
 const yyy_1 = -3 * b * sb + 3 * a * sa;
 const yyy_0 = b * sb - 2 * a * sa;
 let integral = 0;
  let curv_before = Math.pow(18 * xx_0 * yyy_0 - 18 * xxx_0 * yy_0, 2) / Math.pow(9 * xx_0 * xx_0 + 9 * yy_0 * yy_0, 2.5);
  
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const xx = 3 * (xx_2 * t * t + xx_1 * t + xx_0);
    const yy = 3 * (yy_2 * t * t + yy_1 * t + yy_0);
    const xxx = 6 * (xxx_1 * t + xxx_0);
    const yyy = 6 * (yyy_1 * t + yyy_0);
    const curv = Math.pow(xx * yyy - xxx * yy, 2) / Math.pow(xx * xx + yy * yy, 2.5);
    const t_between = t - 0.05;
    const xx_between = 3 * (xx_2 * t_between * t_between + xx_1 * t_between + xx_0);
    const yy_between = 3 * (yy_2 * t_between * t_between + yy_1 * t_between + yy_0);
    const xxx_between = 6 * (xxx_1 * t_between + xxx_0);
    const yyy_between = 6 * (yyy_1 * t_between + yyy_0);
    const curv_between = Math.pow(xx_between * yyy_between - xxx_between * yy_between, 2) / Math.pow(xx_between * xx_between + yy_between * yy_between, 2.5);
    integral += 0.1 / 6 * (curv_before + 4 * curv_between + curv);
    curv_before = curv;
  }
  return integral / 10;
}

/**
 * Returns the coefficients of the polynomial with the 
 * coefficients coeffs. (The polynomial a*x^2+b*x+c is represented by 
 * the coefficients [a,b,c].)
 */
export function derive(coeffs) {
  const n = coeffs.length;
  const derivative = [];
  for (let i = 0; i < n - 1; i++) {
    derivative.push(coeffs[i] * (n - i - 1));
  }
  return derivative;
}

/**
 * Divides the polynomial with the coefficients by (x-r) where r is a
 * root of the polynomial (no remainder, Horner)
 */
export function polynomialDivision(coeffs, r) {
  const result = [coeffs[0]];
  for (let i = 1; i < coeffs.length - 1; i++) { // -1 because of no remainder
    result.push(coeffs[i] + result[result.length - 1] * r);
  }
  return result;
}

/**
 * Evaluates a polynomial with coefficients coeffs in x with (Horner)
 */
export function evaluate(coeffs, x) {
  let result = coeffs[0];
  for (let i = 1; i < coeffs.length; i++) {
    result = result * x + coeffs[i];
  }
  return result;
}

/**
 * Newton's algorithm for determing a root of a polynomial with 
 * coefficients coeffs (starting value 0)
 */
export function newtonRoot(coeffs) {
  const derivative = derive(coeffs);
 let x = 0;
  for (let i = 0; i < 100; i++) {
    if (evaluate(derivative, x) === 0) {
      x += 1e-9;
    }
    const d = evaluate(coeffs, x) / evaluate(derivative, x);
    x -= d;
    if (Math.abs(d) < 1e-9) {
      return x;
    }
  }
  return null; // algorithm did not converge
}

/**
 * Same as newtonRoot() but returns ALL real roots
 */
export function newtonRoots(coeffs) {
  let f = [...coeffs];
  while (f.length > 0 && f[0] === 0) {
    f.shift();
  }
  const roots = [];
  while (f.length > 1) {
    const r = newtonRoot(f);
    if (r === null) {
      break;
    }
    roots.push(r);
    f = polynomialDivision(f, r);
  }
  return roots;
}

/**
 * Returns the "corner point" of a cubic bezier segment
 * (a,b),(c,d),(e,f),(g,h), which is the intersection of the
 * lines (a,b)--(c,d) and (e,f)--(g,h) in the generic case.
 * If there is no reasonable corner point None,None will be returned.
 */
export function cornerPoint(a, b, c, d, e, f, g, h) {
  if (c === a && d === b && e === g && f === h) {
    return [(a + g) / 2, (b + h) / 2];
  } else if (c === a && d === b) {
    return [e, f];
  } else if (e === g && f === h) {
    return [c, d];
 } else { // generic case
    // check if the handles are on the same side 
    // and no inflection occurs and no division by zero
    // will occur:
    const side1 = side(c, d, a, b, g, h);
    const side2 = side(e, f, a, b, g, h);
    if (side1 * side2 < 0 || inflection(a, b, c, d, e, f, g, h) !== null ||
        c * h - a * h - d * g + b * g - c * f + a * f + d * e - b * e === 0) {
      return [null, null];
    } else { // generic case
      const denom = c * h - a * h - d * g + b * g - c * f + a * f + d * e - b * e;
      if (denom === 0) return [null, null];
      return [
        a + ((c - a) * (e * h - a * h - f * g + b * g + a * f - b * e)) / denom,
        b + ((d - b) * (e * h - a * h - f * g + b * g + a * f - b * e)) / denom
      ];
    }
  }
}

/**
 * Returns True iff the curvature sign of two adjacent cubic 
 * bezier segments (a,b), (c,d), (e,f), (g,h)
 * and (g,h) (i,j) (k,l) (m,n) is different at (g,h)
 */
export function isInflection(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
  return ((i - g) * (h - 2 * j + l) - (j - h) * (g - 2 * i + k)) *
         ((e - g) * (h - 2 * f + d) - (f - h) * (g - 2 * e + c)) > 0;
}

/**
 * Returns the inflection point time of a cubic bezier segment
 * (a,b),(c,d),(e,f),(g,h).
 * If there is no inflection point, None is returned.
 */
export function inflection(a, b, c, d, e, f, g, h) {
  // curvature=0 is an equation aa*t**2+bb*t+c=0 with coefficients: 
  const aa = e * h - 2 * c * h + a * h - f * g + 2 * d * g - b * g + 3 * c * f - 2 * a * f - 3 * d * e + 2 * b * e + a * d - b * c;
  const bb = c * h - a * h - d * g + b * g - 3 * c * f + 3 * a * f + 3 * d * e - 3 * b * e - 2 * a * d + 2 * b * c;
  const cc = c * f - a * f - d * e + b * e + a * d - b * c;
  
  if (aa === 0 && bb !== 0 && 0.001 < -cc / bb && -cc / bb < 0.999) { // lin. eq.
    return -cc / bb;
  } else if (aa !== 0) {
    const discriminant = bb * bb - 4 * aa * cc;
    if (discriminant >= 0) {
      const t1 = (-bb + Math.sqrt(discriminant)) / (2 * aa);
      const t2 = (-bb - Math.sqrt(discriminant)) / (2 * aa);
      if (0.01 < t1 && t1 < 0.999) { // rounding issues
        return t1;
      } else if (0.001 < t2 && t2 < 0.999) {
        return t2;
      }
    }
  }
  return null;
}

/**
 * Tunnifies a cubic bezier path (a,b), (c,d), (e,f), (g,h).
 * i.e. moves the handles (c,d) and (e,f) on the lines (a,b)--(c,d) 
 * and (e,f)--(g,h) in order to reach the ideal stated by Eduardo Tunni.
 */
export function tunnify(a, b, c, d, e, f, g, h) {
  const [l, alpha, beta, da, db, dg, dh] = chordAngles(a, b, c, d, e, f, g, h); // too much computation...
  const aa = Math.sqrt((c - a) * (c - a) + (d - b) * (d - b)) / l;
  const bb = Math.sqrt((e - g) * (e - g) + (f - h) * (f - h)) / l;
  
 if ((aa === 0 && bb === 0) || l === 0) { // then tunnify makes no sense
    return [c, d, e, f]; 
 }
  if (Math.abs((alpha + beta) % Math.PI) === 0) {
    return [
      a + 0.5 * (aa + bb) / aa * (c - a),
      b + 0.5 * (aa + bb) / aa * (d - b),
      g + 0.5 * (aa + bb) / bb * (e - g),
      h + 0.5 * (aa + bb) / bb * (f - h)
    ];    
  }
  if (alpha < 0) { // make alpha nonnegative
    alpha = -alpha;
    beta = -beta;
  }
  if (beta <= 0 || alpha === 0) { // then tunnify makes no sense
    return [c, d, e, f]; 
  }
 const asa = aa * Math.sin(alpha);
  const bsb = bb * Math.sin(beta);
  const ff = 2 * (asa + bsb) - aa * bb * Math.sin(alpha + beta); // ff = area*20/3
  const cotab = 1 / Math.tan(alpha) + 1 / Math.tan(beta);
  const discriminant = 4 - cotab * ff;
  if (discriminant < 0) { // then tunnify makes no sense
    return [c, d, e, f]; 
  }
 let hh = (2 - Math.sqrt(discriminant)) / cotab; // take the smaller solution as the larger could have loops
  if (hh < 0) {
    hh = (2 + Math.sqrt(discriminant)) / cotab;
  }
  return [
    a + hh / Math.sin(alpha) * da * l,
    b + hh / Math.sin(alpha) * db * l,
    g + hh / Math.sin(beta) * dg * l,
    h + hh / Math.sin(beta) * dh * l
  ];
}

/**
 * Given two adjacent cubic bezier curves (a,b), (c,d), (e,f), (g,h)
 * and (g,h), (i,j), (k,l), (m,n) that are smooth at (g,h)
 * this method calculates a new point (g,h) such that
 * the curves are G2-continuous in (g,h).
 * This method does not check if the necessary conditions are 
 * actually met (such as smoothness).
 */
export function harmonizeCubic(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
  if (e === i && f === j) {
    return [g, h]; // no changes
  }
  const d2 = Math.abs(side(c, d, e, f, i, j));
  const l2 = Math.abs(side(k, l, e, f, i, j));
  if (d2 === l2) { // then (g,h) is in mid between handles
    return [(e + i) / 2, (f + j) / 2]; 
 }
  const t = (d2 - Math.sqrt(d2 * l2)) / (d2 - l2);
  return [(1 - t) * e + t * i, (1 - t) * f + t * j];
}

/**
 * Given two adjacent quadratic bezier curves (a,b), (c,d), (e,f), 
 * and (e,f), (g,h), (i,j) that are smooth at (e,f)
 * this method calculates a new point (e,f) such that
 * the curves are G2-continuous in (e,f).
 * This algorithm works actually for two segments only, but the 
 * iteration seems to be stable for more segments.
 * This method does not check if the necessary conditions are 
 * actually met (such as smoothness).
 */
export function harmonizeQuadratic(a, b, c, d, e, f, g, h, i, j) {
  if (c === g && d === h) {
    return [e, f]; // no changes
  }
  const b2 = Math.abs(side(a, b, c, d, g, h));
  const j2 = Math.abs(side(i, j, c, d, g, h));
  if (b2 === j2) { // then (e,f) is in mid between handles
    return [(c + g) / 2, (d + h) / 2]; 
  }
  const t = (b2 - Math.sqrt(b2 * j2)) / (b2 - j2);
  return [(1 - t) * c + t * g, (1 - t) * d + t * h];
}

/**
 * Sets the lengths a and b of the handles of a cubic bezier path 
 * from (0,0) to (1,0) enclosing angles alpha and beta with the x-axis
 * such that the curvature at (0,0) becomes ka and the curvature at
 * (1,0) becomes kb.
 */
export function scaleHandles(alpha, beta, ka, kb) {
  const solutions = [];
  const sa = Math.sin(alpha);
  
  if (alpha + beta === 0) { // if ka = kb = 0, there is no solution (take the best available)
    if (ka === 0) {
      solutions.push([Math.cos(alpha), Math.cos(beta)]);
    } else {
      solutions.push([Math.sqrt(-2 * sa / (3 * ka)), Math.sqrt(2 * sa / (3 * kb))]);
    }
  } else {
    const sb = Math.sin(beta);
    const sba = Math.sin(alpha + beta);
    const b_roots = newtonRoots([27 * ka * kb * kb, 0, 36 * ka * sb * kb, -8 * sba * sba * sba, 8 * sa * sba * sba + 12 * ka * sb * sb]);
    
    for (const i of b_roots) {
      if (i > 0) {
        const a = (sb + 1.5 * kb * i * i) / sba;
        if (a > 0) {
          solutions.push([a, i]);
        }
      }
    }
  }
  
 if (solutions.length === 0) {
    return [null, null];
  } else if (solutions.length === 1) {
    return [solutions[0][0], solutions[0][1]];
  } else { // we only take the solution with the smallest energy 
    let a = solutions[0][0];
    let b = solutions[0][1];
    let energy_val = energy(alpha, beta, a, b);
    for (let i = 1; i < solutions.length; i++) {
      const e = energy(alpha, beta, solutions[i][0], solutions[i][1]);
      if (e < energy_val) {
        a = solutions[i][0];
        b = solutions[i][1];
        energy_val = e;
      }
    }
    return [a, b];
  }
}

/**
 * Given a cubic bezier path (a,b), (c,d), (e,f), (g,h)
 * this function returns the length of the chord from (a,b)
 * to (g,h), the signed angles at (a,b) abd (g,h) with regard
 * to the chord and the normed directions (da,db) and (dg,dh)
 * at (a,b) resp. (g,h)
 */
export function chordAngles(a, b, c, d, e, f, g, h) {
  const l = Math.sqrt((g - a) * (g - a) + (h - b) * (h - b)); // this length will be scaled to 1 for curvature computations
  const [da, db] = directionAtStart(a, b, c, d, e, f, g, h);
  let dab = Math.sqrt(da * da + db * db); // this can cause dab = 0 (rounding...)
  if (dab === 0) {
    dab = Math.sqrt((g - a) * (g - a) + (h - b) * (h - b));
  }
  const da_norm = da / dab;
  const db_norm = db / dab; // norm length to 1
  let sinalpha = ((g - a) * db_norm - (h - b) * da_norm) / l;
  let alpha;
  if (sinalpha < -1) {
    alpha = -0.5 * Math.PI;
  } else if (sinalpha > 1) {
    alpha = 0.5 * Math.PI;
  } else {
    alpha = Math.asin(((g - a) * db_norm - (h - b) * da_norm) / l); // crossp for direction
 }
  const [dg, dh] = directionAtStart(g, h, e, f, c, d, a, b);
  let dgh = Math.sqrt(dg * dg + dh * dh); // this can cause dgh = 0 (rounding...)
  if (dgh === 0) {
    dgh = Math.sqrt((g - a) * (g - a) + (h - b) * (h - b));
  }
  const dg_norm = dg / dgh;
  const dh_norm = dh / dgh; // norm length to 1
  let sinbeta = ((g - a) * dh_norm - (h - b) * dg_norm) / l;
  let beta;
  if (sinbeta < -1) {
    beta = -0.5 * Math.PI;
  } else if (sinbeta > 1) {
    beta = 0.5 * Math.PI;
  } else {
    beta = Math.asin(((g - a) * dh_norm - (h - b) * dg_norm) / l); // crossp for direction
  }
  return [l, alpha, beta, da_norm, db_norm, dg_norm, dh_norm];
}

/**
 * Given a cubic bezier path (a,b), (c,d), (e,f), (g,h)
 * and the curvatures ka and kg 
 * we scale the handles (c,d) and (e,f) such that 
 * the curvatures ka and kg are reached at (a,b) and (g,h) resp.
 */
export function adjustHandles(a, b, c, d, e, f, g, h, ka, kg) {
  const [l, alpha, beta, da, db, dg, dh] = chordAngles(a, b, c, d, e, f, g, h);
  const [t, s] = scaleHandles(alpha, beta, ka * l, kg * l);
  if (t === null || s === null) {
    return [c, d, e, f]; // no changes
  } else {
    return [a + t * da * l, b + t * db * l, g + s * dg * l, h + s * dh * l]; // scale back
  }
}

/**
 * For two adjoint cubic bezier curves (a,b) (c,d) (e,f) (g,h) 
 * and (g,h) (i,j) (k,l) (m,n) this function returns o,p,q,r
 * such that (a,b) (o,p) (q,r) (m,n) is a replacing single segment
 * which keeps the curvatures and directions at (a,b) and (m,n).
 */
export function softmerge(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
  const kappa_ab = curvatureAtStart(a, b, c, d, e, f, g, h);
 const kappa_mn = -curvatureAtStart(m, n, k, l, i, j, g, h);
  return adjustHandles(a, b, c, d, k, l, m, n, kappa_ab, kappa_mn);
}

/**
 * Splits a contour path at a specific time t (0 < t < 1) between two points
 * This is a simplified version for Fontra's path structure
 */
export function splitCubicAtT(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  // De Casteljau's algorithm to split a cubic bezier at parameter t
  const u = 1 - t;
  
  // First level
  const q0x = u * x0 + t * x1;
  const q0y = u * y0 + t * y1;
  const q1x = u * x1 + t * x2;
  const q1y = u * y1 + t * y2;
  const q2x = u * x2 + t * x3;
  const q2y = u * y2 + t * y3;
  
  // Second level
  const r0x = u * q0x + t * q1x;
  const r0y = u * q0y + t * q1y;
  const r1x = u * q1x + t * q2x;
  const r1y = u * q1y + t * q2y;
  
  // Third level (the point at t)
  const x_t = u * r0x + t * r1x;
  const y_t = u * r0y + t * r1y;
  
  // The two resulting cubic segments
  // First segment: (x0,y0) -> (q0x,q0y) -> (r0x,r0y) -> (x_t,y_t)
  // Second segment: (x_t,y_t) -> (r1x,r1y) -> (q2x,q2y) -> (x3,y3)
  return {
    firstSegment: [x0, y0, q0x, q0y, r0x, r0y, x_t, y_t],
    secondSegment: [x_t, y_t, r1x, r1y, q2x, q2y, x3, y3],
    splitPoint: [x_t, y_t]
  };
}

/**
 * Calculate the curvature at a point on a cubic Bézier curve at parameter t
 */
export function curvatureAtT(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  // Calculate first and second derivatives at t
  const u = 1 - t;
  
  // First derivative (velocity)
  const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
  const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
  
  // Second derivative (acceleration)
  const ddx = 6 * u * (x2 - 2 * x1 + x0) + 6 * t * (x3 - 2 * x2 + x1);
  const ddy = 6 * u * (y2 - 2 * y1 + y0) + 6 * t * (y3 - 2 * y2 + y1);
  
  // Curvature formula: (dx * ddy - dy * ddx) / (dx^2 + dy^2)^(3/2)
  const numerator = dx * ddy - dy * ddx;
  const denominator = Math.pow(dx * dx + dy * dy, 1.5);
  
  if (Math.abs(denominator) < 1e-10) {
    return 0; // Avoid division by zero
  }
  
  return numerator / denominator;
}

/**
 * Calculate the tangent vector at a point on a cubic Bézier curve at parameter t
 */
export function tangentAtT(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  const u = 1 - t;
  
  // First derivative (velocity vector)
  const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
  const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
  
  // Normalize the tangent vector
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1e-10) {
    return [0, 0]; // Return zero vector if tangent is zero
  }
  
  return [dx / length, dy / length];
}

/**
 * Calculate the signed distance from a point to a cubic Bézier curve
 * This is an approximation using discrete sampling
 */
export function pointToCurveDistance(px, py, x0, y0, x1, y1, x2, y2, x3, y3, numSamples = 100) {
  let minDist = Infinity;
  let minT = 0;
  
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const u = 1 - t;
    
    // Calculate point on curve at parameter t
    const cx = u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3;
    const cy = u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3;
    
    // Calculate distance to point
    const dist = Math.sqrt((cx - px)**2 + (cy - py)**2);
    if (dist < minDist) {
      minDist = dist;
      minT = t;
    }
  }
  
  return { distance: minDist, t: minT };
}

/**
 * Apply harmonization to a set of selected cubic segments in a path
 * This function takes a path and indices of selected points and harmonizes the curves
 */
export function harmonizePath(path, selectedPointIndices) {
  // Implementation would go here
  // This would iterate through the path, identify selected cubic segments
  // and apply harmonization to make the curvature continuous
  console.log("Harmonizing path with selected points:", selectedPointIndices);
  // This is a placeholder implementation
  return path;
}

/**
 * Apply tunnification to a set of selected cubic segments in a path
 * This function takes a path and indices of selected points and tunnifies the curves
 */
export function tunnifyPath(path, selectedPointIndices) {
  // Implementation would go here
  // This would iterate through the path, identify selected cubic segments
  // and apply tunnification to balance the handles
  console.log("Tunnifying path with selected points:", selectedPointIndices);
  // This is a placeholder implementation
  return path;
}

/**
 * AddNow I'll create the JavaScript file for the Curvatura functionality:

<write_to_file>
<path>src-js/fontra-core/src/curvatura.js</path>
<content>
/**
 * Curvatura - Curvature harmonization library for Fontra
 * 
 * This library provides functions for:
 * - Adding inflection points to cubic Bézier segments
 * - Tunnifying handles (balancing handle lengths based on Eduardo Tunni's method)
 * - Harmonizing curvatures at junction points
 * - Adjusting handles to match target curvatures
 * 
 * Ported from the FontForge Curvatura plugin by Linus Romer
 */

import * as vector from "./vector.js";
import { VarPackedPath } from "./var-path.js";

/**
 * Calculates the signed distance of point p from the line starting at q and going to r.
 * The value is positive if p is to the right of the line.
 * 
 * @param {number} px - X coordinate of point p
 * @param {number} py - Y coordinate of point p
 * @param {number} qx - X coordinate of line start point q
 * @param {number} qy - Y coordinate of line start point q
 * @param {number} rx - X coordinate of line end point r
 * @param {number} ry - Y coordinate of line end point r
 * @returns {number} Signed distance from point to line
 */
export function side(px, py, qx, qy, rx, ry) {
  const a = rx - qx;
  const b = ry - qy;
  return ((py - qy) * a - (px - qx) * b) / Math.sqrt(a * a + b * b);
}

/**
 * Returns the direction at the start of a cubic Bézier path.
 * Unlike the derivative, the direction never has length 0 as long as start != end.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @returns {Object} Direction vector {x, y}
 */
export function directionAtStart(a, b, c, d, e, f, g, h) {
  if (c === a && d === b && e === g && f === h) {
    return { x: g - a, y: h - b };
  } else if (c === a && d === b) {
    return { x: e - a, y: f - b };
  } else {
    // generic case
    return { x: c - a, y: d - b };
  }
}

/**
 * Returns the curvature at the start of a cubic Bézier path.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @returns {number} Curvature at start point
 */
export function curvatureAtStart(a, b, c, d, e, f, g, h) {
  if (b === d && a === c) {
    return 0;
 }
  return (2.0 / 3.0) * (c * f - a * f - d * e + b * e + a * d - b * c) / Math.pow((b - d) * (b - d) + (a - c) * (a - c), 1.5);
}

/**
 * Returns the energy of a cubic Bézier path with enclosing angles alpha and beta
 * and handle lengths a and b, calculated using Simpson's rule with 10 divisions.
 * 
 * @param {number} alpha - Angle of first handle relative to x-axis
 * @param {number} beta - Angle of second handle relative to x-axis
 * @param {number} a - Length of first handle
 * @param {number} b - Length of second handle
 * @returns {number} Energy of the curve
 */
export function energy(alpha, beta, a, b) {
  const sa = Math.sin(alpha);
  const sb = Math.sin(beta);
  const ca = Math.cos(alpha);
  const cb = Math.cos(beta);
  
  const xx_2 = 3 * b * cb + 3 * a * ca - 2;
  const xx_1 = -2 * b * cb - 4 * a * ca + 2;
  const xx_0 = a * ca;
  const yy_2 = -3 * b * sb + 3 * a * sa;
  const yy_1 = -4 * a * sa + 2 * b * sb;
  const yy_0 = a * sa;
  const xxx_1 = 3 * b * cb + 3 * a * ca - 2;
  const xxx_0 = -b * cb - 2 * a * ca + 1;
  const yyy_1 = -3 * b * sb + 3 * a * sa;
  const yyy_0 = b * sb - 2 * a * sa;
  
  let integral = 0;
  let curv_before = Math.pow(18 * xx_0 * yyy_0 - 18 * xxx_0 * yy_0, 2) / Math.pow(9 * xx_0 * xx_0 + 9 * yy_0 * yy_0, 2.5);
  
  for (let i = 1; i <= 10; i++) {
    let t = i / 10;
    let xx = 3 * (xx_2 * t * t + xx_1 * t + xx_0);
    let yy = 3 * (yy_2 * t * t + yy_1 * t + yy_0);
    let xxx = 6 * (xxx_1 * t + xxx_0);
    let yyy = 6 * (yyy_1 * t + yyy_0);
    let curv = Math.pow(xx * yyy - xxx * yy, 2) / Math.pow(xx * xx + yy * yy, 2.5);
    
    t -= 0.05;
    xx = 3 * (xx_2 * t * t + xx_1 * t + xx_0);
    yy = 3 * (yy_2 * t * t + yy_1 * t + yy_0);
    xxx = 6 * (xxx_1 * t + xxx_0);
    yyy = 6 * (yyy_1 * t + yyy_0);
    const curv_between = Math.pow(xx * yyy - xxx * yy, 2) / Math.pow(xx * xx + yy * yy, 2.5);
    
    integral += 0.1 / 6 * (curv_before + 4 * curv_between + curv);
    curv_before = curv;
  }
  
  return integral / 10;
}

/**
 * Derives the coefficients of a polynomial.
 * 
 * @param {number[]} coeffs - Polynomial coefficients [a, b, c] for ax²+bx+c
 * @returns {number[]} Derivative coefficients
 */
export function derive(coeffs) {
  const n = coeffs.length;
  const derivative = [];
  for (let i = 0; i < n - 1; i++) {
    derivative.push(coeffs[i] * (n - i - 1));
  }
  return derivative;
}

/**
 * Divides a polynomial by (x - r) where r is a root of the polynomial.
 * Uses Horner's method without remainder.
 * 
 * @param {number[]} coeffs - Polynomial coefficients
 * @param {number} r - Root of the polynomial
 * @returns {number[]} Resulting coefficients after division
 */
export function polynomialDivision(coeffs, r) {
  const result = [coeffs[0]];
  for (let i = 1; i < coeffs.length - 1; i++) { // -1 because of no remainder
    result.push(coeffs[i] + result[result.length - 1] * r);
  }
  return result;
}

/**
 * Evaluates a polynomial at x using Horner's method.
 * 
 * @param {number[]} coeffs - Polynomial coefficients
 * @param {number} x - Value to evaluate at
 * @returns {number} Polynomial value at x
 */
export function evaluate(coeffs, x) {
  let result = coeffs[0];
  for (let i = 1; i < coeffs.length; i++) {
    result = result * x + coeffs[i];
  }
  return result;
}

/**
 * Newton's algorithm for determining a root of a polynomial.
 * 
 * @param {number[]} coeffs - Polynomial coefficients
 * @returns {number|null} Root found, or null if algorithm didn't converge
 */
export function newtonRoot(coeffs) {
  const derivative = derive(coeffs);
 let x = 0;
  
  for (let i = 0; i < 100; i++) {
    if (evaluate(derivative, x) === 0) {
      x += 1e-9;
    }
    const d = evaluate(coeffs, x) / evaluate(derivative, x);
    x -= d;
    if (Math.abs(d) < 1e-9) {
      return x;
    }
  }
  return null; // algorithm did not converge
}

/**
 * Finds all real roots of a polynomial.
 * 
 * @param {number[]} coeffs - Polynomial coefficients
 * @returns {number[]} All real roots
 */
export function newtonRoots(coeffs) {
  let f = [...coeffs];
  while (f.length > 0 && f[0] === 0) {
    f.shift();
  }
  
  const roots = [];
  while (f.length > 1) {
    const r = newtonRoot(f);
    if (r === null) {
      break;
    }
    roots.push(r);
    f = polynomialDivision(f, r);
  }
  return roots;
}

/**
 * Splits a contour at a specific point and time, creating two Bézier segments.
 * 
 * @param {VarPackedPath} path - The path to split
 * @param {number} contourIndex - Index of the contour to split
 * @param {number} pointIndex - Index of the starting point of the segment to split
 * @param {number} t - Time parameter (0 < t < 1) where to split
 * @returns {number} New point index after the split
 */
export function splitPathAtTime(path, contourIndex, pointIndex, t) {
  if (t <= 0 || t >= 1 || pointIndex % 1 !== 0 || pointIndex < 0 || pointIndex >= path.numPoints) {
    return null; // Invalid parameters
  }

  // Get the 4 points that form the cubic segment: start, handle1, handle2, end
  const p0 = path.getPoint(pointIndex);
  const p1 = path.getPoint(pointIndex + 1);
  const p2 = path.getPoint(pointIndex + 2);
  const p3 = path.getPoint(pointIndex + 3);

  if (!p0 || !p1 || !p2 || !p3 || !p0.type || p1.type || p2.type || !p3.type) {
    return null; // Not a valid cubic segment
  }

  // Calculate intermediate points using De Casteljau's algorithm
 const qx1 = p0.x + t * (p1.x - p0.x);
  const qy1 = p0.y + t * (p1.y - p0.y);
  const qx2 = p1.x + t * (p2.x - p1.x);
  const qy2 = p1.y + t * (p2.y - p1.y);
  const rx2 = p2.x + t * (p3.x - p2.x);
  const ry2 = p2.y + t * (p3.y - p2.y);
  const rx1 = qx2 + t * (rx2 - qx2);
  const ry1 = qy2 + t * (ry2 - qy2);
  const qx2b = qx1 + t * (qx2 - qx1);
  const qy2b = qy1 + t * (qy2 - qy1);
  const qx3 = qx2b + t * (rx1 - qx2b);
  const qy3 = qy2b + t * (ry1 - qy2b);

  // Delete the original segment
  path.deletePoint(contourIndex, pointIndex + 2);
  path.deletePoint(contourIndex, pointIndex + 1);

  // Insert the new points
  path.insertPoint(contourIndex, pointIndex + 1, { x: qx1, y: qy1, type: "cubic" });
  path.insertPoint(contourIndex, pointIndex + 2, { x: qx2b, y: qy2b, type: "cubic" });
  path.insertPoint(contourIndex, pointIndex + 3, { x: qx3, y: qy3 });
  path.insertPoint(contourIndex, pointIndex + 4, { x: rx1, y: ry1, type: "cubic" });
  path.insertPoint(contourIndex, pointIndex + 5, { x: rx2, y: ry2, type: "cubic" });

  return pointIndex + 3; // Return the index of the new on-curve point
}

/**
 * Returns the "corner point" of a cubic Bézier segment, which is the intersection
 * of the lines from start to first handle and from second handle to end.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @returns {Object|null} Corner point {x, y} or null if no corner point exists
 */
export function cornerPoint(a, b, c, d, e, f, g, h) {
  if (c === a && d === b && e === g && f === h) {
    return { x: 0.5 * (a + g), y: 0.5 * (b + h) };
  } else if (c === a && d === b) {
    return { x: e, y: f };
  } else if (e === g && f === h) {
    return { x: c, y: d };
  } else {
    // Check if handles are on the same side, no inflection occurs, and no division by zero
    const side1 = side(c, d, a, b, g, h);
    const side2 = side(e, f, a, b, g, h);
    const inflectionResult = inflection(a, b, c, d, e, f, g, h);
    
    if (side1 * side2 < 0 || inflectionResult !== null || 
        c * h - a * h - d * g + b * g - c * f + a * f + d * e - b * e === 0) {
      return null;
    } else {
      const x = a + ((c - a) * (e * h - a * h - f * g + b * g + a * f - b * e)) /
                (c * h - a * h - d * g + b * g - c * f + a * f + d * e - b * e);
      const y = b + ((d - b) * (e * h - a * h - f * g + b * g + a * f - b * e)) /
                (c * h - a * h - d * g + b * g - c * f + a * f + d * e - b * e);
      return { x, y };
    }
  }
}

/**
 * Checks if a cubic Bézier segment is selected.
 * 
 * @param {VarPackedPath} path - The path containing the segment
 * @param {number} contourIndex - Index of the contour
 * @param {number} pointIndex - Index of the starting point of the segment
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 * @returns {boolean} True if the segment is selected
 */
export function segmentSelectedCubic(path, contourIndex, pointIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
  
  if (pointIndex < 0 || pointIndex >= numPoints - 3) {
    return false;
  }
  
  const p0 = path.getPoint(startPoint + pointIndex);
  const p1 = path.getPoint(startPoint + pointIndex + 1);
  const p2 = path.getPoint(startPoint + pointIndex + 2);
  const p3 = path.getPoint(startPoint + pointIndex + 3);
  
  if (!p0 || !p1 || !p2 || !p3) return false;
  
 // Check if it's a cubic segment (on-curve, off-curve, on-curve)
  const isCubicSegment = !p0.type && p1.type === "cubic" && p2.type === "cubic" && !p3.type;
  
  if (!isCubicSegment) return false;
  
  // Check if selected
  const isSelected = isGlyphVariant || 
                    (selection.has(`point/${startPoint + pointIndex}`) && selection.has(`point/${startPoint + pointIndex + 3}`)) ||
                    selection.has(`point/${startPoint + pointIndex + 1}`) || 
                    selection.has(`point/${startPoint + pointIndex + 2}`);
  
  return isCubicSegment && isSelected;
}

/**
 * Checks if adjacent cubic Bézier segments are selected.
 * 
 * @param {VarPackedPath} path - The path containing the segments
 * @param {number} contourIndex - Index of the contour
 * @param {number} pointIndex - Index of the point to check
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 * @returns {boolean} True if adjacent segments are selected
 */
export function segmentsSelectedCubic(path, contourIndex, pointIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  if (numPoints < 7) return false;
  
 const absoluteIndex = path.getAbsolutePointIndex(contourIndex, pointIndex);
  const p = path.getPoint(absoluteIndex);
  
  if (!p || !p.type || !["on", "smooth"].includes(p.type) && p.type !== 0) return false;
  
  const isSelected = isGlyphVariant || selection.has(`point/${absoluteIndex}`);
  
  // Check if it's a smooth point with adjacent cubic segments
  if (isSelected) {
    // Check for closed contour case
    if (path.contourInfo[contourIndex].isClosed) {
      const p1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex + 1) % numPoints));
      const p2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex + 2) % numPoints));
      const p3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex + 3) % numPoints));
      const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex - 1 + numPoints) % numPoints));
      const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex - 2 + numPoints) % numPoints));
      const p_3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex - 3 + numPoints) % numPoints));
      
      return p1 && !p1.type && p2 && !p2.type && p3 && !p3.type &&
             p_1 && !p_1.type && p_2 && !p_2.type && p_3 && !p_3.type;
    } else {
      // Check for open contour case
      if (pointIndex >= 3 && pointIndex < numPoints - 3) {
        const p1 = path.getPoint(absoluteIndex + 1);
        const p2 = path.getPoint(absoluteIndex + 2);
        const p3 = path.getPoint(absoluteIndex + 3);
        const p_1 = path.getPoint(absoluteIndex - 1);
        const p_2 = path.getPoint(absoluteIndex - 2);
        const p_3 = path.getPoint(absoluteIndex - 3);
        
        return p1 && !p1.type && p2 && !p2.type && p3 && !p3.type &&
               p_1 && !p_1.type && p_2 && !p_2.type && p_3 && !p_3.type;
      }
    }
  }
  
 return false;
}

/**
 * Checks if adjacent quadratic Bézier segments are selected.
 * 
 * @param {VarPackedPath} path - The path containing the segments
 * @param {number} contourIndex - Index of the contour
 * @param {number} pointIndex - Index of the point to check
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 * @returns {boolean} True if adjacent quadratic segments are selected
 */
export function segmentsSelectedQuadratic(path, contourIndex, pointIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  if (numPoints < 5) return false;
  
  const absoluteIndex = path.getAbsolutePointIndex(contourIndex, pointIndex);
  const p = path.getPoint(absoluteIndex);
  
  if (!p || !p.type || !["on", "smooth"].includes(p.type) && p.type !== 0) return false;
  
  const isSelected = isGlyphVariant || selection.has(`point/${absoluteIndex}`);
  
  if (isSelected) {
    // Check for closed contour case
    if (path.contourInfo[contourIndex].isClosed) {
      const p1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex + 1) % numPoints));
      const p2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex + 2) % numPoints));
      const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex - 1 + numPoints) % numPoints));
      const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (pointIndex - 2 + numPoints) % numPoints));
      
      return p1 && !p1.type && p2 && !p2.type && p_1 && !p_1.type && p_2 && !p_2.type;
    } else {
      // Check for open contour case
      if (pointIndex >= 2 && pointIndex < numPoints - 2) {
        const p1 = path.getPoint(absoluteIndex + 1);
        const p2 = path.getPoint(absoluteIndex + 2);
        const p_1 = path.getPoint(absoluteIndex - 1);
        const p_2 = path.getPoint(absoluteIndex - 2);
        
        return p1 && !p1.type && p2 && !p2.type && p_1 && !p_1.type && p_2 && !p_2.type;
      }
    }
  }
  
  return false;
}

/**
 * Checks if the curvature sign changes between two adjacent cubic Bézier segments.
 * 
 * @param {number} a - First segment start X
 * @param {number} b - First segment start Y
 * @param {number} c - First segment first handle X
 * @param {number} d - First segment first handle Y
 * @param {number} e - First segment second handle X
 * @param {number} f - First segment second handle Y
 * @param {number} g - Common point X
 * @param {number} h - Common point Y
 * @param {number} i - Second segment first handle X
 * @param {number} j - Second segment first handle Y
 * @param {number} k - Second segment second handle X
 * @param {number} l - Second segment second handle Y
 * @param {number} m - Second segment end X
 * @param {number} n - Second segment end Y
 * @returns {boolean} True if curvature sign changes
 */
export function isInflection(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
  return ((i - g) * (h - 2 * j + l) - (j - h) * (g - 2 * i + k)) *
         ((e - g) * (h - 2 * f + d) - (f - h) * (g - 2 * e + c)) > 0;
}

/**
 * Returns the inflection point time of a cubic Bézier segment.
 * If there is no inflection point, returns null.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @returns {number|null} Time parameter of inflection point, or null if none exists
 */
export function inflection(a, b, c, d, e, f, g, h) {
  // Curvature=0 is an equation aa*t²+bb*t+c=0 with coefficients:
  const aa = e * h - 2 * c * h + a * h - f * g + 2 * d * g - b * g + 3 * c * f - 2 * a * f - 3 * d * e + 2 * b * e + a * d - b * c;
  const bb = c * h - a * h - d * g + b * g - 3 * c * f + 3 * a * f + 3 * d * e - 3 * b * e - 2 * a * d + 2 * b * c;
  const cc = c * f - a * f - d * e + b * e + a * d - b * c;
  
  if (aa === 0 && bb !== 0) {
    const t = -cc / bb;
    if (0.001 < t && t < 0.999) {
      return t;
    }
  } else {
    const discriminant = bb * bb - 4 * aa * cc;
    if (discriminant >= 0 && aa !== 0) {
      const t1 = (-bb + Math.sqrt(discriminant)) / (2 * aa);
      const t2 = (-bb - Math.sqrt(discriminant)) / (2 * aa);
      
      if (0.001 < t1 && t1 < 0.999) {
        return t1;
      } else if (0.001 < t2 && t2 < 0.999) {
        return t2;
      }
    }
  }
  
  return null;
}

/**
 * Adds missing inflection points to a contour.
 * 
 * @param {VarPackedPath} path - The path to modify
 * @param {number} contourIndex - Index of the contour to modify
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 */
export function addInflectionPointsToContour(path, contourIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  let j = 0; // index that will run from 0 to numPoints-1 (may contain jumps)
  
  while (j < numPoints) { // going through the points
    const absoluteIndex = path.getAbsolutePointIndex(contourIndex, j);
    if (segmentSelectedCubic(path, contourIndex, j, selection, isGlyphVariant)) {
      // Get the 4 points that make up the cubic segment
      const p0 = path.getPoint(absoluteIndex);
      const p1 = path.getPoint(absoluteIndex + 1);
      const p2 = path.getPoint(absoluteIndex + 2);
      const p3 = path.getPoint(absoluteIndex + 3);
      
      if (p0 && p1 && p2 && p3) {
        const t = inflection(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        if (t !== null) {
          const newPointIndex = splitPathAtTime(path, contourIndex, absoluteIndex, t);
          if (newPointIndex !== null && !isGlyphVariant) {
            // Mark new points as selected
            selection.add(`point/${newPointIndex}`);
          }
          j += 3; // we just added 3 points...
          numPoints += 3; // we just added 3 points...
        }
        j += 2; // we can jump by 2+1 instead of 1
      }
    }
    j += 1;
  }
}

/**
 * Tunnifies a cubic Bézier path, moving handles to achieve ideal handle lengths
 * based on Eduardo Tunni's method.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @returns {Object} New handle coordinates {c: {x, y}, d: {x, y}}
 */
export function tunnify(a, b, c, d, e, f, g, h) {
  const result = chordAngles(a, b, c, d, e, f, g, h); // too much computation...
  const l = result.l;
  const alpha = result.alpha;
  const beta = result.beta;
  const da = result.da;
  const db = result.db;
  const dg = result.dg;
  const dh = result.dh;
  
  const aa = Math.sqrt((c - a) * (c - a) + (d - b) * (d - b)) / l;
  const bb = Math.sqrt((e - g) * (e - g) + (f - h) * (f - h)) / l;
  
  if ((aa === 0 && bb === 0) || l === 0) { // then tunnify makes no sense
    return { c: { x: c, y: d }, d: { x: e, y: f } };
  }
  
  if (Math.abs(alpha + beta) % Math.PI === 0) {
    return { 
      c: { 
        x: a + 0.5 * (aa + bb) / aa * (c - a), 
        y: b + 0.5 * (aa + bb) / aa * (d - b) 
      },
      d: { 
        x: g + 0.5 * (aa + bb) / bb * (e - g), 
        y: h + 0.5 * (aa + bb) / bb * (f - h) 
      }
    };    
  }
  
  if (alpha < 0) { // make alpha nonnegative
    alpha = -alpha;
    beta = -beta;
  }
  
 if (beta <= 0 || alpha === 0) { // then tunnify makes no sense
    return { c: { x: c, y: d }, d: { x: e, y: f } };
  }
  
  const asa = aa * Math.sin(alpha);
  const bsb = bb * Math.sin(beta);
  const ff = 2 * (asa + bsb) - aa * bb * Math.sin(alpha + beta); // ff = area*20/3
  
  const cotab = 1 / Math.tan(alpha) + 1 / Math.tan(beta);
  const discriminant = 4 - cotab * ff;
  
  if (discriminant < 0) { // then tunnify makes no sense
    return { c: { x: c, y: d }, d: { x: e, y: f } };
  }
  
  let hh = (2 - Math.sqrt(discriminant)) / cotab; // take the smaller solution as the larger could have loops
  if (hh < 0) {
    hh = (2 + Math.sqrt(discriminant)) / cotab;
  }
  
  return {
    c: { 
      x: a + hh / Math.sin(alpha) * da * l, 
      y: b + hh / Math.sin(alpha) * db * l 
    },
    d: { 
      x: g + hh / Math.sin(beta) * dg * l, 
      y: h + hh / Math.sin(beta) * dh * l 
    }
 };
}

/**
 * Tunnifies the handles of a contour.
 * 
 * @param {VarPackedPath} path - The path to modify
 * @param {number} contourIndex - Index of the contour to modify
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 */
export function tunnifyContour(path, contourIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  let j = 0; // index that will run from 0 to numPoints-1 (may contain jumps)
  
  while (j < numPoints) { // going through the points
    const absoluteIndex = path.getAbsolutePointIndex(contourIndex, j);
    if (segmentSelectedCubic(path, contourIndex, j, selection, isGlyphVariant)) {
      // Get the 4 points that make up the cubic segment
      const p0 = path.getPoint(absoluteIndex);
      const p1 = path.getPoint(absoluteIndex + 1);
      const p2 = path.getPoint(absoluteIndex + 2);
      const p3 = path.getPoint(absoluteIndex + 3);
      
      if (p0 && p1 && p2 && p3) {
        const newHandles = tunnify(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        
        // Update the handle positions
        path.setPoint(absoluteIndex + 1, { ...p1, x: newHandles.c.x, y: newHandles.c.y });
        path.setPoint(absoluteIndex + 2, { ...p2, x: newHandles.d.x, y: newHandles.d.y });
        
        j += 2; // we can jump by 2+1 instead of 1
      }
    }
    j += 1;
  }
}

/**
 * Given two adjacent cubic Bézier curves that are smooth at the common point,
 * calculates a new common point such that the curves are G2-continuous.
 * 
 * @param {number} a - First curve start X
 * @param {number} b - First curve start Y
 * @param {number} c - First curve first handle X
 * @param {number} d - First curve first handle Y
 * @param {number} e - First curve second handle X
 * @param {number} f - First curve second handle Y
 * @param {number} g - Common point X
 * @param {number} h - Common point Y
 * @param {number} i - Second curve first handle X
 * @param {number} j - Second curve first handle Y
 * @param {number} k - Second curve second handle X
 * @param {number} l - Second curve second handle Y
 * @param {number} m - Second curve end X
 * @param {number} n - Second curve end Y
 * @returns {Object} New common point {x, y}
 */
export function harmonizeCubic(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
  if (e === i && f === j) {
    return { x: g, y: h }; // no changes
  }
  
  const d2 = Math.abs(side(c, d, e, f, i, j));
  const l2 = Math.abs(side(k, l, e, f, i, j));
  
  if (d2 === l2) { // then (g,h) is in mid between handles
    return { x: 0.5 * (e + i), y: 0.5 * (f + j) };
  }
  
  const t = (d2 - Math.sqrt(d2 * l2)) / (d2 - l2);
  return { x: (1 - t) * e + t * i, y: (1 - t) * f + t * j };
}

/**
 * Given two adjacent quadratic Bézier curves that are smooth at the common point,
 * calculates a new common point such that the curves are G2-continuous.
 * 
 * @param {number} a - First curve start X
 * @param {number} b - First curve start Y
 * @param {number} c - First curve handle X
 * @param {number} d - First curve handle Y
 * @param {number} e - Common point X
 * @param {number} f - Common point Y
 * @param {number} g - Second curve handle X
 * @param {number} h - Second curve handle Y
 * @param {number} i - Second curve end X
 * @param {number} j - Second curve end Y
 * @returns {Object} New common point {x, y}
 */
export function harmonizeQuadratic(a, b, c, d, e, f, g, h, i, j) {
  if (c === g && d === h) {
    return { x: e, y: f }; // no changes
  }
  
  const b2 = Math.abs(side(a, b, c, d, g, h));
  const j2 = Math.abs(side(i, j, c, d, g, h));
  
  if (b2 === j2) { // then (e,f) is in mid between handles
    return { x: 0.5 * (c + g), y: 0.5 * (d + h) };
  }
  
  const t = (b2 - Math.sqrt(b2 * j2)) / (b2 - j2);
  return { x: (1 - t) * c + t * g, y: (1 - t) * d + t * h };
}

/**
 * Harmonizes the nodes of a contour.
 * 
 * @param {VarPackedPath} path - The path to modify
 * @param {number} contourIndex - Index of the contour to modify
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 */
export function harmonizeContour(path, contourIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  
  if (path.getPoint(path.getAbsolutePointIndex(contourIndex, 0)).type === "quad") {
    // Iterate 5 times for quadratic contours
    for (let fivetimes = 0; fivetimes < 5; fivetimes++) {
      for (let i = 0; i < numPoints; i++) {
        const absoluteIndex = path.getAbsolutePointIndex(contourIndex, i);
        if (segmentsSelectedQuadratic(path, contourIndex, i, selection, isGlyphVariant)) {
          // Get the points needed for harmonization
          const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 2 + numPoints) % numPoints));
          const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 1 + numPoints) % numPoints));
          const p0 = path.getPoint(absoluteIndex);
          const p1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints));
          const p2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints));
          
          if (p_2 && p_1 && p0 && p1 && p2) {
            const newPoint = harmonizeQuadratic(
              p_2.x, p_2.y, p_1.x, p_1.y, p0.x, p0.y, 
              p1.x, p1.y, p2.x, p2.y
            );
            
            // Update the common point
            path.setPoint(absoluteIndex, { ...p0, x: newPoint.x, y: newPoint.y });
            
            i += 2; // makes things a little bit faster
          }
        } else {
          i += 1;
        }
      }
    }
  } else {
    // For cubic contours
    for (let i = 0; i < numPoints; i++) {
      const absoluteIndex = path.getAbsolutePointIndex(contourIndex, i);
      if (segmentsSelectedCubic(path, contourIndex, i, selection, isGlyphVariant)) {
        // Get the points needed for harmonization
        const p_3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 3 + numPoints) % numPoints));
        const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 2 + numPoints) % numPoints));
        const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 1 + numPoints) % numPoints));
        const p0 = path.getPoint(absoluteIndex);
        const p1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints));
        const p2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints));
        const p3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 3) % numPoints));
        
        if (p_3 && p_2 && p_1 && p0 && p1 && p2 && p3) {
          const newPoint = harmonizeCubic(
            p_3.x, p_3.y, p_2.x, p_2.y, p_1.x, p_1.y, p0.x, p0.y,
            p1.x, p1.y, p2.x, p2.y, p3.x, p3.y
          );
          
          // Update the common point
          path.setPoint(absoluteIndex, { ...p0, x: newPoint.x, y: newPoint.y });
          
          i += 3; // makes things a little bit faster
        }
      } else {
        i += 1;
      }
    }
  }
}

/**
 * Sets the lengths of the handles of a cubic Bézier path from (0,0) to (1,0)
 * such that the curvature at (0,0) becomes ka and the curvature at (1,0) becomes kb.
 * 
 * @param {number} alpha - Angle of first handle relative to x-axis
 * @param {number} beta - Angle of second handle relative to x-axis
 * @param {number} ka - Target curvature at start
 * @param {number} kb - Target curvature at end
 * @returns {Object|null} New handle lengths {a, b} or null if no solution exists
 */
export function scaleHandles(alpha, beta, ka, kb) {
  const solutions = [];
  
  if (alpha + beta === 0) { // if ka = kb = 0, there is no solution (take the best available)
    solutions.push([
      Math.cos(alpha) !== 0 && ka === 0 ? Math.cos(alpha) : ka !== 0 ? Math.sqrt(-2 * Math.sin(alpha) / (3 * ka)) : 1,
      Math.cos(beta) !== 0 && kb === 0 ? Math.cos(beta) : kb !== 0 ? Math.sqrt(2 * Math.sin(alpha) / (3 * kb)) : 1
    ]);
  } else {
    const sa = Math.sin(alpha);
    const sb = Math.sin(beta);
    const sba = Math.sin(alpha + beta);
    
    // Solve the polynomial equation for b
    const b_roots = newtonRoots([
      27 * ka * kb * kb,
      0,
      36 * ka * sb * kb,
      -8 * sba * sba * sba,
      8 * sa * sba * sba + 12 * ka * sb * sb
    ]);
    
    for (const i of b_roots) {
      if (i > 0) {
        const a = (sb + 1.5 * kb * i * i) / sba;
        if (a > 0) {
          solutions.push([a, i]);
        }
      }
    }
  }
  
  if (solutions.length === 0) {
    return null;
 } else if (solutions.length === 1) {
    return { a: solutions[0][0], b: solutions[0][1] };
  } else {
    // Take the solution with the smallest energy
    let a = solutions[0][0];
    let b = solutions[0][1];
    let energy = energy(alpha, beta, a, b);
    
    for (let i = 1; i < solutions.length; i++) {
      const e = energy(alpha, beta, solutions[i][0], solutions[i][1]);
      if (e < energy) {
        a = solutions[i][0];
        b = solutions[i][1];
        energy = e;
      }
    }
    
    return { a, b };
  }
}

/**
 * Given a cubic Bézier path, returns chord length, angles, and directions.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @returns {Object} Chord properties {l, alpha, beta, da, db, dg, dh}
 */
export function chordAngles(a, b, c, d, e, f, g, h) {
  const l = Math.sqrt((g - a) * (g - a) + (h - b) * (h - b)); // chord length
  const dirStart = directionAtStart(a, b, c, d, e, f, g, h);
  let da = dirStart.x;
  let db = dirStart.y;
  let dab = Math.sqrt(da * da + db * db); // this can cause dab = 0 (rounding...)
  
  if (dab === 0) {
    dab = Math.sqrt((g - a) * (g - a) + (h - b) * (h - b));
  }
  
  da /= dab;
  db /= dab; // normalize length to 1
  
  let sinalpha = ((g - a) * db - (h - b) * da) / l;
  sinalpha = Math.max(-1, Math.min(1, sinalpha)); // clamp to [-1, 1] to avoid NaN
 const alpha = Math.asin(sinalpha); // cross product for direction
  
  const dirEnd = directionAtStart(g, h, e, f, c, d, a, b);
  let dg = dirEnd.x;
  let dh = dirEnd.y;
  let dgh = Math.sqrt(dg * dg + dh * dh); // this can cause dgh = 0 (rounding...)
  
  if (dgh === 0) {
    dgh = Math.sqrt((g - a) * (g - a) + (h - b) * (h - b));
  }
  
  dg /= dgh;
  dh /= dgh; // normalize length to 1
  
  let sinbeta = ((g - a) * dh - (h - b) * dg) / l;
  sinbeta = Math.max(-1, Math.min(1, sinbeta)); // clamp to [-1, 1] to avoid NaN
  const beta = Math.asin(sinbeta); // cross product for direction
  
  return { l, alpha, beta, da, db, dg, dh };
}

/**
 * Given a cubic Bézier path and target curvatures, adjusts the handles to match.
 * 
 * @param {number} a - Start X coordinate
 * @param {number} b - Start Y coordinate
 * @param {number} c - First handle X coordinate
 * @param {number} d - First handle Y coordinate
 * @param {number} e - Second handle X coordinate
 * @param {number} f - Second handle Y coordinate
 * @param {number} g - End X coordinate
 * @param {number} h - End Y coordinate
 * @param {number} ka - Target curvature at start
 * @param {number} kg - Target curvature at end
 * @returns {Object} New handle coordinates {c: {x, y}, d: {x, y}}
 */
export function adjustHandles(a, b, c, d, e, f, g, h, ka, kg) {
  const result = chordAngles(a, b, c, d, e, f, g, h);
  const l = result.l;
  const alpha = result.alpha;
  const beta = result.beta;
  const da = result.da;
  const db = result.db;
  const dg = result.dg;
  const dh = result.dh;
  
  const scaledHandles = scaleHandles(alpha, beta, ka * l, kg * l);
  if (scaledHandles === null) {
    return { c: { x: c, y: d }, d: { x: e, y: f } }; // no changes
  } else {
    return {
      c: { x: a + scaledHandles.a * da * l, y: b + scaledHandles.a * db * l },
      d: { x: g + scaledHandles.b * dg * l, y: h + scaledHandles.b * dh * l }
    }; // scale back
 }
}

/**
 * Harmonizes the selected paths by moving handles to reach average curvature at nodes.
 * 
 * @param {VarPackedPath} path - The path to modify
 * @param {number} contourIndex - Index of the contour to modify
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 */
export function harmonizeHandlesContour(path, contourIndex, selection, isGlyphVariant) {
  const numPoints = path.getNumPointsOfContour(contourIndex);
  
  // Collect the average curvatures at the moment (iterate 5 times to average everything out)
  for (let fivetimes = 0; fivetimes < 5; fivetimes++) {
    const curvatures = {};
    
    for (let i = 0; i < numPoints; i++) {
      const absoluteIndex = path.getAbsolutePointIndex(contourIndex, i);
      if (segmentSelectedCubic(path, contourIndex, i, selection, isGlyphVariant)) {
        const p0 = path.getPoint(absoluteIndex);
        const p1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints));
        const p2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints));
        const p3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 3) % numPoints));
        const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 1 + numPoints) % numPoints));
        const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 2 + numPoints) % numPoints));
        const p_3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 3 + numPoints) % numPoints));
        
        if (p0 && p1 && p2 && p3 && p_1 && p_2 && p_3) {
          const postcurvature = curvatureAtStart(
            p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y
          );
          const precurvature = -curvatureAtStart(
            p0.x, p0.y, p_1.x, p_1.y, p_2.x, p_2.y, p_3.x, p_3.y
          );
          
          let postnew, prenew;
          if (postcurvature * precurvature < 0) { // inflection node
            postnew = 0;
            prenew = 0;
          } else {
            postnew = Math.sign(postcurvature) * 0.5 * (Math.abs(postcurvature) + Math.abs(precurvature));
            prenew = Math.sign(precurvature) * 0.5 * (Math.abs(postcurvature) + Math.abs(precurvature));
          }
          
          curvatures[i] = [precurvature, postcurvature, prenew, postnew];
        }
      }
    }
    
    // Adjust the handles to fit the average curvatures:
    // (curvatures at selection ends have not been calculated yet)
    for (const i_str in curvatures) {
      const i = parseInt(i_str);
      
      // Looking at the previous segment
      const prevSegmentIndex = (i - 3 + numPoints) % numPoints;
      let ka;
      if (curvatures[prevSegmentIndex]) {
        ka = curvatures[prevSegmentIndex][3];
      } else {
        const p_3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, prevSegmentIndex));
        const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 2) % numPoints));
        const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 1) % numPoints));
        const p0 = path.getPoint(path.getAbsolutePointIndex(contourIndex, i));
        
        if (p_3 && p_2 && p_1 && p0) {
          ka = curvatureAtStart(
            p_3.x, p_3.y, p_2.x, p_2.y, p_1.x, p_1.y, p0.x, p0.y
          );
        } else {
          continue; // Skip if points are not available
        }
      }
      
      // Get the current points
      const p_2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 2) % numPoints));
      const p_1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i - 1) % numPoints));
      const p0 = path.getPoint(path.getAbsolutePointIndex(contourIndex, i));
      const p1 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints));
      const p2 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints));
      const p3 = path.getPoint(path.getAbsolutePointIndex(contourIndex, (i + 3) % numPoints));
      
      if (p_2 && p_1 && p0 && p1 && p2 && p3) {
        const newHandles = adjustHandles(
          p_3.x, p_3.y, p_2.x, p_2.y, p_1.x, p_1.y, p0.x, p0.y, 
          ka, curvatures[i][2]
        );
        
        path.setPoint(path.getAbsolutePointIndex(contourIndex, (i - 2) % numPoints), { 
          ...p_2, 
          x: newHandles.c.x, 
          y: newHandles.c.y 
        });
        path.setPoint(path.getAbsolutePointIndex(contourIndex, (i - 1) % numPoints), { 
          ...p_1, 
          x: newHandles.d.x, 
          y: newHandles.d.y 
        });
        
        // If we are at a selection end
        if (!curvatures[(i + 3) % numPoints]) {
          const kg = -curvatureAtStart(
            p3.x, p3.y, p2.x, p2.y, p1.x, p1.y, p0.x, p0.y
          );
          
          const newHandlesEnd = adjustHandles(
            p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, 
            curvatures[i][3], kg
          );
          
          path.setPoint(path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints), { 
            ...p1, 
            x: newHandlesEnd.c.x, 
            y: newHandlesEnd.c.y 
          });
          path.setPoint(path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints), { 
            ...p2, 
            x: newHandlesEnd.d.x, 
            y: newHandlesEnd.d.y 
          });
        }
      }
    }
  }
}

/**
 * For two adjacent cubic Bézier curves, returns a single segment that replaces both
 * while keeping the curvatures and directions at the start and end.
 * 
 * @param {number} a - First curve start X
 * @param {number} b - First curve start Y
 * @param {number} c - First curve first handle X
 * @param {number} d - First curve first handle Y
 * @param {number} e - First curve second handle X
 * @param {number} f - First curve second handle Y
 * @param {number} g - Common point X
 * @param {number} h - Common point Y
 * @param {number} i - Second curve first handle X
 * @param {number} j - Second curve first handle Y
 * @param {number} k - Second curve second handle X
 * @param {number} l - Second curve second handle Y
 * @param {number} m - Second curve end X
 * @param {number} n - Second curve end Y
 * @returns {Object} New handle coordinates for the combined curve
 */
export function softMerge(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
  const kappa_ab = curvatureAtStart(a, b, c, d, e, f, g, h);
 const kappa_mn = -curvatureAtStart(m, n, k, l, i, j, g, h);
  return adjustHandles(a, b, c, d, k, l, m, n, kappa_ab, kappa_mn);
}

/**
 * Applies a Curvatura operation to a path.
 * 
 * @param {string} operation - The operation to perform: "harmonize", "harmonizehandles", "tunnify", "inflection", or "softmerge"
 * @param {VarPackedPath} path - The path to modify
 * @param {Set} selection - Current selection set
 * @param {boolean} isGlyphVariant - Whether point selection in UI doesn't matter
 */
export function applyCurvaturaOperation(operation, path, selection, isGlyphVariant) {
  // If no selection is made, apply to the whole glyph
  if (selection.size === 0) {
    isGlyphVariant = true;
  }
  
  for (let i = 0; i < path.numContours; i++) {
    if (operation === "harmonize") {
      harmonizeContour(path, i, selection, isGlyphVariant);
    } else if (operation === "harmonizehandles") {
      harmonizeHandlesContour(path, i, selection, isGlyphVariant);
    } else if (operation === "tunnify") {
      tunnifyContour(path, i, selection, isGlyphVariant);
    } else if (operation === "inflection") {
      addInflectionPointsToContour(path, i, selection, isGlyphVariant);
    } else if (operation === "softmerge") {
      // Soft merge implementation would go here
      console.warn("Soft merge operation not fully implemented yet");
    }
  }
}