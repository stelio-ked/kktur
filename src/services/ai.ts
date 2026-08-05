import { GoogleGenAI } from "@google/genai";

export const aiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function generateContentWithRetry(params: {
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

  const fallbackModels = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
  
  for (const fallbackModel of fallbackModels) {
    if (params.model === fallbackModel) continue;
    
    try {
      const res = await aiClient.models.generateContent({
        ...params,
        model: fallbackModel
      });
      return res;
    } catch (fallbackErr: any) {
      lastError = fallbackErr;
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
