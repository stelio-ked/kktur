import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  MapPin, 
  Calendar, 
  ChevronRight, 
  ArrowRight, 
  Loader2, 
  Compass, 
  HelpCircle, 
  CheckCircle2, 
  X,
  Compass as CompassIcon,
  Plane,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AIPlannerWidgetProps {
  token: string | null;
  isOffline: boolean;
  onImportGeneratedItinerary: (title: string, payload: any) => void;
  setActiveTab: (tab: string) => void;
  isReadOnly?: boolean;
}

interface SuggestedQuestion {
  id: string;
  question: string;
  options: string[];
}

interface EvaluationResult {
  isSpecific: boolean;
  reason: string;
  suggestedQuestions: SuggestedQuestion[];
}

export default function AIPlannerWidget({
  token,
  isOffline,
  onImportGeneratedItinerary,
  setActiveTab,
  isReadOnly = false
}: AIPlannerWidgetProps) {
  if (isReadOnly) return null;

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"input" | "questions" | "generating" | "success">("input");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  
  // Evaluation results state
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // Custom user inputs for questions
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  // Loading messages rotation
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const loadingMessages = [
    "Pesquisando os pontos turísticos mais incríveis do mundo...",
    "Selecionando hotéis requintados e bem avaliados...",
    "Estruturando atividades práticas e prazerosas dia a dia...",
    "Otimizando distâncias de transporte e rotas de GPS...",
    "Calculando estimativas financeiras reais e dicas locais...",
    "Quase lá! Finalizando a simulação dos seus e-tickets de voo..."
  ];

  useEffect(() => {
    let interval: any;
    if (step === "generating") {
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [step]);

  const handleReset = () => {
    setStep("input");
    setPrompt("");
    setAnswers({});
    setCustomInputs({});
    setEvaluation(null);
    setError("");
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("Por favor, descreva um pouco os seus planos de viagem.");
      return;
    }
    setError("");
    setStep("generating");
    setLoadingMsgIdx(0);

    try {
      const response = await fetch("/api/gemini/evaluate-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error("Não foi possível avaliar os dados do prompt com a IA.");
      }

      const result = await response.json();
      setEvaluation(result);

      if (result.isSpecific) {
        // Safe to go straight to itinerary generation
        await handleGenerate(result, {});
      } else {
        setStep("questions");
      }
    } catch (err: any) {
      setError(err.message || "Erro de rede ao falar com o servidor.");
      setStep("input");
    }
  };

  const handleSelectOption = (questionId: string, option: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: option
    }));
  };

  const handleCustomInputChange = (questionId: string, val: string) => {
    setCustomInputs((prev) => ({
      ...prev,
      [questionId]: val
    }));
    setAnswers((prev) => ({
      ...prev,
      [questionId]: val
    }));
  };

  const triggerGenerationWithAnswers = async () => {
    // Fill any missing answers with custom inputs if available, else blank
    const finalAnswersObj = { ...answers };
    evaluation?.suggestedQuestions.forEach((q) => {
      if (!finalAnswersObj[q.id] && customInputs[q.id]) {
        finalAnswersObj[q.id] = customInputs[q.id];
      }
    });

    setStep("generating");
    setLoadingMsgIdx(2); // Start ahead in messages
    await handleGenerate(evaluation, finalAnswersObj);
  };

  const handleGenerate = async (evalObj: EvaluationResult | null, finalAnswers: Record<string, string>) => {
    try {
      const response = await fetch("/api/gemini/generate-itinerary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt,
          answers: finalAnswers
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Houve uma falha na geração do roteiro com a IA.");
      }

      const payload = await response.json();
      
      // Compute a clean title for the new itinerary based on generated context
      const city = payload?.destinations?.[0]?.city || "Novo Destino";
      const country = payload?.destinations?.[0]?.country || "";
      const dates = payload?.destinations?.[0]?.dates || "Data a Definir";
      const title = `Roteiro IA: ${city}${country ? `, ${country}` : ""} (${dates})`;

      // Import directly into current user state
      onImportGeneratedItinerary(title, payload);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Houve uma falha ao gerar a viagem. Tente novamente.");
      setStep(evalObj?.isSpecific ? "input" : "questions");
    }
  };

  const handleGoToTrip = () => {
    setIsOpen(false);
    setActiveTab("itinerary");
    handleReset();
  };

  return (
    <>
      {/* Floating Action Button for AI Copilot */}
      <button
        onClick={() => {
          if (isOffline) {
            alert("O Gerador de Roteiros com IA necessita de uma conexão ativa com a internet.");
            return;
          }
          setIsOpen(true);
        }}
        disabled={isOffline}
        className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 p-4 rounded-full shadow-xl transition-all flex items-center justify-center ${
          isOffline 
            ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
            : "bg-gradient-to-r from-amber-500 via-pink-500 to-indigo-600 text-white hover:shadow-2xl hover:scale-[1.05] cursor-pointer"
        }`}
        title="Assistente Copiloto IA"
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
      </button>

      {/* AI Wizard Modal Popup */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/50 rounded-t-3xl shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-sm">Criador de Roteiros com IA</h4>
                    <p className="text-[10px] text-indigo-600 font-extrabold tracking-wider uppercase">Copiloto Inteligente</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Steps Area */}
              <div className="p-6 grow overflow-y-auto space-y-6">
                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-rose-800 text-xs font-semibold animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                {/* STEP 1: INITIAL INPUT */}
                {step === "input" && (
                  <form onSubmit={handleEvaluate} className="space-y-4">
                    <div className="bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-indigo-600/10 border border-indigo-100 rounded-2xl p-4 mb-2 space-y-2">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Cocrie sua Próxima Aventura
                      </h3>
                      <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                        Digite um prompt simples em português. A nossa IA vai checar se faltam informações, sugerir perguntas interativas de refino e gerar um diário completo!
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-extrabold text-slate-600 uppercase tracking-widest block">
                        Descreva seus planos ou sonhos de viagem:
                      </label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ex: Quero viajar 4 dias para o Rio de Janeiro com amigos, visitar o Cristo Redentor, curtir praias tranquilas e recomendações de bons quiosques e pizzarias."
                        rows={5}
                        className="w-full text-sm font-semibold p-4 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 resize-none placeholder:text-slate-400 text-slate-800 transition-all shadow-xs"
                      />
                    </div>

                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs font-bold text-indigo-950 flex items-start gap-2.5 leading-relaxed">
                      <CompassIcon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <span>
                        Se você fornecer um prompt bem completo, nossa IA criará o roteiro de primeira! Caso contrário, faremos algumas perguntas rápidas para refinar os detalhes ideais juntos.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="w-full cursor-pointer bg-indigo-600 text-white font-black text-xs py-3.5 rounded-2xl hover:bg-indigo-750 transition-all shadow-sm flex items-center justify-center gap-2 hover:scale-[1.01]"
                    >
                      <span>Analisar Ideia de Viagem</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {/* STEP 2: REFINING QUESTIONS */}
                {step === "questions" && evaluation && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl space-y-1">
                      <p className="text-xs font-extrabold text-amber-850 flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-amber-600" /> Detalhes adicionais nos ajudariam muito:
                      </p>
                      <p className="text-xs text-amber-900 leading-relaxed font-semibold">
                        {evaluation.reason}
                      </p>
                    </div>

                    <div className="space-y-5">
                      {evaluation.suggestedQuestions.map((q, idx) => (
                        <div key={q.id} className="space-y-2.5 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                          <p className="text-xs font-black text-slate-800 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-220 text-slate-600 text-[10px] flex items-center justify-center font-black">
                              {idx + 1}
                            </span>
                            {q.question}
                          </p>

                          {/* Quick selection pills */}
                          {q.options && q.options.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {q.options.map((opt) => {
                                const selected = answers[q.id] === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleSelectOption(q.id, opt)}
                                    className={`py-1.5 px-3 rounded-xl text-[11px] font-extrabold border cursor-pointer transition-all ${
                                      selected
                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Manual Text option */}
                          <input
                            type="text"
                            placeholder="Ou digite sua resposta customizada..."
                            value={customInputs[q.id] || ""}
                            onChange={(e) => handleCustomInputChange(q.id, e.target.value)}
                            className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-205 outline-none bg-white focus:border-indigo-600"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={triggerGenerationWithAnswers}
                        className="flex-1 cursor-pointer bg-indigo-600 text-white font-black text-xs py-3.5 rounded-2xl hover:bg-indigo-750 transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        <span>Gerar Roteiro Mágico ✨</span>
                        <Sparkles className="w-4 h-4 text-amber-300 animate-bounce" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnswers({});
                          triggerGenerationWithAnswers();
                        }}
                        className="py-3.5 px-5 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs rounded-2xl transition-all border border-slate-200/60"
                      >
                        Gerar sem responder
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: GENERATING SCREEN */}
                {step === "generating" && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="relative">
                      <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-xl animate-pulse" />
                      <div className="relative animate-spin duration-3000">
                        <Compass className="w-16 h-16 text-indigo-600 animate-pulse" />
                      </div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <Plane className="w-6 h-6 text-pink-500 animate-wiggle" />
                      </div>
                    </div>
                    
                    <div className="space-y-2 max-w-sm">
                      <h4 className="text-base font-black text-slate-800">Criando sua obra de arte de viagem...</h4>
                      <div className="h-6 overflow-hidden">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={loadingMsgIdx}
                            initial={{ y: 15, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -15, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-xs font-black text-indigo-600 leading-relaxed"
                          >
                            {loadingMessages[loadingMsgIdx]}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="w-full max-w-xs bg-slate-100 h-1 rounded-full overflow-hidden shrink-0 mt-1">
                      <div className="bg-gradient-to-r from-amber-500 via-pink-500 to-indigo-600 h-full w-[85%] rounded-full animate-progress" />
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Isso pode levar de 15 a 35 segundos</p>
                  </div>
                )}

                {/* STEP 4: SUCCESS */}
                {step === "success" && (
                  <div className="py-10 flex flex-col items-center justify-center text-center space-y-6 animate-fadeIn">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
                      <CheckCircle2 className="w-10 h-10 animate-scaleIn" />
                    </div>

                    <div className="space-y-2 max-w-sm">
                      <h4 className="text-lg font-black text-slate-800">Roteiro Gerado com Sucesso!</h4>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        Nossa inteligência artificial desenhou um itinerário maravilhoso para sua viagem, completo com hotéis, voos, custos e passeios recomendados.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoToTrip}
                      className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-6 py-3.5 rounded-2xl transition-all shadow-sm flex items-center gap-2"
                    >
                      <span>Abrir Diário de Roteiros</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
