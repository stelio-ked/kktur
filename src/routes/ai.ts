import { Router } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { Type } from "@google/genai";
import { db } from "../db/index.js";
import { nearbyPlaces, aiPromptLogs } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { geminiQuotaMiddleware } from "../middleware/geminiQuota.js";
import { generateContentWithRetry } from "../services/ai.js";

const router = Router();

router.post("/evaluate-prompt", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "O prompt não pode ser vazio." });
    }

    if (!process.env.GEMINI_API_KEY) {
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
        systemInstruction: `Você é um especialista em planejamento de viagens e assistente de IA altamente interativo.
Sua missão é avaliar se o prompt inicial do usuário contém TODOS os 4 detalhes fundamentais para gerar um roteiro sob medida de alta precisão:
1. Destino específico ou cidades pretendidas (ex: "Istambul e Capadócia" ao invés de apenas "Turquia")
2. Número exato de dias ou duração (ex: "10 dias")
3. Estilo / Ritmo da viagem (ex: cultural, relaxante, romântico, aventura, gastronômico)
4. Perfil de orçamento ou categoria de experiência (ex: econômico, moderado, luxo)

REGRAS RÍGIDAS DE AVALIAÇÃO:
- Se qualquer um dos 4 pontos acima NÃO estiver 100% explícito no prompt inicial, MARQUE "isSpecific" COMO false!
- Quando "isSpecific" for false, gere sempre de 2 a 3 perguntas inteligentes, acolhedoras e altamente relevantes em português do Brasil com IDs simples em inglês para cada pergunta (ex: "sub_destinations", "travel_style", "budget_level", "travelers_count").
- Para cada pergunta, ofereça de 3 a 4 opções de resposta rápida ("options") em português claro, direto e inspirador.

Exemplo: Se o usuário solicitar "10 dias na Turquia para duas pessoas", faltam o estilo da viagem, o orçamento e as regiões/cidades preferidas. Marque isSpecific = false e elabore as 3 perguntas correspondentes!

Retorne EXCLUSIVAMENTE um objeto JSON válido correspondente a este schema:
{
  "isSpecific": boolean,
  "reason": string (mensagem entusiasmada explicando como as respostas deixarão o roteiro perfeito),
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

router.post("/optimize-route", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
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

router.post("/generate-itinerary", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
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
        systemInstruction: `Você é um mestre em planejamento de viagens internacionais e consultor de roteiros realistas em português do Brasil.
A sua tarefa é criar um roteiro de viagem completo, matematicamente preciso, geograficamente coerente e financeiramente honesto (SEM ALUCINAÇÕES DE PREÇO OU DE DATAS).

REGRAS DE OURO CRÍTICAS (OBRIGATÓRIAS):

1. DURAÇÃO EXATA E QUANTIDADE DE DIAS:
   - Identifique a quantidade exata de dias informada no prompt ou nas respostas (ex: "10 dias").
   - A SOMA TOTAL de dias no array "days" (distribuídos nos destinos) DEVE SER EXATAMENTE A QUANTIDADE SOLICITADA! Se o usuário pediu 10 dias, gere exatamente 10 dias (Dia 1 ao Dia 10). NUNCA gere menos dias ou pare na metade!
   - Se o usuário especificou mês e ano (ex: "fev de 2027"), ajuste as datas dos destinos para coincidir com aquele período (ex: startDate: "2027-02-01", endDate: "2027-02-10").

2. ORÇAMENTO REALISTA E ANTIMULTIPLICAÇÃO EXCESSIVA (SEM ALUCINAÇÕES):
   - Verifique a preferência de orçamento solicitada:
     a) "Econômico": Hotéis 3 estrelas / pousadas charmosas (R$ 200 a R$ 450/noite casal), voos em classe econômica.
     b) "Moderado / Confortável" (PADRÃO SE NÃO ESPECIFICADO): Hotéis 3 a 4 estrelas bem localizados e avaliados (R$ 450 a R$ 900/noite casal), voos em classe econômica.
     c) "Luxo": SOMENTE se o usuário escolher explicitamente a opção "Luxo" ou "Luxury". Caso contrário, NUNCA coloque hotéis de R$ 5.000+/noite como Four Seasons ou voos em classe executiva!
   - Verifique o valor em "totalCostBRL" no array "costs": Os preços de hospedagem, passagens e passeios devem corresponder à realidade do destino para o número total de viajantes indicados no grupo. Para um casal por 10 dias na Turquia em padrão moderado, o custo total (hospedagens + voos + passeios) deve girar em torno de R$ 16.000 a R$ 26.000 no total, JAMAIS R$ 60.000+.

3. DISTRIBUIÇÃO E DIVERSIDADE DE DESTINOS:
   - Para viagens de 7 dias ou mais em um país com múltiplas regiões famosas (ex: Turquia, Japão, Itália, França), divida em 2 ou 3 destinos principais no array "destinations" (ex: Turquia 10 dias -> Destino 1: Istambul [6 dias], Destino 2: Capadócia [4 dias]).
   - Inclua voos internos ou passeios imperdíveis (como o voo de balão na Capadócia, caso relevante) com preços realistas.

4. FORMATO JSON RÍGIDO E COMPLETO:
Siga rigorosamente este schema JSON e garanta que todos os campos estejam preenchidos:

{
  "destinations": [
    {
      "id": string (ex: "dest-1"),
      "city": string,
      "state": string,
      "country": string,
      "dates": string (ex: "01 fev. - 06 fev."),
      "startDate": string (formato YYYY-MM-DD, ex: 2027-02-01),
      "endDate": string (formato YYYY-MM-DD, ex: 2027-02-06),
      "hotelName": string,
      "hotelAddress": string,
      "checkInTime": string (ex: "15:00"),
      "checkOutTime": string (ex: "11:00"),
      "notes": string (detalhes e dicas do hotel sugerido),
      "days": [
        {
          "id": string (ex: "day-1"),
          "dayNumber": number (começando de 1 continuamente através dos destinos),
          "dateStr": string (ex: "Segunda, 01 de Fevereiro"),
          "title": string,
          "activities": [
            {
              "id": string (ex: "act-1"),
              "time": string (ex: "09:30"),
              "location": string,
              "duration": string (ex: "2h"),
              "cost": string (ex: "Gratuito" ou "R$ 45"),
              "mapsQuery": string (termo para busca no Google Maps, ex: "Mesquita Azul, Istambul"),
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
      "category": string (ex: "Clima" ou "Transporte" ou "Moeda"),
      "title": string,
      "content": string
    }
  ]
}`,
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });

    const text = response.text || "{}";
    const result = JSON.parse(text.trim());

    // Persist this generation session for template reuse
    try {
      const userId = (req as AuthRequest).user?.id ?? null;
      const city = result?.destinations?.[0]?.city || "";
      const country = result?.destinations?.[0]?.country || "";
      const dates = result?.destinations?.[0]?.dates || "";
      const generatedTitle = `${city}${country ? `, ${country}` : ""} ${dates ? `(${dates})` : ""}`.trim();

      await db.insert(aiPromptLogs).values({
        userId,
        originalPrompt: prompt,
        questions: answers && Object.keys(answers).length > 0 ? JSON.stringify(answers) : null,
        answers: answers && Object.keys(answers).length > 0 ? JSON.stringify(answers) : null,
        generatedTitle: generatedTitle || null,
        success: true,
      });
    } catch (logErr) {
      console.warn("Failed to save AI prompt log:", logErr);
    }

    res.json(result);
  } catch (err: any) {
    console.error("Generation error:", err);
    res.status(500).json({ error: "Erro ao gerar roteiro estruturado com IA: " + err.message });
  }
});

// Returns up to 4 random successful AI generation prompts to power the "quick templates" UI
router.get("/prompt-templates", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: aiPromptLogs.id,
        originalPrompt: aiPromptLogs.originalPrompt,
        generatedTitle: aiPromptLogs.generatedTitle,
      })
      .from(aiPromptLogs)
      .where(eq(aiPromptLogs.success, true))
      .orderBy(sql`RANDOM()`)
      .limit(4);

    // Build label from generatedTitle or truncate prompt
    const templates = rows.map((row) => ({
      label: row.generatedTitle || row.originalPrompt.slice(0, 40),
      text: row.originalPrompt,
    }));

    res.json({ templates });
  } catch (err: any) {
    console.error("prompt-templates error:", err);
    res.json({ templates: [] });
  }
});

router.post("/ocr-flight", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
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
Extraia campos cruciais como airline, flightCode, departureCity, departureCode, departureTime, arrivalCity, arrivalCode, arrivalTime, duration, dateStr, arrivalDateStr, gate, locator, passengers, seats, passengersList.
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

router.post("/ocr-receipt", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
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
Faça a transcrição dos itens principais e traduza tudo para o português.
Extraia: description, category, totalCostBRL (number), notes.
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

router.post("/monitor-flight", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
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

As opções de status válidas são estritamente: "Confirmado", "Atrasado", "Cancelado", "Embarque", "Check-in aberto" ou "Finalizado".
${forceCheckInOpen ? "IMPORTANTE: Você DEVE OBRIGATORIAMENTE mudar o status do voo para 'Check-in aberto'." : ""}

Forneça a saída estritamente em formato JSON.`;

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
              description: "Novo status do voo." 
            },
            previousStatus: { type: Type.STRING },
            statusChanged: { type: Type.BOOLEAN },
            gate: { type: Type.STRING },
            message: { type: Type.STRING },
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

router.post("/nearby-search", authMiddleware, geminiQuotaMiddleware, async (req: AuthRequest, res) => {
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

    if (!refresh) {
      const cached = await db.select().from(nearbyPlaces).where(eq(nearbyPlaces.destinationId, destinationId));
      if (cached && cached.length > 0) {
        return res.json({ success: true, places: cached, cached: true });
      }
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "Chave Gemini API não está configurada no servidor (Settings > Secrets)." });
    }

    const promptText = `Faça uma pesquisa detalhada de locais reais próximos ao ponto hoteleiro: ${hName}, ${hAddr}, ${cityName}.
Retorne 3 categorias: Food, Medical, Services.
Responda apenas em formato JSON Array.`;

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
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
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
      text = JSON.stringify([
        { category: "Food", name: "Restaurante e Bistrô Local", address: "Ao redor do centro", rating: "4.5", distance: "200m a pé" },
        { category: "Food", name: "Mercado Principal", address: "Av. Central, 50", rating: "4.2", distance: "350m a pé" },
        { category: "Medical", name: "Farmácia 24h", address: "Rua do Comércio", rating: "4.0", distance: "450m a pé" },
        { category: "Services", name: "Caixa Eletrônico", address: "Dentro da Conveniência", rating: "4.5", distance: "350m a pé" }
      ]);
    }

    let parsedPlaces = [];
    try {
      parsedPlaces = JSON.parse(text.trim());
    } catch (e) {
      throw new Error("Resposta da IA estruturada incorretamente.");
    }

    if (Array.isArray(parsedPlaces)) {
      await db.delete(nearbyPlaces).where(eq(nearbyPlaces.destinationId, destinationId));

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

router.get("/nearby-places", authMiddleware, async (req: AuthRequest, res) => {
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

router.post("/save-places", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { itineraryId, destinationId, places } = req.body;
    if (!destinationId || !places || !Array.isArray(places)) {
      return res.status(400).json({ error: "Parâmetros inválidos para salvar locais." });
    }

    await db.delete(nearbyPlaces).where(eq(nearbyPlaces.destinationId, String(destinationId)));

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

export default router;
