/**
 * Team management routes
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Router } from "express";
import { z } from "zod";
import { TeamService } from "../services/team-service.js";
import { AuthMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

export function createTeamRoutes(teams: TeamService, authMw: AuthMiddleware): Router {
  const router = Router();

  router.use(authMw.requireAuth);

  router.get("/", async (req: AuthenticatedRequest, res, next) => {
    try {
      const list = await teams.listUserTeams(req.user!.userId);
      res.json({ teams: list });
    } catch (err) { next(err); }
  });

  router.post("/", validate(createTeamSchema), async (req: AuthenticatedRequest, res, next) => {
    try {
      const team = await teams.createTeam({
        ...req.body,
        ownerId: req.user!.userId,
      });
      res.status(201).json(team);
    } catch (err) { next(err); }
  });

  router.get("/:teamId", async (req: AuthenticatedRequest, res, next) => {
    try {
      await teams.requireMembership(req.user!.userId, req.params.teamId);
      const team = await teams.getTeam(req.params.teamId);
      res.json(team);
    } catch (err) { next(err); }
  });

  router.get("/:teamId/members", async (req: AuthenticatedRequest, res, next) => {
    try {
      await teams.requireMembership(req.user!.userId, req.params.teamId);
      const members = await teams.getMembers(req.params.teamId);
      res.json({ members });
    } catch (err) { next(err); }
  });

  router.post("/:teamId/members", validate(addMemberSchema), async (req: AuthenticatedRequest, res, next) => {
    try {
      const membership = await teams.requireMembership(req.user!.userId, req.params.teamId);
      if (!["OWNER", "ADMIN"].includes(membership.role)) {
        res.status(403).json({ error: "Only owners and admins can add members" });
        return;
      }
      const member = await teams.addMember(req.params.teamId, req.body.userId, req.body.role);
      res.status(201).json(member);
    } catch (err) { next(err); }
  });

  router.delete("/:teamId/members/:memberId", async (req: AuthenticatedRequest, res, next) => {
    try {
      const membership = await teams.requireMembership(req.user!.userId, req.params.teamId);
      if (!["OWNER", "ADMIN"].includes(membership.role)) {
        res.status(403).json({ error: "Only owners and admins can remove members" });
        return;
      }
      await teams.removeMember(req.params.memberId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
