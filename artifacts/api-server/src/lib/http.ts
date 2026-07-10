import type { Request, Response } from "express";
import type { z } from "zod";

export function parseId(
  value: string | string[] | undefined,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Parse and require a propertyId query param.
export function parsePropertyIdQuery(req: Request): number | null {
  const raw = req.query["propertyId"];
  if (typeof raw !== "string") return null;
  return parseId(raw);
}

export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  req: Request,
  res: Response,
): z.infer<T> | undefined {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: result.error.issues,
    });
    return undefined;
  }
  return result.data;
}
