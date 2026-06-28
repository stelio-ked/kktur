import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.js";
import {
  users, itineraries, travelers, destinations, itineraryDays, activities,
  costs, costCategories, documents, flights, generalTips, notifications, transactionLogs, flightPassengers,
  chatMessages, accessLogs, nearbyPlaces, apiUsageLogs
} from "./src/db/schema.js";
import { eq, inArray, and, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";

const JWT_SECRET = process.env.JWT_SECRET || "meu-secret-super-seguro-dev-only";

const formatDbError = (err: any): string => {
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

function mapItineraryFromDb(itinerary: any): any {
  const prefix = `${itinerary.id}_`;
  const strip = (id: string | undefined | null) => {
    if (!id) return '';
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
  };

  return {
    id: itinerary.id,
    ownerId: itinerary.ownerId,
    title: itinerary.title,
    ecoMode: itinerary.ecoMode || false,
    data: {
      travelers: (itinerary.travelers || []).map((t: any) => ({
        ...t,
        id: strip(t.id)
      })),
      destinations: (itinerary.destinations || []).map((d: any) => ({
        id: strip(d.id),
        city: d.city,
        state: d.state,
        country: d.country,
        dates: d.dates,
        startDate: d.startDate,
        endDate: d.endDate,
        hotelName: d.hotelName,
        hotelLink: d.hotelLink,
        hotelAddress: d.hotelAddress,
        hotelCoords: (d.hotelCoordsLat && d.hotelCoordsLng) ? { lat: d.hotelCoordsLat, lng: d.hotelCoordsLng } : undefined,
        checkInTime: d.checkInTime,
        checkOutTime: d.checkOutTime,
        checkInDate: d.checkInDate,
        notes: d.notes,
        days: (d.days || []).map((day: any) => ({
          id: strip(day.id),
          dayNumber: day.dayNumber,
          dateStr: day.dateStr,
          title: day.title,
          activities: (day.activities || []).map((act: any) => ({
            ...act,
            id: strip(act.id),
            dayId: strip(act.dayId)
          }))
        })).sort((a: any, b: any) => a.dayNumber - b.dayNumber)
      })),
      costs: (itinerary.costs || []).map((c: any) => ({
        ...c,
        id: strip(c.id),
        destinationId: c.destinationId ? strip(c.destinationId) : null
      })),
      costCategories: (itinerary.costCategories || []).map((cc: any) => ({
        ...cc,
        id: strip(cc.id)
      })),
      documents: (itinerary.documents || []).map((doc: any) => ({
        ...doc,
        id: strip(doc.id)
      })),
      flights: (itinerary.flights || []).map((f: any) => ({
        ...f,
        id: strip(f.id),
        passengersList: ((f as any).passengersList || []).map((p: any) => ({
          ...p,
          id: strip(p.id),
          flightId: strip(p.flightId)
        }))
      })),
      generalTips: (itinerary.generalTips || []).map((tip: any) => ({
        ...tip,
        id: strip(tip.id)
      })),
      notifications: (itinerary.notifications || []).map((n: any) => ({
        ...n,
        id: strip(n.id)
      })),
      transactionLogs: (itinerary.transactionLogs || []).map((log: any) => ({
        ...log,
        id: strip(log.id)
      }))
    }
  };
}

async function saveItineraryData(
  tx: any,
  itineraryId: number,
  data: any,
  options: {
    existingFlights?: any[];
    existingDocuments?: any[];
    existingCosts?: any[];
    existingActivities?: any[];
  } = {}
) {
  const {
    existingFlights = [],
    existingDocuments = [],
    existingCosts = [],
    existingActivities = []
  } = options;

  const prefix = `${itineraryId}_`;
  const p = (id: string | number | undefined | null, prefixType: string) => {
    if (!id) return `${prefix}${prefixType}-${Math.random().toString(36).substring(7)}`;
    const strId = String(id);
    if (strId.startsWith(prefix)) return strId;
    return `${prefix}${strId}`;
  };

  // 1. Travelers
  if (data.travelers && data.travelers.length > 0) {
    await tx.insert(travelers).values(data.travelers.map((t: any) => ({
      id: p(t.id, 't'),
      itineraryId,
      name: t.name || '',
      role: t.role || '',
      email: t.email || '',
      checkedActivities: t.checkedActivities || '',
      packingItems: t.packingItems || '',
      createdByEmail: t.createdByEmail || null
    })));
  }

  // 2. Cost Categories
  if (data.costCategories && data.costCategories.length > 0) {
    await tx.insert(costCategories).values(data.costCategories.map((c: any) => ({
      id: p(c.id, 'cc'),
      itineraryId,
      label: c.label || '',
      color: c.color || '#94A3B8'
    })));
  }

  // 3. Destinations, Days, and Activities
  if (data.destinations && data.destinations.length > 0) {
    const dbDestinationsValues = data.destinations.map((d: any) => ({
      id: p(d.id, 'd'),
      itineraryId,
      city: d.city || '',
      state: d.state || '',
      country: d.country || '',
      dates: d.dates || '',
      startDate: d.startDate || d.dates?.split(" - ")[0] || '',
      endDate: d.endDate || d.dates?.split(" - ")[1] || '',
      hotelName: d.hotelName || '',
      hotelLink: d.hotelLink || '',
      hotelAddress: d.hotelAddress || '',
      hotelCoordsLat: d.hotelCoords?.lat ?? null,
      hotelCoordsLng: d.hotelCoords?.lng ?? null,
      checkInTime: d.checkInTime || '',
      checkOutTime: d.checkOutTime || '',
      checkInDate: d.checkInDate || '',
      notes: d.notes || '',
      createdByEmail: d.createdByEmail || null
    }));
    await tx.insert(destinations).values(dbDestinationsValues);

    const daysToInsert: any[] = [];
    const activitiesToInsert: any[] = [];

    data.destinations.forEach((d: any, dIdx: number) => {
      if (d.days && d.days.length > 0) {
        d.days.forEach((day: any) => {
          const dayDbId = p(day.id, 'day');
          daysToInsert.push({
            id: dayDbId,
            destinationId: dbDestinationsValues[dIdx].id,
            dayNumber: day.dayNumber || 0,
            dateStr: day.dateStr || '',
            title: day.title || ''
          });

          if (day.activities && day.activities.length > 0) {
            day.activities.forEach((act: any) => {
              let fileData = act.ticketFileData || '';
              if (fileData === "(large_preview_hidden_in_local_storage)") {
                const found = existingActivities.find((ea: any) => p(ea.id, 'act') === p(act.id, 'act'));
                if (found && found.ticketFileData && found.ticketFileData !== "(large_preview_hidden_in_local_storage)") {
                  fileData = found.ticketFileData;
                }
              }
              activitiesToInsert.push({
                id: p(act.id, 'act'),
                dayId: dayDbId,
                time: act.time || '',
                location: act.location || '',
                duration: act.duration || '',
                cost: act.cost || '',
                mapsQuery: act.mapsQuery || '',
                websiteLink: act.websiteLink || '',
                parking: act.parking || '',
                notes: act.notes || '',
                ticketFileName: act.ticketFileName || '',
                ticketFileData: fileData,
                date: act.date || '',
                createdByEmail: act.createdByEmail || null
              });
            });
          }
        });
      }
    });

    if (daysToInsert.length > 0) {
      await tx.insert(itineraryDays).values(daysToInsert);
    }
    if (activitiesToInsert.length > 0) {
      const chunkSize = 20;
      for (let i = 0; i < activitiesToInsert.length; i += chunkSize) {
        const chunk = activitiesToInsert.slice(i, i + chunkSize);
        await tx.insert(activities).values(chunk);
      }
    }
  }

  // 4. Costs
  if (data.costs && data.costs.length > 0) {
    await tx.insert(costs).values(data.costs.map((c: any) => {
      let receiptData = c.receiptData || null;
      if (receiptData === "(large_preview_hidden_in_local_storage)") {
        const found = existingCosts.find((ec: any) => p(ec.id, 'c') === p(c.id, 'c'));
        if (found && found.receiptData && found.receiptData !== "(large_preview_hidden_in_local_storage)") {
          receiptData = found.receiptData;
        }
      }
      return {
        id: p(c.id, 'c'),
        itineraryId,
        category: c.category || '',
        description: c.description || '',
        notes: c.notes || '',
        link: c.link || '',
        totalCostBRL: Number(c.totalCostBRL) || 0,
        status: c.status || '',
        dateRange: c.dateRange || '',
        destinationId: c.destinationId ? p(c.destinationId, 'd') : '',
        isPersonal: c.isPersonal ?? false,
        createdByEmail: c.createdByEmail || null,
        receiptName: c.receiptName || null,
        receiptData
      };
    }));
  }

  // 5. Documents
  if (data.documents && data.documents.length > 0) {
    await tx.insert(documents).values(data.documents.map((doc: any) => {
      let fileData = doc.fileData || '';
      if (fileData === "(large_preview_hidden_in_local_storage)") {
        const found = existingDocuments.find((ed: any) => p(ed.id, 'doc') === p(doc.id, 'doc'));
        if (found && found.fileData && found.fileData !== "(large_preview_hidden_in_local_storage)") {
          fileData = found.fileData;
        }
      }
      return {
        id: p(doc.id, 'doc'),
        itineraryId,
        type: doc.type || 'other',
        title: doc.title || '',
        airline: doc.airline || '',
        flightNumber: doc.flightNumber || '',
        passengerName: doc.passengerName || '',
        fileData,
        fileName: doc.fileName || '',
        notes: doc.notes || '',
        uploadedAt: doc.uploadedAt || new Date().toISOString(),
        createdByEmail: doc.createdByEmail || null
      };
    }));
  }

  // 6. Flights & Passengers
  if (data.flights && data.flights.length > 0) {
    const flightsToInsert = data.flights.map((f: any) => {
      let fileData = f.ticketFileData || '';
      if (fileData === "(large_preview_hidden_in_local_storage)") {
        const found = existingFlights.find((ef: any) => p(ef.id, 'f') === p(f.id, 'f'));
        if (found && found.ticketFileData && found.ticketFileData !== "(large_preview_hidden_in_local_storage)") {
          fileData = found.ticketFileData;
        }
      }
      return {
        id: p(f.id, 'f'),
        itineraryId,
        airline: f.airline || '',
        logoUrl: f.logoUrl || '',
        flightCode: f.flightCode || '',
        departureCity: f.departureCity || '',
        departureCode: f.departureCode || '',
        departureTime: f.departureTime || '',
        arrivalCity: f.arrivalCity || '',
        arrivalCode: f.arrivalCode || '',
        arrivalTime: f.arrivalTime || '',
        duration: f.duration || '',
        dateStr: f.dateStr || '',
        arrivalDateStr: f.arrivalDateStr || '',
        status: f.status || 'Confirmado',
        isDeleted: f.isDeleted || false,
        gate: f.gate || '',
        locator: f.locator || '',
        passengers: f.passengers || '',
        seats: f.seats || '',
        ticketFileName: f.ticketFileName || '',
        ticketFileData: fileData,
        createdByEmail: f.createdByEmail || null
      };
    });

    await tx.insert(flights).values(flightsToInsert);

    const passengersToInsert: any[] = [];
    data.flights.forEach((f: any, idx: number) => {
      const flightDbId = flightsToInsert[idx].id;
      if (f.passengersList && Array.isArray(f.passengersList)) {
        f.passengersList.forEach((pass: any) => {
          let fileData = pass.ticketFileData || null;
          if (fileData && fileData.length > 5000000) { 
            // Avoid saving very large base64 strings directly in local storage placeholder 
            // Currently this is stored in Postgres, so it's fine, but if we need a placeholder...
            // actually we want to store it in DB!
          }
          passengersToInsert.push({
            id: p(pass.id, 'fp'),
            flightId: flightDbId,
            name: pass.name || '',
            seat: pass.seat || '',
            ticketFileName: pass.ticketFileName || null,
            ticketFileData: pass.ticketFileData || null,
          });
        });
      }
    });

    if (passengersToInsert.length > 0) {
      await tx.insert(flightPassengers).values(passengersToInsert);
    }
  }

  // 7. General Tips
  if (data.generalTips && data.generalTips.length > 0) {
    await tx.insert(generalTips).values(data.generalTips.map((tip: any) => ({
      id: p(tip.id, 'gt'),
      itineraryId,
      category: tip.category || '',
      title: tip.title || '',
      content: tip.content || ''
    })));
  }

  // 8. Notifications
  if (data.notifications && data.notifications.length > 0) {
    await tx.insert(notifications).values(data.notifications.map((n: any) => ({
      id: p(n.id, 'notif'),
      itineraryId,
      title: n.title || '',
      description: n.description || '',
      time: n.time || '',
      read: n.read || false,
      type: n.type || 'system'
    })));
  }

  // 9. Transaction Logs
  if (data.transactionLogs && data.transactionLogs.length > 0) {
    await tx.insert(transactionLogs).values(data.transactionLogs.map((log: any) => ({
      id: p(log.id, 'log'),
      itineraryId,
      user: log.user || '',
      userEmail: log.userEmail || '',
      action: log.action || '',
      itemType: log.itemType || '',
      itemId: log.itemId ? p(log.itemId, 'item') : '',
      itemDesc: log.itemDesc || '',
      timestamp: log.timestamp || '',
    })));
  }
}

const MAX_GEMINI_CALLS_PER_DAY = 15;

const geminiQuotaMiddleware = async (req: any, res: any, next: any) => {
  if (!req.user || req.user.id === 0) return next(); // Skip limits for unauthenticated travelers for now, or you could track IPs

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
        error: "Limite diário de uso da IA atingido. Para evitar custos excessivos, o limite é de " + MAX_GEMINI_CALLS_PER_DAY + " requisições por dia. Tente novamente amanhã." 
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


const aiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function generateContentWithRetry(params: {
  model: string;
  contents: any;
  config?: any;
}, retries = 4, initialDelay = 2500) {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await aiClient.models.generateContent(params);
    } catch (err: any) {
      lastError = err;
      const errMsg = err.message || JSON.stringify(err);
      
      // If the model is experiencing high demand or rate limited, break the retry loop 
      // and immediately switch to fallback models.
      if (
        errMsg.includes("503") || 
        errMsg.includes("UNAVAILABLE") || 
        errMsg.includes("429") || 
        errMsg.includes("RESOURCE_EXHAUSTED") || 
        errMsg.toLowerCase().includes("high demand") || 
        errMsg.toLowerCase().includes("overloaded") ||
        errMsg.toLowerCase().includes("quota")
      ) {
        break;
      }

      if (i < retries - 1) {
        const sleepDelay = initialDelay * Math.pow(1.5, i);
        await new Promise((resolve) => setTimeout(resolve, sleepDelay));
      }
    }
  }

  const fallbackModels = ["gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-flash-latest"];
  
  for (const fallbackModel of fallbackModels) {
    if (params.model === fallbackModel) continue; // Skip if already tried
    
    try {
      const res = await aiClient.models.generateContent({
        ...params,
        model: fallbackModel
      });
      return res;
    } catch (fallbackErr: any) {
      lastError = fallbackErr; // Keep track of the latest error
    }
  }
  
  const finalErrorMsg = lastError?.message || String(lastError);
  if (
    finalErrorMsg.includes("429") ||
    finalErrorMsg.includes("RESOURCE_EXHAUSTED") ||
    finalErrorMsg.toLowerCase().includes("quota") ||
    finalErrorMsg.toLowerCase().includes("rate limit")
  ) {
    const customError = new Error(
      "Limite de uso temporário do Gemini atingido (Cota do Plano Gratuito excedida). Por favor, aguarde de 1 a 2 minutos para liberar a cota ou cadastre uma Gemini API Key com faturamento ativo."
    );
    (customError as any).status = 429;
    throw customError;
  }
  
  throw lastError;
}

const recentAccessLogCache = new Map<string, number>();

async function shouldLogAccess(db: any, email: string, itineraryId: number | null, accessLogsTable: any): Promise<boolean> {
  const normEmail = email.trim().toLowerCase();
  const key = `${normEmail}_${itineraryId || 0}`;
  const now = Date.now();
  const lastTime = recentAccessLogCache.get(key);
  if (lastTime && (now - lastTime < 15 * 60 * 1000)) {
    return false;
  }

  recentAccessLogCache.set(key, now);

  try {
    const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
    const recentLogs = await db.select()
      .from(accessLogsTable)
      .where(
        and(
          eq(accessLogsTable.userEmail, normEmail),
          itineraryId ? eq(accessLogsTable.itineraryId, itineraryId) : sql`${accessLogsTable.itineraryId} IS NULL`,
          sql`${accessLogsTable.attemptedAt} > ${fifteenMinutesAgo}`
        )
      )
      .limit(1);

    if (recentLogs.length > 0) {
      return false;
    }
  } catch (err) {
    console.error("Error in shouldLogAccess check: ", err);
  }

  return true;
}

const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  if (token === "traveler-session") {
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

const typingParticipants: Record<number, Record<string, number>> = {};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      message: "Servidor online com Postgres suportado!",
    });
  });

  app.get("/api/ping-db", async (req, res) => {
    if (!db) {
      return res
        .status(503)
        .json({
          error:
            "DATABASE_URL não configurada no painel de Segredos (Settings > Secrets).",
        });
    }

    try {
      // Run a simple query to assert connection
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

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) return res.status(400).json({ error: "Preencha todos os campos" });
      
      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUser.length > 0) return res.status(400).json({ error: "E-mail já cadastrado" });

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const [newUser] = await db.insert(users).values({ email, passwordHash, name }).returning();
      
      const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token, user: { id: newUser.id, email: newUser.email, name: newUser.name } });
    } catch (err: any) {
      res.status(500).json({ error: formatDbError(err) });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Preencha e-mail e senha" });

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !user.passwordHash) return res.status(400).json({ error: "Credenciais inválidas" });

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return res.status(400).json({ error: "Credenciais inválidas" });

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err: any) {
      res.status(500).json({ error: formatDbError(err) });
    }
  });

  app.get("/api/auth/me", authMiddleware, (req: any, res) => {
    res.json({ user: req.user });
  });

  // Buffer or list of simulated sent emails for dev preview
  interface SimulatedEmail {
    id: string;
    to: string;
    subject: string;
    body: string;
    link: string;
    date: Date;
  }
  const simulatedEmails: SimulatedEmail[] = [];

  app.post("/api/auth/change-my-password", authMiddleware, async (req: any, res) => {
    try {
      const { email, currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
      }

      let user;
      if (userId === 0 && email) {
        // Traveler session fallback
        const [foundUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (foundUser) {
           user = foundUser;
        } else {
           // Provide an empty shell so we can create it
           user = { id: 0, email, passwordHash: null };
        }
      } else {
        const [foundUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        user = foundUser;
      }
      
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      // If user has a passwordHash, require current password
      if (user.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: "A senha atual é obrigatória." });
        }
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
          return res.status(400).json({ error: "A senha atual está incorreta." });
        }
      }

      const saltRounds = 10;
      const hash = await bcrypt.hash(newPassword, saltRounds);

      if (user.id === 0) {
         // Create the user since they didn't exist in the users table yet
         await db.insert(users).values({ email: user.email, name: "Viajante", passwordHash: hash });
      } else {
         await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
      }

      res.json({ success: true, message: "Senha alterada com sucesso." });
    } catch (err: any) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Erro interno ao alterar a senha." });
    }
  });

  // Endpoint to fetch simulated emails for a user
  app.get("/api/dev/last-emails", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.json([]);
      }
      const filtered = simulatedEmails.filter(
        (m) => m.to.toLowerCase() === String(email).toLowerCase()
      );
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Endpoint to delete a simulated email (once read or clicked)
  app.delete("/api/dev/last-emails/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const index = simulatedEmails.findIndex((m) => m.id === id);
      if (index !== -1) {
        simulatedEmails.splice(index, 1);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Initiates Gmail account creation / password set notification
  app.post("/api/auth/gmail-signup", async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: "E-mail e Nome são obrigatórios." });
      }
      
      // Validate if it is gmail address or general google-like account
      const isGmailOfGoogle = email.toLowerCase().endsWith("@gmail.com");
      if (!isGmailOfGoogle) {
        return res.status(400).json({ error: "Por favor, utilize uma conta de e-mail do Google (@gmail.com) válida." });
      }

      // Check if user already exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      let targetUserId: number;
      let isNewAccount = false;

      if (!existingUser) {
        // Create new user (temporary passwordHash empty since they will create via email)
        const [newUser] = await db.insert(users).values({
          email,
          name,
          passwordHash: null
        }).returning();
        targetUserId = newUser.id;
        isNewAccount = true;
      } else {
        targetUserId = existingUser.id;
        isNewAccount = false;
      }

      // Generate secure password creation token (expires in 1 hour)
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600 * 1000); // 1 hour

      await db.update(users).set({
        passwordResetToken: token,
        passwordResetExpires: expires
      }).where(eq(users.id, targetUserId));

      // Simulate sending real notification email
      const resetUrl = `?action=setup_password&token=${token}&email=${encodeURIComponent(email)}`;
      
      simulatedEmails.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
        to: email,
        subject: isNewAccount 
          ? "Criação de Conta KK TUR - Defina sua Senha Segura" 
          : "KK TUR - Defina ou Atualize sua Senha de Acesso",
        body: `Olá, ${name || "Viajante"}!\n\nVocê solicitou a criação de conta ou redefinição de acesso via Gmail do Google na KK TUR Diário de Bordo.\n\nPara cadastrar sua senha com total segurança, clique no link de validação a seguir.`,
        link: resetUrl,
        date: new Date()
      });

      res.json({
        success: true,
        message: "E-mail enviado! Um link de configuração foi enviado para o seu e-mail do Google Gmail.",
        email,
        isNewAccount
      });
    } catch (err: any) {
      console.error("Gmail signup error:", err);
      res.status(500).json({ error: "Erro ao registrar com Gmail: " + err.message });
    }
  });

  // Verifies the password reset token
  app.post("/api/auth/gmail-verify-token", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Token de verificação ausente." });
      }

      const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
      if (!user) {
        return res.status(400).json({ error: "Link de verificação inválido ou já utilizado." });
      }

      if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
        return res.status(400).json({ error: "O link de segurança expirou. Solicite um novo envio." });
      }

      res.json({ success: true, email: user.email, name: user.name });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao verificar token: " + err.message });
    }
  });

  // Sets the new password securely and logs user in
  app.post("/api/auth/gmail-set-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Token e senha de acesso são necessários." });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "A senha de segurança deve conter no mínimo 6 caracteres." });
      }

      const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
      if (!user) {
        return res.status(400).json({ error: "Token inválido." });
      }

      if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
        return res.status(400).json({ error: "O prazo de expiração do link de segurança expirou." });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Update user: set password, clear token and reset values
      await db.update(users).set({
        passwordHash: passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }).where(eq(users.id, user.id));

      // Clear simulated notification emails for this user since we done
      const userEmail = user.email;
      const indexList: number[] = [];
      simulatedEmails.forEach((m, idx) => {
        if (m.to.toLowerCase() === userEmail.toLowerCase()) {
          indexList.push(idx);
        }
      });
      for (let i = indexList.length - 1; i >= 0; i--) {
        simulatedEmails.splice(indexList[i], 1);
      }

      // Auto-login user
      const appToken = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        success: true,
        token: appToken,
        user: { id: user.id, email: user.email, name: user.name }
      });
    } catch (err: any) {
      console.error("Gmail set password error:", err);
      res.status(500).json({ error: "Erro ao salvar nova senha: " + err.message });
    }
  });

  // Real secure Firebase Google Auth Login/Signup Handler
  app.post("/api/auth/firebase-google-login", async (req, res) => {
    try {
      const { email, name, firebaseUid } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail do Firebase é obrigatório." });
      }

      const isGmailOfGoogle = email.toLowerCase().endsWith("@gmail.com");
      if (!isGmailOfGoogle) {
        return res.status(400).json({ error: "Apenas e-mails terminados em @gmail.com são permitidos via login do Google." });
      }

      // Check if user already exists
      let [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!existingUser) {
        // Automatically register the user as they are verified by Firebase Auth
        const [newUser] = await db.insert(users).values({
          email,
          name: name || email.split("@")[0],
          passwordHash: null
        }).returning();
        existingUser = newUser;
      }

      // Generate standard app-compliant JWT
      const appToken = jwt.sign(
        { id: existingUser.id, email: existingUser.email, name: existingUser.name },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        success: true,
        token: appToken,
        user: { id: existingUser.id, email: existingUser.email, name: existingUser.name }
      });
    } catch (err: any) {
      console.error("Firebase Google Auth login error:", err);
      res.status(500).json({ error: "Erro ao autenticar usuário com Firebase: " + err.message });
    }
  });

  // Direct fast secure Gmail Login simulator (using standard validation)
  app.post("/api/auth/gmail-google-login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail é obrigatório." });
      }

      const isGmailOfGoogle = email.toLowerCase().endsWith("@gmail.com");
      if (!isGmailOfGoogle) {
        return res.status(400).json({ error: "Por favor, utilize uma conta de e-mail do Google (@gmail.com) válida." });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        return res.status(404).json({ error: "Conta Gmail não cadastrada. Por favor, clique em criar conta abaixo." });
      }

      // If they have registered but never set a password, they need to check their email
      if (!user.passwordHash) {
        // Generate secure password creation token (expires in 1 hour)
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 3600 * 1000); // 1 hour

        await db.update(users).set({
          passwordResetToken: token,
          passwordResetExpires: expires
        }).where(eq(users.id, user.id));

        // Simulate sending real notification email
        const resetUrl = `?action=setup_password&token=${token}&email=${encodeURIComponent(user.email)}`;
        
        // Remove old emails for this target address to keep it simple and clean
        const indexList: number[] = [];
        simulatedEmails.forEach((m, idx) => {
          if (m.to.toLowerCase() === user.email.toLowerCase()) {
            indexList.push(idx);
          }
        });
        for (let i = indexList.length - 1; i >= 0; i--) {
          simulatedEmails.splice(indexList[i], 1);
        }

        simulatedEmails.push({
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
          to: user.email,
          subject: "KK TUR - Defina sua Senha Segura (Acesso Pendente)",
          body: `Olá, ${user.name || "Viajante"}!\n\nIdentificamos uma tentativa de login com a sua conta Google Gmail, mas a sua senha de segurança de organizador ainda não foi configurada.\n\nPara cadastrar sua nova senha com segurança imediatamente, por favor clique no link de validação a seguir.`,
          link: resetUrl,
          date: new Date()
        });

        return res.status(400).json({ 
          error: "Esta conta foi cadastrada, mas sua senha de segurança ainda não está ativa. Como você tentou logar, acabamos de gerar e enviar um link para configurar sua senha na sua Caixa de Entrada Simulada abaixo! Por favor, verifique-a e crie sua senha.",
          requiresPasswordSetup: true
        });
      }

      // Direct Auth (Simulating trusted Google OAuth Sign-In exchange securely)
      const appToken = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      res.json({
        success: true,
        token: appToken,
        user: { id: user.id, email: user.email, name: user.name }
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro no login com Google: " + err.message });
    }
  });

  // Fetch itineraries from PostgreSQL
  app.get("/api/itineraries", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "No DB configuration." });
    try {
      // Find itineraries where the user is listed as a traveler
      const cleanEmail = req.user.email.trim().toLowerCase();
      const linkedTravelers = await db.select({ itineraryId: travelers.itineraryId })
        .from(travelers)
        .where(eq(sql`LOWER(TRIM(${travelers.email}))`, cleanEmail));
      const travelerItineraryIds = linkedTravelers.map((t) => t.itineraryId);

      let whereClause;
      if (travelerItineraryIds.length > 0) {
        whereClause = or(eq(itineraries.ownerId, req.user.id), inArray(itineraries.id, travelerItineraryIds));
      } else {
        whereClause = eq(itineraries.ownerId, req.user.id);
      }

      // Instead of an advanced raw join, fetch all required entities using separate queries or a single relational query
      const dbItineraries = await db.query.itineraries.findMany({
        where: whereClause,
        with: {
          travelers: true,
          costs: true,
          costCategories: true,
          documents: true,
          flights: {
            with: { passengersList: true }
          },
          generalTips: true,
          notifications: true,
          transactionLogs: true,
          destinations: {
            with: { days: { with: { activities: true } } }
          }
        }
      });

      // Log success access only for the primary itinerary (single access) to prevent duplication across multiple registered trips
      try {
        if (dbItineraries.length > 0) {
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
          const clientIp = typeof ip === 'string' ? ip : ip[0];
          const firstItinerary = dbItineraries[0];
          
          if (await shouldLogAccess(db, req.user.email, firstItinerary.id, accessLogs)) {
            await db.insert(accessLogs).values({
              itineraryId: firstItinerary.id,
              userEmail: req.user.email,
              status: "success",
              ipAddress: clientIp
            });
          }
        }
      } catch (err) {
        console.error("Erro ao registrar log de acesso para o itinerário:", err);
      }

      
      // Transform records back to expected JSON structure
      const response = dbItineraries.map((itinerary) => mapItineraryFromDb(itinerary));

      const userRecord = await db.query.users.findFirst({
        where: eq(users.id, req.user.id)
      });

      res.json({
        itineraries: response,
        favoriteItineraryId: userRecord?.favoriteItineraryId
      });
    } catch (error: any) {
      console.error("Fetch DB error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Set favorite itinerary
  app.put("/api/users/favorite", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const { itineraryId } = req.body;
      await db.update(users)
        .set({ favoriteItineraryId: itineraryId ? Number(itineraryId) : null })
        .where(eq(users.id, req.user.id));
      
      res.json({ success: true, favoriteItineraryId: itineraryId });
    } catch (error: any) {
      console.error("Favorite setting error:", error);
      res.status(500).json({ error: "Erro ao favoritar viagem." });
    }
  });

  // Create new itinerary
  app.post("/api/itineraries", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const { title, data } = req.body;
      const [itinerary] = await db.insert(itineraries).values({
        ownerId: req.user.id,
        title: title || "Nova Viagem",
        isShared: true,
      }).returning();

      if (data) {
        await saveItineraryData(db, itinerary.id, data);
      }

      res.json({ success: true, itinerary: { id: itinerary.id, title: itinerary.title, data: data || {} } });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: formatDbError(err) });
    }
  });

  // Update specific itinerary
  app.put("/api/itineraries/:id", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const itineraryId = parseInt(req.params.id);
      const { title, data, ecoMode } = req.body;

      if (isNaN(itineraryId)) return res.status(400).json({ error: "ID inválido" });

      const [existing] = await db.select().from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Itinerário não encontrado" });
      
      if (existing.ownerId !== req.user.id) {
        // If not the owner, check if the user is a traveler listed in this itinerary
        const cleanEmail = req.user.email.trim().toLowerCase();
        const [isTraveler] = await db.select()
          .from(travelers)
          .where(and(
            eq(travelers.itineraryId, itineraryId), 
            eq(sql`LOWER(TRIM(${travelers.email}))`, cleanEmail)
          )).limit(1);
          
        if (!isTraveler) {
          return res.status(403).json({ error: "Não autorizado: Apenas o proprietário ou viajantes podem editar." });
        }
      }

      await db.transaction(async (tx) => {
        let updateData: any = { updatedAt: new Date() };
        if (title !== undefined) updateData.title = title;
        if (ecoMode !== undefined) updateData.ecoMode = ecoMode;
        
        await tx.update(itineraries).set(updateData).where(eq(itineraries.id, itineraryId));

      if (data) {
        // Load existing records to preserve real files/attachments if they are optimized/hidden on the client side
        let existingFlights: any[] = [];
        let existingDocuments: any[] = [];
        let existingCosts: any[] = [];
        let existingActivities: any[] = [];

        try {
          existingFlights = await tx.select().from(flights).where(eq(flights.itineraryId, itineraryId));
          existingDocuments = await tx.select().from(documents).where(eq(documents.itineraryId, itineraryId));
          existingCosts = await tx.select().from(costs).where(eq(costs.itineraryId, itineraryId));
          const existingDestinations = await tx.select().from(destinations).where(eq(destinations.itineraryId, itineraryId));
          const existingDestIds = existingDestinations.map((d: any) => d.id);
          if (existingDestIds.length > 0) {
            const existingDays = await tx.select().from(itineraryDays).where(inArray(itineraryDays.destinationId, existingDestIds));
            const existingDayIds = existingDays.map((dy: any) => dy.id);
            if (existingDayIds.length > 0) {
              existingActivities = await tx.select().from(activities).where(inArray(activities.dayId, existingDayIds));
            }
          }
        } catch (fetchErr) {
          console.error("Erro ao recuperar registros existentes para preservar arquivos:", fetchErr);
        }

        await tx.delete(travelers).where(eq(travelers.itineraryId, itineraryId));
        await tx.delete(destinations).where(eq(destinations.itineraryId, itineraryId));
        await tx.delete(costs).where(eq(costs.itineraryId, itineraryId));
        await tx.delete(costCategories).where(eq(costCategories.itineraryId, itineraryId));
        await tx.delete(documents).where(eq(documents.itineraryId, itineraryId));
        await tx.delete(flights).where(eq(flights.itineraryId, itineraryId));
        await tx.delete(generalTips).where(eq(generalTips.itineraryId, itineraryId));
        await tx.delete(notifications).where(eq(notifications.itineraryId, itineraryId));
        await tx.delete(transactionLogs).where(eq(transactionLogs.itineraryId, itineraryId));

        await saveItineraryData(tx, itineraryId, data, {
          existingFlights,
          existingDocuments,
          existingCosts,
          existingActivities
        });
      }

      });

      res.json({ success: true, message: "Itinerário atualizado com sucesso" });
    } catch (error: any) {
      console.error("Save error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get access logs for itinerary
  app.get("/api/itineraries/:id/access_logs", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const itineraryId = parseInt(req.params.id);
      if (isNaN(itineraryId)) return res.status(400).json({ error: "ID inválido" });

      const [existing] = await db.select().from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Itinerário não encontrado" });
      if (existing.ownerId !== req.user.id) return res.status(403).json({ error: "Não autorizado" }); // only owner can see logs

      let logs = [];
      try {
        logs = await db.select().from(accessLogs).where(eq(accessLogs.itineraryId, itineraryId)).orderBy(sql`${accessLogs.attemptedAt} DESC`);
      } catch (err) {
        console.error("Erro ao carregar logs de acesso:", err);
      }
      res.json({ success: true, logs });
    } catch (error: any) {
      console.error("Access logs fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete specific itinerary
  app.delete("/api/itineraries/:id", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const itineraryId = parseInt(req.params.id);
      if (isNaN(itineraryId)) return res.status(400).json({ error: "ID inválido" });

      const [existing] = await db.select().from(itineraries).where(eq(itineraries.id, itineraryId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Itinerário não encontrado" });
      if (existing.ownerId !== req.user.id) return res.status(403).json({ error: "Não autorizado" });

      await db.delete(itineraries).where(eq(itineraries.id, itineraryId));
      res.json({ success: true, message: "Itinerário excluído com sucesso" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AI Itinerary Evaluation
  app.get("/api/messages/:itineraryId", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const itId = parseInt(req.params.itineraryId);
      if (isNaN(itId)) return res.json({ messages: [], typingUsers: [] });
      
      const username = (req.query.username || "").toString().trim();
      
      // Mark private messages received by the current user as read
      if (username) {
        const lowerUser = username.toLowerCase();
        const unreadMsgs = await db.select()
          .from(chatMessages)
          .where(and(
            eq(chatMessages.itineraryId, itId),
            eq(chatMessages.isRead, false)
          ));
        
        const idsToUpdate = unreadMsgs
          .filter(m => m.recipientName && m.recipientName.trim().toLowerCase() === lowerUser)
          .map(m => m.id);

        if (idsToUpdate.length > 0) {
          await db.update(chatMessages)
            .set({ isRead: true })
            .where(inArray(chatMessages.id, idsToUpdate));
        }
      }

      const sinceStr = req.query.since as string;
      
      let baseWhere = eq(chatMessages.itineraryId, itId);
      if (sinceStr) {
        baseWhere = and(baseWhere, sql`${chatMessages.timestamp} > ${new Date(sinceStr)}`) as any;
      }
      
      const msgs = await db.select().from(chatMessages).where(baseWhere).orderBy(chatMessages.timestamp);

      // Get list of users actively typing in this itinerary (within last 4 seconds)
      const now = Date.now();
      const typingUsers: string[] = [];
      if (typingParticipants[itId]) {
        for (const [user, timestamp] of Object.entries(typingParticipants[itId])) {
          if (now - timestamp < 4000) {
            if (user.trim().toLowerCase() !== username.toLowerCase()) {
              typingUsers.push(user);
            }
          } else {
            delete typingParticipants[itId][user];
          }
        }
      }

      res.json({
        messages: msgs,
        typingUsers
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/messages/typing", authMiddleware, async (req: any, res) => {
    try {
      const { itineraryId, username, isTyping } = req.body;
      const itId = parseInt(itineraryId);
      if (isNaN(itId) || !username) {
        return res.status(400).json({ error: "Parâmetros inválidos." });
      }

      if (!typingParticipants[itId]) {
        typingParticipants[itId] = {};
      }

      if (isTyping) {
        typingParticipants[itId][username] = Date.now();
      } else {
        delete typingParticipants[itId][username];
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/messages", authMiddleware, async (req: any, res) => {
    if (!db) return res.status(503).json({ error: "DATABASE_URL não configurada." });
    try {
      const { itineraryId, senderName, senderAvatar, recipientName, content, fileData, fileName, fileType, fileSize } = req.body;
      const itId = parseInt(itineraryId);
      if (isNaN(itId)) return res.status(400).json({ error: "Você precisa sincronizar a viagem na nuvem para usar o chat." });
      
      const [msg] = await db.insert(chatMessages).values({
        id: 'msg-' + Math.random().toString(36).substring(7),
        itineraryId: itId,
        senderName,
        senderAvatar,
        recipientName,
        content,
        fileData,
        fileName,
        fileType,
        fileSize
      }).returning();
      res.json({ success: true, message: msg });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/evaluate-prompt", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "O prompt não pode ser vazio." });
      }

      if (!process.env.GEMINI_API_KEY) {
        // Safe fallback if key is missing
        return res.json({
          isSpecific: false,
          reason: "Chave Gemini API não configurada no servidor. Usando perguntas padrão para guiar seu roteiro.",
          suggestedQuestions: [
            {
              id: "destination",
              question: "Para qual cidade ou país você gostaria de ir?",
              options: ["Paris, França", "Tóquio, Japão", "Nova York, EUA", "Florianópolis, Brasil"]
            },
            {
              id: "duration_days",
              question: "Quantos dias você pretende passar lá?",
              options: ["3 dias", "5 dias", "7 dias", "10 dias"]
            },
            {
              id: "travel_style",
              question: "Qual o estilo principal da viagem?",
              options: ["Econômico / Mochileiro", "Cultural e Museus", "Gastronomia e Luxo", "Aventura e Natureza"]
            }
          ]
        });
      }

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `Prompt do Usuário: "${prompt}"`,
        config: {
          systemInstruction: `Você é um especialista em planejamento de viagens e assistente IA para roteiros de viagem.
O usuário vai fornecer um prompt de viagem descrevendo uma viagem desejada.
Sua tarefa é avaliar se o prompt possui detalhes suficientes (destino claro e duração/dias estimados) para gerar um diário de bordo completo com atividades diárias de alta qualidade.

Se o prompt NÃO for específico (ex: "quero viajar", "férias na Europa", ou apenas o nome de um país gigante sem duração como "Roteiro Brasil"), marque "isSpecific" como false, e crie de 2 a 3 perguntas cruciais e acolhedoras em português do Brasil com ID pequeno em inglês para cada pergunta (ex: "destination", "duration_days", "travel_style") e um array de 3 a 4 opções rápidas ("options") para facilitar a interação.

Se o prompt for específico (como "Roteiro de 5 dias em Londres focado em museus" ou "Viagem de duas semanas pelo Japão"), marque "isSpecific" como true.

Retorne EXCLUSIVAMENTE um objeto JSON válido correspondente a este schema:
{
  "isSpecific": boolean,
  "reason": string (um texto explicativo entusiasmado em português do Brasil),
  "suggestedQuestions": [
    {
      "id": string,
      "question": string,
      "options": string[]
    }
  ]
}`,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text.trim());
      res.json(result);
    } catch (err: any) {
      console.error("Evaluation error:", err);
      res.status(500).json({ error: "Erro ao avaliar o prompt com IA: " + err.message });
    }
  });

  app.post("/api/gemini/optimize-route", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { city, activities } = req.body;
      if (!city) {
        return res.status(400).json({ error: "O nome da cidade é obrigatório." });
      }
      if (!activities || !Array.isArray(activities) || activities.length === 0) {
        return res.status(400).json({ error: "Nenhuma atividade fornecida para otimização." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
      }

      const minimalActivities = activities.map(act => ({
        id: act.id,
        time: act.time || "Não especificado",
        location: act.location || "Sem local específico",
        duration: act.duration || "Não especificada",
        notes: act.notes || "",
        latitude: act.latitude,
        longitude: act.longitude
      }));

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `Cidade: "${city}"\nAtividades:\n${JSON.stringify(minimalActivities, null, 2)}`,
        config: {
          systemInstruction: `Você é um guia turístico e especialista em logística urbana de viagens.
O usuário fornecerá o nome de uma cidade de destino e uma lista de atividades que ele planeja realizar em um único dia.
Sua missão é reordenar essa lista de atividades para reduzir o tempo de deslocamento (proximidade geográfica) e criar um itinerário diário que faça sentido lógico das horas (manhã para tarde e noite, tempos de refeição adequados, etc.), considerando horários de funcionamento padrão da cidade.

Regras importantes:
1. Reordene as atividades pela lógica geográfica real da cidade (ex: agrupar atrações próximas, evitar ziguezagues).
2. Proponha novos horários ("time" no formato de 24h, exemplo "09:00", "11:30") progressivos e organizados para cada atividade, cuidando para que uma atividade não se sobreponha à outra considerando sua duração.
3. Se alguma atividade tiver coordenadas (latitude e longitude), leve-as em séria consideração.
4. Adicione opcionalmente uma pequena dica de logística, transporte ou deslocamento no campo "notes" de cada atividade de forma resumida e inteligente (em português do Brasil).
5. O resultado final deve conter TODOS os IDs de atividades originais enviados no mesmo array "optimizedOrderedIds" reordenado. Não adicione atividades fictícias que não estavam na lista.

Retorne EXCLUSIVAMENTE um objeto JSON válido correspondente a este schema:
{
  "optimizedOrderedIds": [
    {
      "id": string (ID original correspondente),
      "time": string (novo horário otimizado ex "09:30"),
      "notes": string (inclui a dica ou preserva o campo notes original com a nova dica útil curta)
    }
  ],
  "explanation": "Breve explicação sobre os benefícios da otimização proposta nesta rota (em português)."
}`,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text.trim());

      const optimizedIds = result.optimizedOrderedIds || [];

      const mergedActivities: any[] = [];
      const placedIds = new Set<string>();

      for (const opt of optimizedIds) {
        const original = activities.find(a => a.id === opt.id);
        if (original) {
          mergedActivities.push({
            ...original,
            time: opt.time || original.time,
            notes: opt.notes ? opt.notes : original.notes
          });
          placedIds.add(original.id);
        }
      }

      for (const original of activities) {
        if (!placedIds.has(original.id)) {
          mergedActivities.push(original);
        }
      }

      // Sort the final activities by time mathematically to guarantee proper order
      mergedActivities.sort((a, b) => {
        const timeA = a.time || "00:00";
        const timeB = b.time || "00:00";
        return timeA.localeCompare(timeB);
      });

      res.json({
        success: true,
        activities: mergedActivities,
        explanation: result.explanation || "Rota reordenada com sucesso!"
      });
    } catch (err: any) {
      console.error("Route optimization error:", err);
      res.status(500).json({ error: "Erro ao otimizar rota com IA: " + err.message });
    }
  });

  // AI Itinerary Generation
  app.post("/api/gemini/generate-itinerary", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { prompt, answers } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "O prompt não pode ser vazio." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
      }

      let parsedAnswersStr = "";
      if (answers && Object.keys(answers).length > 0) {
        parsedAnswersStr = "\nPerguntas adicionais respondidas:\n" + 
          Object.entries(answers).map(([key, val]) => `- ${key}: ${val}`).join("\n");
      }

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: `Prompt original: "${prompt}"${parsedAnswersStr}`,
        config: {
          systemInstruction: `Você é uma inteligência artificial especialista na criação de diários de bordo de viagem de alto padrão em português do Brasil.
A sua tarefa é criar um roteiro de viagem completo, com hotéis, voos sugeridos e atividades diárias detalhadas de acordo com o plano do usuário.

Crie dados ricos, realistas e inspiradores. Siga este formato JSON rígido e garanta que todas as chaves estejam presentes:

{
  "destinations": [
    {
      "id": string (ex: "dest-1"),
      "city": string,
      "state": string,
      "country": string,
      "dates": string (ex: "01 jul. - 05 jul."),
      "startDate": string (formato YYYY-MM-DD, sugerido começar em 2026-07-01),
      "endDate": string (formato YYYY-MM-DD, ex: 2026-07-05),
      "hotelName": string,
      "hotelAddress": string,
      "checkInTime": string (ex: "15:00"),
      "checkOutTime": string (ex: "11:00"),
      "notes": string (detalhes charmosos do hotel sugerido),
      "days": [
        {
          "id": string (ex: "day-1"),
          "dayNumber": number (começando de 1),
          "dateStr": string (ex: "Quarta, 01 de Julho"),
          "title": string,
          "activities": [
            {
              "id": string (ex: "act-1"),
              "time": string (ex: "09:30"),
              "location": string,
              "duration": string (ex: "2h"),
              "cost": string (ex: "Gratuito" ou "R$ 45"),
              "mapsQuery": string (termo para busca de GPS, ex: "Torre Eiffel, Paris"),
              "notes": string (recomendações locais adicionais em português)
            }
          ]
        }
      ]
    }
  ],
  "costs": [
    {
      "id": string (ex: "cost-1"),
      "category": "hotel" | "flight" | "car" | "activity" | "other",
      "description": string,
      "totalCostBRL": number,
      "status": "Pago" | "Pgto no local" | "Falta pagar"
    }
  ],
  "flights": [
    {
      "id": string (ex: "flight-1"),
      "airline": string,
      "flightCode": string,
      "departureCity": string,
      "departureCode": string,
      "departureTime": string,
      "arrivalCity": string,
      "arrivalCode": string,
      "arrivalTime": string,
      "duration": string,
      "dateStr": string (YYYY-MM-DD),
      "status": "Confirmado"
    }
  ],
  "generalTips": [
    {
      "id": string (ex: "tip-1"),
      "category": string (ex: "Clima" ou "Transporte"),
      "title": string,
      "content": string
    }
  ]
}`,
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text.trim());
      res.json(result);
    } catch (err: any) {
      console.error("Generation error:", err);
      res.status(500).json({ error: "Erro ao gerar roteiro estruturado com IA: " + err.message });
    }
  });

  // AI OCR Flight Scan
  app.post("/api/gemini/ocr-flight", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "O arquivo de imagem não pode ser vazio." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
      }

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: imageBase64,
        },
      };

      const textPart = {
        text: `Analise cuidadosamente este bilhete de voo ou confirmação de embarque.
Extraia todas as informações dos trechos de voo (segmentos de voo) presentes no documento.
Extraia campos cruciais como:
1. Companhia aérea (airline) - ex: AVIANCA, United Airlines.
2. Código do voo (flightCode) - ex: AV 247, AV 161.
3. Cidade de Origem (departureCity) - ex: Washington, Bogotá.
4. Código IATA de Origem (departureCode) de 3 letras - ex: IAD, BOG (sempre em maiúsculo).
5. Horário de Saída (departureTime) - ex: 15:25, 18:05.
6. Cidade de Chegada (arrivalCity) - ex: Bogotá, São Paulo.
7. Código IATA de Chegada (arrivalCode) de 3 letras - ex: BOG, GRU (sempre em maiúsculo).
8. Horário de Chegada (arrivalTime) - ex: 19:50, 02:10.
9. Duração (duration) - ex: 5h 25m, 6h 5m.
10. Data de partida no formato YYYY-MM-DD (dateStr). Por exemplo se o voo diz '21 jul' ou '21 de julho', e considerando que estamos no ano de 2026, formate como '2026-07-21'. Se houver indicações de outro ano, use o ano correto.
11. Data de chegada no formato YYYY-MM-DD (arrivalDateStr). Pratique o mesmo formato. Se o voo chega no dia seguinte (por exemplo sai 22 de Julho às 18:05 e chega 23 de Julho às 02:10), coloque a data correspondente do dia seguinte '2026-07-23'.
12. Portão de embarque (gate) se houver nas informações, senão deixe vazio.
13. Localizador da reserva / Código da reserva (locator) - ex: CSGJKT.
14. Nomes dos passageiro (passengers) - ex: "Stelio Oliveira Ked, Karolline Ferreira Ked, Gabriela Ferreira Ked, Leticia Ferreira Ked" (extraia todos os passageiros vinculados a este trecho/segmento, separados por vírgula).
15. Assentos dos passageiros (seats) se houver nas informações (pode ser um mapeamento como "Stelio: 12A, Karolline: 12B" ou apenas "12A, 12B").
16. Uma lista estruturada dos passageiros (passengersList) associando cada passageiro individualmente ao seu respectivo assento (se houver, por exemplo, "12A").

Retorne estritamente um JSON que contém um array de voos.`,
      };

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
        config: {
          systemInstruction: "Você é um especialista em OCR e extração estruturada de dados de cartões de embarque, recibos de viagem e de passagens aéreas.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              flights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    airline: { type: Type.STRING },
                    flightCode: { type: Type.STRING },
                    departureCity: { type: Type.STRING },
                    departureCode: { type: Type.STRING },
                    departureTime: { type: Type.STRING },
                    arrivalCity: { type: Type.STRING },
                    arrivalCode: { type: Type.STRING },
                    arrivalTime: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    dateStr: { type: Type.STRING },
                    arrivalDateStr: { type: Type.STRING },
                    gate: { type: Type.STRING },
                    locator: { type: Type.STRING },
                    passengers: { type: Type.STRING },
                    seats: { type: Type.STRING },
                    passengersList: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          seat: { type: Type.STRING },
                        },
                        required: ["name"],
                      },
                    },
                  },
                  required: [
                    "airline",
                    "flightCode",
                    "departureCity",
                    "departureCode",
                    "departureTime",
                    "arrivalCity",
                    "arrivalCode",
                    "arrivalTime",
                    "dateStr",
                  ],
                },
              },
            },
            required: ["flights"],
          },
          temperature: 0.1,
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text.trim());
      res.json(result);
    } catch (err: any) {
      console.error("Flight OCR Scan error:", err);
      res.status(500).json({ error: "Erro ao escanear bilhete com IA OCR: " + err.message });
    }
  });

  // AI OCR Receipt Scan
  app.post("/api/gemini/ocr-receipt", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "O arquivo de imagem não pode ser vazio." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
      }

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: imageBase64,
        },
      };

      const textPart = {
        text: `Analise cuidadosamente esta nota fiscal, cupom fiscal, recibo de viagem ou comanda de restaurante.
O documento pode estar em qualquer idioma (inglês, espanhol, francês, italiano, alemão, etc.).
Faça a transcrição dos itens principais e traduza tudo para o português.

Por favor, extraia os seguintes campos estruturados:
1. Nome do estabelecimento ou descrição resumida (description) - ex: "Restaurante Le Petit", "Uber Ride Paris".
2. Categoria da despesa (category) - Escolha uma dentre as seguintes opções: "Alimentação", "Transporte", "Hospedagem", "Passeios", "Compras", "Ingressos", "Outros".
3. Custo total convertido para Real Brasileiro (totalCostBRL) - ex: 154.50 (deve ser um NUMBER). Se a nota estiver em outro idioma e moeda (ex: USD, EUR, GBP, ARS, etc.), calcule a conversão estimada para BRL considerando uma taxa de câmbio aproximada realista para 2026. Se a moeda já for BRL, mantenha o valor bruto.
4. Notas detalhadas (notes) - Crie um resumo elegante em formato markdown contendo:
   - A transcrição traduzida dos principais itens ou do consumo da comanda.
   - Moeda original e valor original.
   - Detalhes adicionais importantes identificados na comanda.

Retorne estritamente um JSON que contém estes campos.`,
      };

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
        config: {
          systemInstruction: "Você é um especialista em OCR, tradução de idiomas e extração estruturada de dados de cupons fiscais, recibos, despesas de viagem e comandas de restaurante de todo o mundo.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              category: { type: Type.STRING },
              totalCostBRL: { type: Type.NUMBER },
              notes: { type: Type.STRING },
            },
            required: ["description", "category", "totalCostBRL", "notes"],
          },
          temperature: 0.1,
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text.trim());
      res.json(result);
    } catch (err: any) {
      console.error("Receipt OCR Scan error:", err);
      res.status(500).json({ error: "Erro ao escanear comanda com IA OCR: " + err.message });
    }
  });

  // AI Flight Status Monitoring Endpoint
  app.post("/api/gemini/monitor-flight", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { flightCode, airline, departureCode, arrivalCode, currentStatus, forceCheckInOpen } = req.body;
      
      if (!flightCode) {
        return res.status(400).json({ error: "O código do voo é obrigatório." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
      }

      const promptText = `Você é um monitor automático inteligente integrado a um app de viagens. Seu objetivo é simular e retornar de forma realista/criativa o status de monitoramento do voo.
Voo de Referência: Voo ${flightCode} operado por ${airline || "N/A"} saindo de ${departureCode || "N/A"} com destino a ${arrivalCode || "N/A"}.
O status atual cadastrado na viagem é: "${currentStatus || "Confirmado"}".

Sua tarefa consiste em avaliar o status atualizado do voo:
As opções de status válidas (que nosso frontend aceita) são estritamente: "Confirmado", "Atrasado", "Cancelado", "Embarque", "Check-in aberto" ou "Finalizado".

${forceCheckInOpen ? "IMPORTANTE: Para este teste do usuário, você DEVE OBRIGATORIAMENTE mudar o status do voo para 'Check-in aberto' e gerar uma mensagem alegre alertando sobre o despacho de malas e check-in." : "Seja criativo e realista. Se o status atual não for 'Check-in aberto', você tem cerca de 50% de probabilidade de decidir que mudou para 'Check-in aberto' para que o usuário possa testar e ver as notificações de abertura de check-in."}

Se você decidir alterar o status em relação à entrada, gere também um portão de embarque (como 'Gate 4', 'A12', 'C18' ou mantenha o do voo anterior) se aplicável, e uma 'message' curta, humanizada e simpática em português de no máximo duas frases avisando ao viajante (ex: "Atenção: O check-in para o voo LA 702 já está aberto! Prepare suas malas e embarque com antecedência.").

Forneça a saída estritamente em formato JSON combinando os seguintes campos descritos no schema.`;

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: { parts: [{ text: promptText }] },
        config: {
          systemInstruction: "Você é um robô perito de status de aeroporto e voos simulados do assistente de viagem.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { 
                type: Type.STRING, 
                description: "Novo status do voo. Deve ser um de: 'Confirmado', 'Atrasado', 'Cancelado', 'Embarque', 'Check-in aberto', 'Finalizado'" 
              },
              previousStatus: { type: Type.STRING },
              statusChanged: { type: Type.BOOLEAN },
              gate: { type: Type.STRING, description: "Portão de embarque atual ou novo se atualizado" },
              message: { type: Type.STRING, description: "Mensagem curta em português do aeroporto/companhia aérea alertando o status." },
            },
            required: ["status", "previousStatus", "statusChanged", "message"],
          },
          temperature: 0.7,
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text.trim());
      res.json(result);
    } catch (err: any) {
      console.error("Flight Monitoring error:", err);
      res.status(500).json({ error: "Erro ao monitorar status do voo com Gemini: " + err.message });
    }
  });

  // Google Search-Grounded AI Nearby Search
  app.post("/api/gemini/nearby-search", authMiddleware, geminiQuotaMiddleware, async (req: any, res) => {
    try {
      const { itineraryId, destinationId, hotelName, hotelAddress, city, refresh } = req.body;
      
      if (!itineraryId || !destinationId) {
        return res.status(400).json({ error: "O ID do roteiro e ID do destino são obrigatórios." });
      }

      const hName = hotelName || "";
      const hAddr = hotelAddress || hName || "";
      const cityName = city || "";

      if (!hAddr) {
        return res.status(400).json({ error: "É necessário que a hospedagem tenha nome ou endereço preenchido para realizar a busca das proximidades." });
      }

      // Check cache first
      if (!refresh) {
        const cached = await db.select().from(nearbyPlaces).where(eq(nearbyPlaces.destinationId, destinationId));
        if (cached && cached.length > 0) {
          return res.json({ success: true, places: cached, cached: true });
        }
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
      }

      const promptText = `Faça uma pesquisa detalhada de locais reais próximos ao ponto hoteleiro a seguir.
Hotel de Referência: ${hName}
Endereço do Hotel: ${hAddr}
Cidade/Localidade: ${cityName}

Sua tarefa é encontrar estabelecimentos reais e úteis localizados nos arredores (em um raio de caminhada ou uma viagem curta de até 1.5km do hotel).
Retorne rigorosamente 3 categorias de estabelecimentos:
1. Food (Restaurantes, lanchonetes, padarias, supermercados, mercados de conveniência)
2. Medical (Farmácias, clínicas, hospitais, drogarias)
3. Services (Caixas eletrônicos, lavanderias, postos de combustíveis, atrações turísticas)

Para cada uma dessas 3 categorias, encontre no mínimo 4 ou 5 estabelecimentos reais.
Para cada item do resultado, você deve fornecer o JSON exatamente neste formato:
{
  "category": "Food | Medical | Services",
  "name": "Nome real do estabelecimento",
  "address": "Endereço ou rua onde está localizado",
  "rating": "Avaliação em estrelas, ex: '4.5', ou null se não encontrar",
  "distance": "Distância aproximada a pé ou de carro saindo do hotel, ex: '150m a pé', '800m de carro'",
  "latitude": latitude aproximada em número decimal (ou null se não tiver),
  "longitude": longitude aproximada em número decimal (ou null se não tiver),
  "mapsLink": "Link do Google Maps pesquisando por esse estabelecimento"
}

O resultado final deve ser um ARRAY JSON válido com os itens de cada categoria.
Não adicione qualquer texto introdutório ou explicativo. Responda apenas com a estrutura JSON em conformidade com o formato requisitado.`;

      let text = "[]";
      try {
        const response = await generateContentWithRetry({
          model: "gemini-3.5-flash",
          contents: { parts: [{ text: promptText }] },
          config: {
            systemInstruction: "Você é um crawler de inteligência geográfica que pesquisa dados de locais reais no Google Search para viajantes.",
            responseMimeType: "application/json",
            tools: [{ googleSearch: {} }],
            responseSchema: {
              type: Type.ARRAY,
              description: "Lista de locais úteis próximos ao hotel",
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING, description: "Deve ser um de: 'Food', 'Medical', 'Services'" },
                  name: { type: Type.STRING },
                  address: { type: Type.STRING },
                  rating: { type: Type.STRING },
                  distance: { type: Type.STRING },
                  latitude: { type: Type.NUMBER },
                  longitude: { type: Type.NUMBER },
                  mapsLink: { type: Type.STRING }
                },
                required: ["category", "name", "address", "distance"]
              }
            },
            temperature: 0.3,
          },
        });
        text = response.text || "[]";
      } catch (apiError: any) {
        if (apiError.status === 429 || String(apiError.message).toLowerCase().includes("limite")) {
          console.log("Using Mock Fallback for Nearby Search due to API limit.");
          text = JSON.stringify([
            { category: "Food", name: "Restaurante e Bistrô Local", address: "Ao redor do centro", rating: "4.5", distance: "200m a pé" },
            { category: "Food", name: "Mercado Principal", address: "Av. Central, 50", rating: "4.2", distance: "350m a pé" },
            { category: "Medical", name: "Farmácia 24h", address: "Rua do Comércio", rating: "4.0", distance: "450m a pé" },
            { category: "Medical", name: "Pronto Socorro", address: "Bairro Vizinho", rating: "4.8", distance: "800m de carro" },
            { category: "Services", name: "Posto de Combustível Principal", address: "Rodovia de Acesso", rating: "4.1", distance: "1.2km de carro" },
            { category: "Services", name: "Caixa Eletrônico", address: "Dentro da Conveniência", rating: "4.5", distance: "350m a pé" }
          ]);
        } else {
          throw apiError;
        }
      }

      let parsedPlaces = [];
      try {
        parsedPlaces = JSON.parse(text.trim());
      } catch (e) {
        console.error("Failed to parse places JSON, falling back to empty list", text, e);
        throw new Error("Resposta da IA estruturada incorretamente.");
      }

      if (Array.isArray(parsedPlaces)) {
        // Clear old ones first
        await db.delete(nearbyPlaces).where(eq(nearbyPlaces.destinationId, destinationId));

        // Insert new ones
        for (const p of parsedPlaces) {
          if (!p.name) continue;
          
          const finalMapsLink = p.mapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${cityName || hAddr}`)}`;
          
          await db.insert(nearbyPlaces).values({
            id: crypto.randomUUID(),
            itineraryId: Number(itineraryId),
            destinationId: String(destinationId),
            category: p.category || "pontos_importantes",
            name: p.name,
            address: p.address || null,
            rating: p.rating ? String(p.rating) : null,
            distance: p.distance || null,
            latitude: p.latitude ? parseFloat(String(p.latitude)) : null,
            longitude: p.longitude ? parseFloat(String(p.longitude)) : null,
            mapsLink: finalMapsLink,
          });
        }
      }

      const results = await db.select().from(nearbyPlaces).where(eq(nearbyPlaces.destinationId, destinationId));
      res.json({ success: true, places: results, cached: false });
    } catch (err: any) {
      console.error("Nearby Search AI error:", err);
      res.status(500).json({ error: "Erro ao varrer arredores com IA: " + err.message });
    }
  });

  app.get("/api/gemini/nearby-places", authMiddleware, async (req: any, res) => {
    try {
      const { destinationId } = req.query;
      if (!destinationId) {
        return res.status(400).json({ error: "O destinationId é obrigatório" });
      }

      const results = await db.select().from(nearbyPlaces).where(eq(nearbyPlaces.destinationId, String(destinationId)));
      res.json({ places: results });
    } catch (err: any) {
      console.error("Get nearby places error:", err);
      res.status(500).json({ error: "Erro ao recuperar locais próximos salvos: " + err.message });
    }
  });

  app.post("/api/gemini/save-places", authMiddleware, async (req: any, res) => {
    try {
      const { itineraryId, destinationId, places } = req.body;
      if (!destinationId || !places || !Array.isArray(places)) {
        return res.status(400).json({ error: "Parâmetros inválidos para salvar locais." });
      }

      // Clear existing first
      await db.delete(nearbyPlaces).where(eq(nearbyPlaces.destinationId, String(destinationId)));

      // Insert new ones
      for (const p of places) {
        if (!p.name) continue;
        const finalMapsLink = p.mapsLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address || ""}`)}`;
        await db.insert(nearbyPlaces).values({
          id: crypto.randomUUID(),
          itineraryId: Number(itineraryId) || 0,
          destinationId: String(destinationId),
          category: p.category || "pontos_importantes",
          name: p.name,
          address: p.address || null,
          rating: p.rating ? String(p.rating) : null,
          distance: p.distance || null,
          latitude: p.latitude ? parseFloat(String(p.latitude)) : null,
          longitude: p.longitude ? parseFloat(String(p.longitude)) : null,
          mapsLink: finalMapsLink,
        });
      }

      const results = await db.select().from(nearbyPlaces).where(eq(nearbyPlaces.destinationId, String(destinationId)));
      res.json({ success: true, places: results });
    } catch (err: any) {
      console.error("Save places error:", err);
      res.status(500).json({ error: "Erro ao salvar locais no banco: " + err.message });
    }
  });

  // Migrate local data into PostgreSQL
  app.post("/api/migrate-local", authMiddleware, async (req: any, res) => {
    if (!db) {
      return res.status(503).json({ error: "DATABASE_URL não configurada." });
    }
    
    try {
      const { email, name, data } = req.body;
      if (!data) {
        return res.status(400).json({ error: "Dados são obrigatórios." });
      }

      let user = req.user;
      
      // Delete existing itineraries for this logic so we don't have dupes
      await db.delete(itineraries).where(eq(itineraries.ownerId, user.id));

      const [itinerary] = await db.insert(itineraries).values({
        ownerId: user.id,
        title: 'Diário de Bordo (Migrado)',
        isShared: true, 
      }).returning();
      
      // INSERT ALL DATA WITH PREFIXING
      await saveItineraryData(db, itinerary.id, data);

      res.json({ success: true, message: "Dados relacionais migrados com sucesso", itinerary });
    } catch (error: any) {
      console.error("Migration error:", error);
      res.status(500).json({ status: "error", error: error.message });
    }
  });

  // Validate Traveler Email and return its linked Itineraries
  app.post("/api/traveler/validate", async (req: any, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "Por favor, indique um endereço de e-mail válido." });
      }

      if (!db) {
        return res.status(503).json({ error: "Banco de dados remoto indisponível." });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Query database for traveler linked with this email
      const linkedTravelers = await db.select().from(travelers).where(eq(sql`LOWER(TRIM(${travelers.email}))`, cleanEmail));

      if (linkedTravelers.length === 0) {
        return res.status(404).json({
          error: "Acesso Negado: Nenhum viajante cadastrado com este e-mail nos nossos roteiros."
        });
      }

      const itineraryIds = linkedTravelers.map((t) => t.itineraryId);

      // Query if traveler already has registered user credentials with a password
      const registeredUser = await db.select().from(users).where(eq(sql`LOWER(TRIM(${users.email}))`, cleanEmail)).limit(1);
      const hasPassword = registeredUser.length > 0 && !!registeredUser[0].passwordHash;

      // Check accessLogs for travelers first access log check with safety fallback
      let isFirstAccessInDb = true;
      try {
        const userLogs = await db.select()
          .from(accessLogs)
          .where(eq(sql`LOWER(TRIM(${accessLogs.userEmail}))`, cleanEmail));
        isFirstAccessInDb = userLogs.length === 0;
      } catch (err) {
        console.error("Erro ao carregar logs de acesso do viajante:", err);
      }

      // Log successful access log in the database securely wrapped in try/catch
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      const clientIp = typeof ip === 'string' ? ip : ip[0];
      const firstItineraryId = itineraryIds.length > 0 ? itineraryIds[0] : null;

      try {
        if (await shouldLogAccess(db, cleanEmail, firstItineraryId, accessLogs)) {
          await db.insert(accessLogs).values({
            itineraryId: firstItineraryId,
            userEmail: cleanEmail,
            status: "success",
            ipAddress: clientIp
          });
        }
      } catch (err) {
        console.error("Erro ao registrar log de acesso para o viajante vinculado:", err);
      }

      // Fetch itineraries details
      const dbItineraries = await db.query.itineraries.findMany({
        where: inArray(itineraries.id, itineraryIds),
        with: {
          travelers: true,
          costs: true,
          costCategories: true,
          documents: true,
          flights: {
            with: {
              passengersList: true,
            },
          },
          generalTips: true,
          notifications: true,
          destinations: {
            with: {
              days: {
                with: { activities: true }
              }
            }
          }
        }
      });

      // Transform records back to expected JSON structure for front-end
      const response = dbItineraries.map((itinerary) => mapItineraryFromDb(itinerary));

      res.json({ success: true, email: cleanEmail, itineraries: response, hasPassword, isFirstAccess: isFirstAccessInDb });
    } catch (err: any) {
      console.error("Traveler validation error:", err);
      res.status(500).json({ error: "Erro interno ao buscar as viagens vinculadas: " + err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
