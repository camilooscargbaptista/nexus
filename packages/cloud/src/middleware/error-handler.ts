/**
 * Global error handler middleware
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, code?: string): AppError {
    return new AppError(400, message, code);
  }

  static unauthorized(message: string = "Unauthorized"): AppError {
    return new AppError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message: string = "Forbidden"): AppError {
    return new AppError(403, message, "FORBIDDEN");
  }

  static notFound(resource: string): AppError {
    return new AppError(404, `${resource} not found`, "NOT_FOUND");
  }

  static conflict(message: string): AppError {
    return new AppError(409, message, "CONFLICT");
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    (res as any).status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  console.error("[Nexus Cloud] Unhandled error:", err);
  (res as any).status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}
