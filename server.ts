import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import path from "path";

import { db } from "./src/db/index.js";
import { users } from "./src/db/schema.js";
// Nota: restoreItinerary45IfNeeded foi movida para scripts/seed-itinerary45.ts
// Execute manualmente com: npx tsx scripts/seed-itinerary45.ts

import authRouter from "./src/routes/auth.js";
import devRouter from "./src/routes/dev.js";
import itinerariesRouter from "./src/routes/itineraries.js";
import chatRouter from "./src/routes/chat.js";
import aiRouter from "./src/routes/ai.js";
import adminRouter from "./src/routes/admin.js";

async function startServer() {
  if (db) {
    try {
      // P12: Migrações de schema devem ser executadas via `npx drizzle-kit migrate`
      // antes do deploy, não durante o boot. O ALTER TABLE abaixo foi removido.
      console.log("Database connection ready.");
    } catch (err) {
      console.error("Error during startup DB check:", err);
    }
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Health and Diagnostic Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      message: "Servidor online com Postgres suportado!",
    });
  });

  app.get("/api/ping-db", async (req, res) => {
    if (!db) {
      return res.status(503).json({
        error: "DATABASE_URL não configurada no painel de Segredos (Settings > Secrets).",
      });
    }

    try {
      const allUsers = await db.select().from(users).limit(1);
      res.json({
        status: "ok",
        message: "Conectado ao PostgreSQL com sucesso!",
        testQuery: allUsers,
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ status: "error", error: error.message });
    }
  });

  // Mount Modular Routes
  app.use("/api/auth", authRouter);
  app.use("/api/dev", devRouter);
  app.use("/api/itineraries", itinerariesRouter);
  app.use("/api/messages", chatRouter);
  app.use("/api/chat", chatRouter); // inclui SSE em GET /api/chat/stream/:itineraryId

  app.use("/api/gemini", aiRouter);
  app.use("/api", adminRouter);

  // Servir arquivos de uploads locais
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Serve Frontend / Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
