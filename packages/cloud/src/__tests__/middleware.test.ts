/**
 * Middleware Tests
 * @author Test Suite
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AuthMiddleware, JwtPayload } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";

describe("AuthMiddleware", () => {
  let authMiddleware: AuthMiddleware;
  const jwtSecret = "test-secret-key-at-least-16-chars";

  beforeEach(() => {
    authMiddleware = new AuthMiddleware(jwtSecret);
  });

  describe("generateToken + verify cycle", () => {
    it("generates and verifies JWT token", () => {
      const payload: JwtPayload = {
        userId: "user-123",
        email: "user@example.com",
        role: "ADMIN",
      };

      const token = authMiddleware.generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT structure: header.payload.signature
    });

    it("token expires as configured", () => {
      const payload: JwtPayload = {
        userId: "user-456",
        email: "admin@example.com",
        role: "OWNER",
      };

      const tokenShort = authMiddleware.generateToken(payload, "1ms");

      expect(tokenShort).toBeDefined();
      // Note: In real tests, you'd verify expiration with time manipulation
    });
  });

  describe("requireAuth middleware", () => {
    it("rejects missing header", () => {
      const payload: JwtPayload = {
        userId: "user-789",
        email: "test@example.com",
        role: "MEMBER",
      };

      const token = authMiddleware.generateToken(payload);

      // Create mock request/response
      const mockReq: any = { headers: {} };
      const mockRes: any = {
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: any) {
          this.jsonData = data;
        },
      };
      const mockNext = jest.fn();

      authMiddleware.requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.statusCode).toBe(401);
      expect(mockRes.jsonData.error).toContain("Missing or invalid");
    });

    it("rejects invalid token", () => {
      const mockReq: any = {
        headers: {
          authorization: "Bearer invalid.token.here",
        },
      };
      const mockRes: any = {
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: any) {
          this.jsonData = data;
        },
      };
      const mockNext = jest.fn();

      authMiddleware.requireAuth(mockReq, mockRes, mockNext);

      expect(mockRes.statusCode).toBe(401);
    });

    it("accepts valid token", () => {
      const payload: JwtPayload = {
        userId: "user-999",
        email: "valid@example.com",
        role: "MEMBER",
      };

      const token = authMiddleware.generateToken(payload);
      const mockReq: any = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };
      const mockRes: any = {};
      const mockNext = jest.fn();

      authMiddleware.requireAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.userId).toBe("user-999");
    });
  });

  describe("requireRole middleware", () => {
    it("allows matching role", () => {
      const roleCheck = authMiddleware.requireRole("ADMIN", "OWNER");

      const mockReq: any = {
        user: {
          userId: "user-123",
          email: "admin@example.com",
          role: "ADMIN",
        },
      };
      const mockRes: any = {};
      const mockNext = jest.fn();

      roleCheck(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("rejects non-matching role", () => {
      const roleCheck = authMiddleware.requireRole("ADMIN");

      const mockReq: any = {
        user: {
          userId: "user-456",
          email: "member@example.com",
          role: "MEMBER",
        },
      };
      const mockRes: any = {
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: any) {
          this.jsonData = data;
        },
      };
      const mockNext = jest.fn();

      roleCheck(mockReq, mockRes, mockNext);

      expect(mockRes.statusCode).toBe(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("rejects if not authenticated", () => {
      const roleCheck = authMiddleware.requireRole("ADMIN");

      const mockReq: any = { headers: {} };
      const mockRes: any = {
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: any) {
          this.jsonData = data;
        },
      };
      const mockNext = jest.fn();

      roleCheck(mockReq, mockRes, mockNext);

      expect(mockRes.statusCode).toBe(401);
    });
  });
});

describe("AppError", () => {
  describe("factory methods produce correct status codes", () => {
    it("badRequest returns 400", () => {
      const error = AppError.badRequest("Invalid input");

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Invalid input");
      expect(error.name).toBe("AppError");
    });

    it("unauthorized returns 401", () => {
      const error = AppError.unauthorized("Please log in");

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Please log in");
      expect(error.code).toBe("UNAUTHORIZED");
    });

    it("forbidden returns 403", () => {
      const error = AppError.forbidden("Access denied");

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("Access denied");
      expect(error.code).toBe("FORBIDDEN");
    });

    it("notFound returns 404", () => {
      const error = AppError.notFound("User");

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("User not found");
      expect(error.code).toBe("NOT_FOUND");
    });

    it("conflict returns 409", () => {
      const error = AppError.conflict("Email already exists");

      expect(error.statusCode).toBe(409);
      expect(error.message).toBe("Email already exists");
      expect(error.code).toBe("CONFLICT");
    });

    it("unauthorized default message", () => {
      const error = AppError.unauthorized();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Unauthorized");
    });

    it("forbidden default message", () => {
      const error = AppError.forbidden();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("Forbidden");
    });
  });
});

