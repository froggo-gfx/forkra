import { Bezier } from "bezier-js";
import { subVectors, normalizeVector, vectorLength, dotVector } from "./vector.js";

/**
 * Calculate the tangent vector to a bezier curve at a given parameter t
 * @param {Bezier} bezier - The bezier curve
 * @param {number} t - The parameter value (0-1)
 * @returns {Object} The tangent vector at point t
 */
export function tangentAtT(bezier, t) {
  console.log("tangentAtT called", { t });
  const derivative = bezier.derivative(t);
  const tangent = { x: derivative.x, y: derivative.y };
  console.log("tangentAtT result", { tangent });
  return tangent;
}

/**
 * Calculate the normal vector from the tangent vector
 * @param {Object} tangent - The tangent vector
 * @returns {Object} The normal vector (rotated 90 degrees counter-clockwise)
 */
export function normalFromTangent(tangent) {
  console.log("normalFromTangent called", { tangent });
  // Rotate 90 degrees counter-clockwise: (x, y) -> (-y, x)
  const normal = { x: -tangent.y, y: tangent.x };
  console.log("normalFromTangent result", { normal });
  return normal;
}

/**
 * Calculate the parameter t for the closest point on a bezier curve to a given point
 * @param {Bezier} bezier - The bezier curve
 * @param {Object} point - The point {x, y}
 * @param {number} iterations - Number of iterations for Newton-Raphson method (default: 5)
 * @returns {number} The parameter t for the closest point
 */
export function findClosestTOnBezier(bezier, point, iterations = 5) {
  console.log("findClosestTOnBezier called", { point, iterations });
  
  // Validate that the bezier object has the required methods
  if (!bezier || typeof bezier.get !== 'function' || typeof bezier.derivative !== 'function' || typeof bezier.dderivative !== 'function') {
    console.error('Invalid Bezier object: missing required methods');
    throw new Error('Invalid Bezier object: missing required methods');
  }
  
  // Validate that the bezier object has points
  if (!bezier.points || !Array.isArray(bezier.points) || bezier.points.length < 2) {
    console.error('Invalid Bezier object: points array is missing or invalid');
    throw new Error('Invalid Bezier object: points array is missing or invalid');
  }
  
  console.log("Bezier points", { points: bezier.points });
  
  // Additional validation to ensure points array has a valid length property
  try {
    // Try to access the length property to ensure it's not undefined
    const length = bezier.points.length;
    if (typeof length !== 'number' || isNaN(length)) {
      console.error('Invalid Bezier object: points array length is not a valid number');
      throw new Error('Invalid Bezier object: points array length is not a valid number');
    }
    
    // Validate that we have a reasonable number of points for a Bezier curve (2-4 points)
    if (length < 2 || length > 4) {
      console.error(`Invalid Bezier object: expected 2-4 points, got ${length}`);
      throw new Error(`Invalid Bezier object: expected 2-4 points, got ${length}`);
    }
  } catch (error) {
    console.error('Invalid Bezier object: unable to access points array length', error);
    throw new Error('Invalid Bezier object: unable to access points array length');
  }
  
  // Validate that all points have x and y properties
  if (!bezier.points.every(p => p && typeof p.x === 'number' && typeof p.y === 'number')) {
    console.error('Invalid Bezier object: points are missing x or y properties');
    throw new Error('Invalid Bezier object: points are missing x or y properties');
  }
  
  // Start with a reasonable guess for t
  let t = 0.5;
  console.log("Initial t value", { t });
  
  // Use Newton-Raphson method to find the closest point
  for (let i = 0; i < iterations; i++) {
    console.log("Newton-Raphson iteration", { iteration: i, t });
    
    let pointOnCurve, derivative, secondDerivative;
    try {
      // Additional validation before calling Bezier methods
      if (!bezier || typeof bezier.get !== 'function') {
        console.error('Invalid Bezier object: get method is missing');
        throw new Error('Invalid Bezier object: get method is missing');
      }
      if (typeof bezier.derivative !== 'function') {
        console.error('Invalid Bezier object: derivative method is missing');
        throw new Error('Invalid Bezier object: derivative method is missing');
      }
      if (typeof bezier.dderivative !== 'function') {
        console.error('Invalid Bezier object: dderivative method is missing');
        throw new Error('Invalid Bezier object: dderivative method is missing');
      }
      
      pointOnCurve = bezier.get(t);
      derivative = bezier.derivative(t);
      secondDerivative = bezier.dderivative(t);
      
      console.log("Bezier calculations", { pointOnCurve, derivative, secondDerivative });
      
      // Additional validation of returned values
      if (!pointOnCurve || typeof pointOnCurve.x !== 'number' || typeof pointOnCurve.y !== 'number') {
        console.error('Invalid point returned by bezier.get()');
        throw new Error('Invalid point returned by bezier.get()');
      }
      if (!derivative || typeof derivative.x !== 'number' || typeof derivative.y !== 'number') {
        console.error('Invalid derivative returned by bezier.derivative()');
        throw new Error('Invalid derivative returned by bezier.derivative()');
      }
      if (!secondDerivative || typeof secondDerivative.x !== 'number' || typeof secondDerivative.y !== 'number') {
        console.error('Invalid second derivative returned by bezier.dderivative()');
        throw new Error('Invalid second derivative returned by bezier.dderivative()');
      }
    } catch (error) {
      // If there's an error calling the Bezier methods, skip this iteration
      console.warn("Error calling Bezier methods:", error);
      break;
    }
    
    // Vector from point on curve to given point
    const diff = subVectors(point, pointOnCurve);
    console.log("Vector difference", { diff });
    
    // First derivative of distance squared
    const fPrime = -2 * dotVector(diff, derivative);
    
    // Second derivative of distance squared
    const fDoublePrime = 2 * (dotVector(derivative, derivative) - dotVector(diff, secondDerivative));
    
    console.log("Derivatives", { fPrime, fDoublePrime });
    
    // Avoid division by zero
    if (Math.abs(fDoublePrime) < 1e-10) {
      console.log("Avoiding division by zero, breaking");
      break;
    }
    
    // Newton-Raphson update
    const delta = fPrime / fDoublePrime;
    t = t - delta;
    console.log("Updated t", { delta, t });
    
    // Clamp t to [0, 1]
    t = Math.max(0, Math.min(1, t));
    console.log("Clamped t", { t });
  }
  
  console.log("findClosestTOnBezier result", { t });
 return t;
}

/**
 * Calculate the normal at the closest point on the curve to a given point
 * @param {Bezier} bezier - The bezier curve
 * @param {Object} point - The point {x, y}
 * @returns {Object} The normal vector at the closest point on the curve
 */
export function normalAtClosestPoint(bezier, point) {
  console.log("normalAtClosestPoint called", { point });
  
  // Additional validation for the bezier and point parameters
  if (!bezier) {
    console.warn("Invalid Bezier object: bezier is null or undefined");
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
    console.warn("Invalid point: point is null or has invalid coordinates");
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  // Validate that the bezier object has the required structure
  if (!bezier.points || !Array.isArray(bezier.points)) {
    console.warn("Invalid Bezier object: missing points array");
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  console.log("Bezier points in normalAtClosestPoint", { points: bezier.points });
  
  // Validate that we have at least 2 points for a valid Bezier curve
  if (bezier.points.length < 2) {
    console.warn("Invalid Bezier object: insufficient points for Bezier curve", bezier.points.length);
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  // Validate that all points have x and y properties
  if (!bezier.points.every(p => p && typeof p.x === 'number' && typeof p.y === 'number')) {
    console.warn("Invalid Bezier object: points are missing x or y properties");
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  let t;
  try {
    t = findClosestTOnBezier(bezier, point);
    console.log("Found closest t", { t });
  } catch (error) {
    // If there's an error finding the closest t, return a default normal vector
    console.warn("Error finding closest t on bezier:", error);
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  try {
    const tangent = tangentAtT(bezier, t);
    console.log("Calculated tangent", { tangent });
    
    // Validate the tangent vector
    if (!tangent || typeof tangent.x !== 'number' || typeof tangent.y !== 'number') {
      console.warn("Invalid tangent vector returned by tangentAtT");
      return { x: 0, y: 1 }; // Default to pointing up
    }
    
    const normalizedTangent = normalizeVector(tangent);
    console.log("Normalized tangent", { normalizedTangent });
    
    // Validate the normalized tangent vector
    if (!normalizedTangent || typeof normalizedTangent.x !== 'number' || typeof normalizedTangent.y !== 'number') {
      console.warn("Invalid normalized tangent vector");
      return { x: 0, y: 1 }; // Default to pointing up
    }
    
    const normal = normalFromTangent(normalizedTangent);
    console.log("Calculated normal", { normal });
    return normal;
  } catch (error) {
    // If there's an error calculating the normal vector, return a default
    console.warn("Error calculating normal vector:", error);
    return { x: 0, y: 1 }; // Default to pointing up
  }
}