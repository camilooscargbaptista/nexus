/**
 * Authentication middleware — JWT verification + user context injection
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest {
  user?: JwtPayload;
  teamId?: string;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  body?: any;
}

export class AuthMiddleware {
  constructor(private readonly jwtSecret: string) {}

  /** Require valid JWT token */
  requireAuth = (req: any, res: any, next: any): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    try {
      const token = header.slice(7);
      const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };

  /** Require specific roles */
  requireRole = (...roles: string[]) => {
    return (req: any, res: any, next: any): void => {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      if (!roles.includes(req.user.role)) {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
      next();
    };
  };

  /** Extract team context from header or param */
  extractTeam = (req: any, _res: any, next: any): void => {
    req.teamId = (req.headers?.["x-team-id"] as string) || (req.params?.teamId as string);
    next();
  };

  /** Generate JWT token */
  generateToken(payload: JwtPayload, expiresIn: string = "7d"): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn } as jwt.SignOptions);
  }
}
