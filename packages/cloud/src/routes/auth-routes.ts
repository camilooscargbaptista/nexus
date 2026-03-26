/**
 * Auth routes — register, login, profile
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Router } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth-service.js";
import { AuthMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

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

  router.post("/register", validate(registerSchema), async (req, res, next) => {
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

  router.post("/login", validate(loginSchema), async (req, res, next) => {
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
