import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { db } from "../db/index.js";
import { apiUsageLogs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const MAX_GEMINI_CALLS_PER_DAY = 20;

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

    const currentCount = existing?.callCount ?? 0;

    if (currentCount >= MAX_GEMINI_CALLS_PER_DAY) {
      return res.status(429).json({ 
        error: `Limite diário de uso da IA atingido (${MAX_GEMINI_CALLS_PER_DAY} usos/dia). Tente novamente amanhã.`
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

    // Inform client about remaining quota
    const remaining = MAX_GEMINI_CALLS_PER_DAY - (currentCount + 1);
    res.setHeader("X-AI-Remaining", Math.max(0, remaining));
    res.setHeader("X-AI-Limit", MAX_GEMINI_CALLS_PER_DAY);
  } catch (error) {
    console.warn("Failed to update API usage logs:", error);
  }
  next();
};

