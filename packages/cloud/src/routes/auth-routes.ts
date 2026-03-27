/**
 * Auth routes — register, login, profile
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Router } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth-service.js";
import { AuthMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimiter } from "../middleware/rate-limiter.js";

// Rate limiters para rotas de auth (anti-brute-force)
const registerLimiter = rateLimiter({ maxRequests: 3, windowMs: 600_000, message: "Too many registration attempts, try again in 10 minutes." });
const loginLimiter = rateLimiter({ maxRequests: 5, windowMs: 60_000, message: "Too many login attempts, try again in 1 minute." });

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function createAuthRoutes(auth: AuthService, authMw: AuthMiddleware): Router {
  const router = Router();

  router.post("/register", registerLimiter, validate(registerSchema), async (req, res, next) => {
    try {
      const user = await auth.register(req.body);
      const token = authMw.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      res.status(201).json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err) { next(err); }
  });

  router.post("/login", loginLimiter, validate(loginSchema), async (req, res, next) => {
    try {
      const user = await auth.login(req.body);
      const token = authMw.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err) { next(err); }
  });

  router.get("/me", authMw.requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await auth.getProfile(req.user!.userId);
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (err) { next(err); }
  });

  return router;
}
