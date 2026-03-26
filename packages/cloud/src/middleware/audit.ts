/**
 * Audit logging middleware — records user actions for compliance
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";

export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  userId: string;
  teamId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export class AuditMiddleware {
  constructor(private readonly store: AuditStore) {}

  /** Log an action after the response is sent */
  log(action: string, resource: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      // Capture on response finish to know if action succeeded
      res.on("finish", () => {
        if (res.statusCode < 400 && req.user) {
          this.store.record({
            userId: req.user.userId,
            teamId: req.teamId,
            action,
            resource,
            resourceId: req.params.id,
            metadata: { method: req.method, path: req.path, status: res.statusCode },
            ip: req.ip,
          }).catch(err => console.error("[Audit] Failed to record:", err));
        }
      });
      next();
    };
  }
}
