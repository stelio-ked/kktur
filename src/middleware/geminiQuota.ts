import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { db } from "../db/index.js";
import { apiUsageLogs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const MAX_GEMINI_CALLS_PER_DAY = 15;

export const geminiQuotaMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.id === 0) return next();

  const userId = req.user.id;
  const itineraryId = req.body?.itineraryId || req.query?.itineraryId || null;
  const dateStr = new Date().toISOString().split('T')[0];

  try {
    const existing = await db.query.apiUsageLogs.findFirst({
      where: and(
        eq(apiUsageLogs.userId, userId),
        eq(apiUsageLogs.dateString, dateStr)
      )
    });

    if (existing && existing.callCount >= MAX_GEMINI_CALLS_PER_DAY) {
      return res.status(429).json({ 
        error: `Limite diário de uso da IA atingido. Para evitar custos excessivos, o limite é de ${MAX_GEMINI_CALLS_PER_DAY} requisições por dia. Tente novamente amanhã.` 
      });
    }

    if (existing) {
      await db.update(apiUsageLogs).set({
        callCount: existing.callCount + 1,
        updatedAt: new Date()
      }).where(eq(apiUsageLogs.id, existing.id));
    } else {
      await db.insert(apiUsageLogs).values({
        userId,
        itineraryId,
        dateString: dateStr,
        callCount: 1,
      });
    }
  } catch (error) {
    console.warn("Failed to update API usage logs:", error);
  }
  next();
};
