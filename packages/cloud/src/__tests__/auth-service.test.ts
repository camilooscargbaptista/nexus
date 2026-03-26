/**
 * AuthService Tests
 * @author Test Suite
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AuthService } from "../services/auth-service.js";
import { createInMemoryRepositories } from "../repositories/in-memory.js";
import { AppError } from "../middleware/error-handler.js";

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    const repos = createInMemoryRepositories();
    authService = new AuthService(repos.users);
  });

  describe("register", () => {
    it("creates user with hashed password", async () => {
      const user = await authService.register({
        email: "alice@example.com",
        name: "Alice",
        password: "securePassword123",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("alice@example.com");
      expect(user.name).toBe("Alice");
      expect(user.passwordHash).not.toBe("securePassword123");
      expect(user.role).toBe("MEMBER");
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("rejects duplicate email", async () => {
      await authService.register({
        email: "bob@example.com",
        name: "Bob",
        password: "pass123",
      });

      await expect(
        authService.register({
          email: "bob@example.com",
          name: "Bob2",
          password: "pass456",
        })
      ).rejects.toThrow(AppError);
    });

    it("normalizes email (lowercase, trim)", async () => {
      const user = await authService.register({
        email: "  CHARLIE@EXAMPLE.COM  ",
        name: "Charlie",
        password: "pass789",
      });

      expect(user.email).toBe("charlie@example.com");
    });

    it("trims name whitespace", async () => {
      const user = await authService.register({
        email: "dave@example.com",
        name: "  Dave Davis  ",
        password: "pass999",
      });

      expect(user.name).toBe("Dave Davis");
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await authService.register({
        email: "eve@example.com",
        name: "Eve",
        password: "correctPassword123",
      });
    });

    it("returns user on valid credentials", async () => {
      const user = await authService.login({
        email: "eve@example.com",
        password: "correctPassword123",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("eve@example.com");
      expect(user.name).toBe("Eve");
    });

    it("throws on wrong password", async () => {
      await expect(
        authService.login({
          email: "eve@example.com",
          password: "wrongPassword",
        })
      ).rejects.toThrow(AppError);
    });

    it("throws on non-existent email", async () => {
      await expect(
        authService.login({
          email: "nonexistent@example.com",
          password: "anyPassword",
        })
      ).rejects.toThrow(AppError);
    });

    it("normalizes email for lookup", async () => {
      const user = await authService.login({
        email: "  EVE@EXAMPLE.COM  ",
        password: "correctPassword123",
      });

      expect(user.email).toBe("eve@example.com");
    });
  });

  describe("getProfile", () => {
    it("returns user by ID", async () => {
      const registered = await authService.register({
        email: "frank@example.com",
        name: "Frank",
        password: "pass123",
      });

      const profile = await authService.getProfile(registered.id);

      expect(profile.id).toBe(registered.id);
      expect(profile.email).toBe("frank@example.com");
    });

    it("throws if user not found", async () => {
      await expect(authService.getProfile("nonexistent-id")).rejects.toThrow(
        AppError
      );
    });
  });
});
