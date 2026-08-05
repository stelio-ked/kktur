import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "meu-secret-super-seguro-dev-only")) {
  console.error("FATAL: JWT_SECRET não configurado ou inseguro em ambiente de produção.");
  process.exit(1);
}

export const JWT_SECRET = process.env.JWT_SECRET || "meu-secret-super-seguro-dev-only";

export interface AuthRequest extends Request {
  user?: any;
}

export const formatDbError = (err: any): string => {
  if (err && err.message) {
    let msg = err.message;
    if (err.cause) {
      const causeMsg = typeof err.cause === 'object' && (err.cause as any).message ? (err.cause as any).message : String(err.cause);
      msg += ` | Causa original: ${causeMsg}`;
    }
    return msg;
  }
  return String(err);
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  
  if (token === "traveler-session") {
    if (process.env.NODE_ENV === "production") {
      return res.status(401).json({ error: "Sessão estática desativada em produção" });
    }
    req.user = { id: 0, email: "traveler@viagem.com", name: "Viajante" };
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token inválido" });
  }
};
