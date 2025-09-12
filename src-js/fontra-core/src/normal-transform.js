import { Bezier } from "bezier-js";
import { subVectors, normalizeVector, vectorLength, dotVector } from "./vector.js";

/**
 * Calculate the tangent vector to a bezier curve at a given parameter t
 * @param {Bezier} bezier - The bezier curve
 * @param {number} t - The parameter value (0-1)
 * @returns {Object} The tangent vector at point t
 */
export function tangentAtT(bezier, t) {
  const derivative = bezier.derivative(t);
  return { x: derivative.x, y: derivative.y };
}

/**
 * Calculate the normal vector from the tangent vector
 * @param {Object} tangent - The tangent vector
 * @returns {Object} The normal vector (rotated 90 degrees counter-clockwise)
 */
export function normalFromTangent(tangent) {
  // Rotate 90 degrees counter-clockwise: (x, y) -> (-y, x)
  return { x: -tangent.y, y: tangent.x };
}

/**
 * Calculate the parameter t for the closest point on a bezier curve to a given point
 * @param {Bezier} bezier - The bezier curve
 * @param {Object} point - The point {x, y}
 * @param {number} iterations - Number of iterations for Newton-Raphson method (default: 5)
 * @returns {number} The parameter t for the closest point
 */
export function findClosestTOnBezier(bezier, point, iterations = 5) {
  // Validate that the bezier object has the required methods
  if (!bezier || typeof bezier.get !== 'function' || typeof bezier.derivative !== 'function' || typeof bezier.dderivative !== 'function') {
    throw new Error('Invalid Bezier object: missing required methods');
  }
  
  // Validate that the bezier object has points
  if (!bezier.points || !Array.isArray(bezier.points) || bezier.points.length < 2) {
    throw new Error('Invalid Bezier object: points array is missing or invalid');
  }
  
  // Additional validation to ensure points array has a valid length property
  try {
    // Try to access the length property to ensure it's not undefined
    const length = bezier.points.length;
    if (typeof length !== 'number' || isNaN(length)) {
      throw new Error('Invalid Bezier object: points array length is not a valid number');
    }
    
    // Validate that we have a reasonable number of points for a Bezier curve (2-4 points)
    if (length < 2 || length > 4) {
      throw new Error(`Invalid Bezier object: expected 2-4 points, got ${length}`);
    }
  } catch (error) {
    throw new Error('Invalid Bezier object: unable to access points array length');
  }
  
  // Validate that all points have x and y properties
  if (!bezier.points.every(p => p && typeof p.x === 'number' && typeof p.y === 'number')) {
    throw new Error('Invalid Bezier object: points are missing x or y properties');
  }
  
  // Start with a reasonable guess for t
  let t = 0.5;
  
  // Use Newton-Raphson method to find the closest point
  for (let i = 0; i < iterations; i++) {
    let pointOnCurve, derivative, secondDerivative;
    try {
      // Additional validation before calling Bezier methods
      if (!bezier || typeof bezier.get !== 'function') {
        throw new Error('Invalid Bezier object: get method is missing');
      }
      if (typeof bezier.derivative !== 'function') {
        throw new Error('Invalid Bezier object: derivative method is missing');
      }
      if (typeof bezier.dderivative !== 'function') {
        throw new Error('Invalid Bezier object: dderivative method is missing');
      }
      
      pointOnCurve = bezier.get(t);
      derivative = bezier.derivative(t);
      secondDerivative = bezier.dderivative(t);
      
      // Additional validation of returned values
      if (!pointOnCurve || typeof pointOnCurve.x !== 'number' || typeof pointOnCurve.y !== 'number') {
        throw new Error('Invalid point returned by bezier.get()');
      }
      if (!derivative || typeof derivative.x !== 'number' || typeof derivative.y !== 'number') {
        throw new Error('Invalid derivative returned by bezier.derivative()');
      }
      if (!secondDerivative || typeof secondDerivative.x !== 'number' || typeof secondDerivative.y !== 'number') {
        throw new Error('Invalid second derivative returned by bezier.dderivative()');
      }
    } catch (error) {
      // If there's an error calling the Bezier methods, skip this iteration
      console.warn("Error calling Bezier methods:", error);
      break;
    }
    
    // Vector from point on curve to given point
    const diff = subVectors(point, pointOnCurve);
    
    // First derivative of distance squared
    const fPrime = -2 * dotVector(diff, derivative);
    
    // Second derivative of distance squared
    const fDoublePrime = 2 * (dotVector(derivative, derivative) - dotVector(diff, secondDerivative));
    
    // Avoid division by zero
    if (Math.abs(fDoublePrime) < 1e-10) {
      break;
    }
    
    // Newton-Raphson update
    const delta = fPrime / fDoublePrime;
    t = t - delta;
    
    // Clamp t to [0, 1]
    t = Math.max(0, Math.min(1, t));
  }
  
  return t;
}

/**
 * Calculate the normal at the closest point on the curve to a given point
 * @param {Bezier} bezier - The bezier curve
 * @param {Object} point - The point {x, y}
 * @returns {Object} The normal vector at the closest point on the curve
 */
export function normalAtClosestPoint(bezier, point) {
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
  } catch (error) {
    // If there's an error finding the closest t, return a default normal vector
    console.warn("Error finding closest t on bezier:", error);
    return { x: 0, y: 1 }; // Default to pointing up
  }
  
  try {
    const tangent = tangentAtT(bezier, t);
    
    // Validate the tangent vector
    if (!tangent || typeof tangent.x !== 'number' || typeof tangent.y !== 'number') {
      console.warn("Invalid tangent vector returned by tangentAtT");
      return { x: 0, y: 1 }; // Default to pointing up
    }
    
    const normalizedTangent = normalizeVector(tangent);
    
    // Validate the normalized tangent vector
    if (!normalizedTangent || typeof normalizedTangent.x !== 'number' || typeof normalizedTangent.y !== 'number') {
      console.warn("Invalid normalized tangent vector");
      return { x: 0, y: 1 }; // Default to pointing up
    }
    
    return normalFromTangent(normalizedTangent);
  } catch (error) {
    // If there's an error calculating the normal vector, return a default
    console.warn("Error calculating normal vector:", error);
    return { x: 0, y: 1 }; // Default to pointing up
  }
}