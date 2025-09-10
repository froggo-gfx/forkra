import {
  solveCubicBezier,
  solveCubicBezierCurvature,
  calculateCurvatureForSegment,
  solveQuadraticBezier,
  solveQuadraticBezierCurvature,
  calculateCurvatureForQuadraticSegment,
  interpolateColor,
  curvatureToColor,
  findCurvatureRange
} from "@fontra/core/curvature.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("Curvature Tests", () => {
  describe("solveCubicBezier Tests", () => {
    it("should calculate cubic bezier curve values correctly", () => {
      // Test with a simple cubic bezier curve
      const p1 = [0, 0];
      const p2 = [0, 1];
      const p3 = [1, 1];
      const p4 = [1, 0];
      
      // Test at t=0 (should be at p1)
      let result = solveCubicBezier(p1, p2, p3, p4, 0);
      expect(result.r).to.deep.equal([0, 0]);
      
      // Test at t=1 (should be at p4)
      result = solveCubicBezier(p1, p2, p3, p4, 1);
      expect(result.r).to.deep.equal([1, 0]);
      
      // Test at t=0.5
      result = solveCubicBezier(p1, p2, p3, p4, 0.5);
      // For t=0.5, the position should be:
      // r = (1-t)^3*p1 + 3*(1-t)^2*t*p2 + 3*(1-t)*t^2*p3 + t^3*p4
      // r = 0.125*[0,0] + 0.375*[0,1] + 0.375*[1,1] + 0.125*[1,0]
      // r = [0,0] + [0,0.375] + [0.375,0.375] + [0.125,0]
      // r = [0.5, 0.75]
      expect(result.r[0]).to.be.closeTo(0.5, 0.001);
      expect(result.r[1]).to.be.closeTo(0.75, 0.001);
    });
  });

  describe("solveCubicBezierCurvature Tests", () => {
    it("should calculate curvature correctly for cubic bezier", () => {
      // Test with a straight line (curvature should be 0)
      const r1 = [1, 0]; // First derivative (constant)
      const r2 = [0, 0]; // Second derivative (zero)
      
      const curvature = solveCubicBezierCurvature(r1, r2);
      expect(curvature).to.equal(0);
      
      // Test with a simple curve
      // For a circle, curvature = 1/radius
      // Let's use a simple case where we can verify the math
      const r1_circle = [0, 1]; // First derivative
      const r2_circle = [-1, 0]; // Second derivative
      
      const curvature_circle = solveCubicBezierCurvature(r1_circle, r2_circle);
      // For this case: cross = 0*0 - 1*(-1) = 1
      // mag_r1_sq = 0^2 + 1^2 = 1, so mag_r1 = 1
      // curvature = |1| / (1^3) = 1
      expect(curvature_circle).to.be.closeTo(1, 0.001);
    });
  });

  describe("calculateCurvatureForSegment Tests", () => {
    it("should calculate curvature values along a cubic segment", () => {
      // Test with a simple cubic bezier
      const p1 = [0, 0];
      const p2 = [0, 1];
      const p3 = [1, 1];
      const p4 = [1, 0];
      
      const curvatures = calculateCurvatureForSegment(p1, p2, p3, p4, 5);
      
      // Should have 6 points (0, 0.2, 0.4, 0.6, 0.8, 1.0)
      expect(curvatures).to.have.lengthOf(6);
      
      // Check that all t values are in range [0, 1]
      for (const point of curvatures) {
        expect(point.t).to.be.at.least(0);
        expect(point.t).to.be.at.most(1);
        expect(point.curvature).to.be.at.least(0); // Curvature should be non-negative
      }
      
      // First and last points should have t=0 and t=1 respectively
      expect(curvatures[0].t).to.equal(0);
      expect(curvatures[curvatures.length - 1].t).to.equal(1);
    });
  });

  describe("solveQuadraticBezier Tests", () => {
    it("should calculate quadratic bezier curve values correctly", () => {
      // Test with a simple quadratic bezier curve
      const p1 = [0, 0];
      const p2 = [0.5, 1];
      const p3 = [1, 0];
      
      // Test at t=0 (should be at p1)
      let result = solveQuadraticBezier(p1, p2, p3, 0);
      expect(result.r).to.deep.equal([0, 0]);
      
      // Test at t=1 (should be at p3)
      result = solveQuadraticBezier(p1, p2, p3, 1);
      expect(result.r).to.deep.equal([1, 0]);
      
      // Test at t=0.5
      result = solveQuadraticBezier(p1, p2, p3, 0.5);
      // For t=0.5, the position should be:
      // r = (1-t)^2*p1 + 2*(1-t)*t*p2 + t^2*p3
      // r = 0.25*[0,0] + 0.5*[0.5,1] + 0.25*[1,0]
      // r = [0,0] + [0.25,0.5] + [0.25,0]
      // r = [0.5, 0.5]
      expect(result.r[0]).to.be.closeTo(0.5, 0.001);
      expect(result.r[1]).to.be.closeTo(0.5, 0.001);
    });
  });

  describe("solveQuadraticBezierCurvature Tests", () => {
    it("should calculate curvature correctly for quadratic bezier", () => {
      // Test with a straight line (curvature should be 0)
      const r1 = [1, 0]; // First derivative (constant)
      const r2 = [0, 0]; // Second derivative (zero)
      
      const curvature = solveQuadraticBezierCurvature(r1, r2);
      expect(curvature).to.equal(0);
    });
  });

  describe("calculateCurvatureForQuadraticSegment Tests", () => {
    it("should calculate curvature values along a quadratic segment", () => {
      // Test with a simple quadratic bezier
      const p1 = [0, 0];
      const p2 = [0.5, 1];
      const p3 = [1, 0];
      
      const curvatures = calculateCurvatureForQuadraticSegment(p1, p2, p3, 5);
      
      // Should have 6 points (0, 0.2, 0.4, 0.6, 0.8, 1.0)
      expect(curvatures).to.have.lengthOf(6);
      
      // Check that all t values are in range [0, 1]
      for (const point of curvatures) {
        expect(point.t).to.be.at.least(0);
        expect(point.t).to.be.at.most(1);
        expect(point.curvature).to.be.at.least(0); // Curvature should be non-negative
      }
      
      // First and last points should have t=0 and t=1 respectively
      expect(curvatures[0].t).to.equal(0);
      expect(curvatures[curvatures.length - 1].t).to.equal(1);
    });
  });

  describe("interpolateColor Tests", () => {
    it("should interpolate between two colors correctly", () => {
      const color1 = "#FF0000"; // Red
      const color2 = "#0000FF"; // Blue
      
      // Test at t=0 (should be color1)
      let result = interpolateColor(color1, color2, 0);
      expect(result).to.equal("rgba(255, 0, 0, 1)");
      
      // Test at t=1 (should be color2)
      result = interpolateColor(color1, color2, 1);
      expect(result).to.equal("rgba(0, 0, 255, 1)");
      
      // Test at t=0.5 (should be purple)
      result = interpolateColor(color1, color2, 0.5);
      expect(result).to.equal("rgba(128, 0, 128, 1)");
    });
  });

  describe("curvatureToColor Tests", () => {
    it("should map curvature values to colors correctly", () => {
      const minCurvature = 0;
      const maxCurvature = 10;
      const colorStops = ["#0000FF", "#FF0000"]; // Blue to Red
      
      // Test minimum curvature (should be blue)
      let result = curvatureToColor(0, minCurvature, maxCurvature, colorStops);
      expect(result).to.equal("rgba(0, 0, 255, 1)");
      
      // Test maximum curvature (should be red)
      result = curvatureToColor(10, minCurvature, maxCurvature, colorStops);
      expect(result).to.equal("rgba(255, 0, 0, 1)");
      
      // Test middle curvature (should be purple)
      result = curvatureToColor(5, minCurvature, maxCurvature, colorStops);
      expect(result).to.equal("rgba(128, 0, 128, 1)");
    });
    
    it("should handle case where min and max curvature are equal", () => {
      const minCurvature = 5;
      const maxCurvature = 5;
      const colorStops = ["#0000FF", "#FF0000"];
      
      const result = curvatureToColor(5, minCurvature, maxCurvature, colorStops);
      expect(result).to.equal("rgba(128, 128, 128, 1)"); // Default gray
    });
  });

  describe("findCurvatureRange Tests", () => {
    it("should find the min and max curvature values correctly", () => {
      const curvatureData = [
        [
          { t: 0, curvature: 1 },
          { t: 0.5, curvature: 3 },
          { t: 1, curvature: 2 }
        ],
        [
          { t: 0, curvature: 0.5 },
          { t: 0.5, curvature: 4 },
          { t: 1, curvature: 1.5 }
        ]
      ];
      
      const range = findCurvatureRange(curvatureData);
      expect(range.min).to.equal(0.5);
      expect(range.max).to.equal(4);
    });
    
    it("should handle case where all curvatures are zero", () => {
      const curvatureData = [
        [
          { t: 0, curvature: 0 },
          { t: 0.5, curvature: 0 },
          { t: 1, curvature: 0 }
        ]
      ];
      
      const range = findCurvatureRange(curvatureData);
      expect(range.min).to.equal(0);
      expect(range.max).to.equal(1e-10); // Tiny difference to avoid division by zero
    });
  });
});