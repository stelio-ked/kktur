import React, { useEffect, useState } from "react";
import { Destination, NearbyPlace } from "../types";
import { 
  Compass, 
  Sparkles, 
  RefreshCw, 
  MapPin, 
  ShoppingCart, 
  Store, 
  Fuel, 
  ExternalLink, 
  Star, 
  HelpCircle,
  AlertCircle,
  X,
  Stethoscope,
  Briefcase
} from "lucide-react";
import { motion } from "motion/react";

interface NearbyPlacesWidgetProps {
  itineraryId: number;
  destination: Destination;
  onPlacesLoaded: (places: NearbyPlace[]) => void;
  isReadOnly?: boolean;
}

type CategoryType = "Food" | "Medical" | "Services" | "postos_combustivel" | "supermercados" | "lojas_conveniencia" | "pontos_importantes";

export function NearbyPlacesWidget({ 
  itineraryId, 
  destination, 
  onPlacesLoaded,
  isReadOnly = false 
}: NearbyPlacesWidgetProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryType>("Food");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hotelName = destination.hotelName || "";
  const hotelAddress = destination.hotelAddress || "";
  const city = destination.city || "";

  // 1. Initial Load from Database Cache
  useEffect(() => {
    let active = true;
    const loadCachedPlaces = async () => {
      if (!destination.id) return;
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("auth_token") || "traveler-session";
        const res = await fetch(`/api/gemini/nearby-places?destinationId=${destination.id}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (active && data && Array.isArray(data.places)) {
            setPlaces(data.places);
            onPlacesLoaded(data.places);
          }
        }
      } catch (err: any) {
        console.warn("Failed to retrieve cached nearby places:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCachedPlaces();
    return () => {
      active = false;
    };
  }, [destination.id]);

  // 2. Perform Active Scan (either first-time or forced refresh)
  const handlePerformScan = async (forceRefresh = false) => {
    if (!hotelAddress && !hotelName) {
      setError("Cadastre o nome ou endereço da hospedagem no destino para que possamos iniciar a varredura.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("auth_token") || "traveler-session";
      const res = await fetch("/api/gemini/nearby-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          itineraryId,
          destinationId: destination.id,
          hotelName,
          hotelAddress,
          city,
          refresh: forceRefresh
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro desconhecido ao varrer arredores.");
      }

      const data = await res.json();
      if (data && Array.isArray(data.places)) {
        setPlaces(data.places);
        onPlacesLoaded(data.places);
        setIsModalOpen(true);
      } else {
        throw new Error("Formato de resposta inesperado do motor de IA.");
      }
    } catch (err: any) {
      console.error("Scanning failed:", err);
      setError(err.message || "Erro de conexão ao varrer arredores.");
    } finally {
      setLoading(false);
    }
  };

  // Helper for Category Metadata
  const categoriesConfig: Record<string, { label: string; icon: any; colorClass: string; bgClass: string; activeBorderClass: string }> = {
    Food: {
      label: "Food",
      icon: ShoppingCart,
      colorClass: "text-orange-600",
      bgClass: "bg-orange-50 border-orange-100 hover:bg-orange-100/50",
      activeBorderClass: "ring-2 ring-orange-500 bg-orange-100/70"
    },
    Medical: {
      label: "Medical",
      icon: Stethoscope,
      colorClass: "text-emerald-600",
      bgClass: "bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50",
      activeBorderClass: "ring-2 ring-emerald-500 bg-emerald-100/70"
    },
    Services: {
      label: "Services",
      icon: Briefcase,
      colorClass: "text-indigo-600",
      bgClass: "bg-indigo-50 border-indigo-100 hover:bg-indigo-100/50",
      activeBorderClass: "ring-2 ring-indigo-500 bg-indigo-100/70"
    },
    postos_combustivel: {
      label: "Postos",
      icon: Fuel,
      colorClass: "text-orange-600",
      bgClass: "bg-orange-50 border-orange-100 hover:bg-orange-100/50",
      activeBorderClass: "ring-2 ring-orange-500 bg-orange-100/70"
    },
    supermercados: {
      label: "Mercados",
      icon: ShoppingCart,
      colorClass: "text-emerald-600",
      bgClass: "bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50",
      activeBorderClass: "ring-2 ring-emerald-500 bg-emerald-100/70"
    },
    lojas_conveniencia: {
      label: "Conveniências",
      icon: Store,
      colorClass: "text-cyan-600",
      bgClass: "bg-cyan-50 border-cyan-100 hover:bg-cyan-100/50",
      activeBorderClass: "ring-2 ring-cyan-500 bg-cyan-100/70"
    },
    pontos_importantes: {
      label: "Pontos Úteis",
      icon: MapPin,
      colorClass: "text-indigo-600",
      bgClass: "bg-indigo-50 border-indigo-100 hover:bg-indigo-100/50",
      activeBorderClass: "ring-2 ring-indigo-500 bg-indigo-100/70"
    }
  };

  const normalizedPlaces = places.map(p => {
    let cat = p.category;
    if (cat === "supermercados" || cat === "lojas_conveniencia") cat = "Food";
    if (cat === "pontos_importantes") cat = "Medical";
    if (cat === "postos_combustivel") cat = "Services";
    return { ...p, category: cat };
  });

  const filteredPlaces = normalizedPlaces.filter(p => p.category === activeCategory);

  return (
    <div id="nearby-places-widget-root" className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-rose-50">
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
            <Compass className="w-4 h-4 animate-spin" style={{ animationDuration: "10s" }} />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1">
              Varredura de Proximidades IA
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse shrink-0" />
            </h4>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Encontre utilidades reais nos arredores de {hotelName || "Hotel"}
            </span>
          </div>
        </div>

        {/* Refresh / Scan Trigger Button */}
        {places.length > 0 && (
          <button
            onClick={() => handlePerformScan(true)}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refazer varredura de proximidades"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Pesquisa Inteligente
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex gap-2 p-3 border rounded-xl bg-rose-50/50 border-rose-100 text-rose-700 text-xs font-semibold leading-relaxed">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State / Initial Trigger Call */}
      {places.length === 0 && (
        <div className="p-6 text-center border-2 border-dashed border-slate-150 rounded-2xl bg-slate-50/45 space-y-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mx-auto">
            <Compass className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h5 className="font-bold text-slate-700 text-xs">Arredores Inexplorados</h5>
            <p className="text-[10px] text-slate-400 max-w-sm mx-auto leading-normal">
              Faça uma varredura inteligente baseada na hospedagem logada ({hotelName || "hotel"}) para mapear postos, mercados de suprimento, e pontos úteis reais na região.
            </p>
          </div>
          <button
            onClick={() => handlePerformScan(false)}
            disabled={loading}
            className={`proximity-button inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-rose-500 hover:from-indigo-700 hover:to-rose-600 text-white font-extrabold text-xs rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer ${loading ? 'opacity-90 animate-pulse' : ''}`}
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-200" />}
            {loading ? 'Buscando...' : 'Varrer Proximidades do Hotel'}
          </button>
        </div>
      )}

      {/* Action Button for Opening Modal */}
      {places.length > 0 && (
        <div className="text-center pt-2">
           <button
             onClick={() => setIsModalOpen(true)}
             className="px-6 py-2.5 bg-indigo-600 text-white font-semibold text-xs rounded-xl shadow-sm hover:bg-indigo-700 transition-colors"
           >
             Ver {places.length} Locais Próximos
           </button>
        </div>
      )}

      {isModalOpen && (
        <div className="proximity-results-modal fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 relative shrink-0 z-10">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-inner">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-1.5">
                    Resultados de Proximidade
                    <Sparkles className="fill-amber-400 text-amber-400 w-4 h-4" />
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Hotel: {hotelName || "Configurado"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body & Filters */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-5 relative">
              
              <div className="grid grid-cols-3 gap-2">
                {["Food", "Medical", "Services"].map(type => {
                  const catKey = type as CategoryType;
                  const conf = categoriesConfig[catKey] || categoriesConfig["Food"];
                  const Icon = conf?.icon || HelpCircle;
                  const isActive = activeCategory === catKey;
                  
                  return (
                    <button
                      key={catKey}
                      onClick={() => setActiveCategory(catKey)}
                      className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all gap-1.5 cursor-pointer ${
                        isActive 
                          ? `${conf.activeBorderClass} ${conf.colorClass}`
                          : `bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300`
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {conf?.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                {filteredPlaces.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-2xl border border-slate-150">
                    <p className="text-sm font-semibold text-slate-400">Nenhum resultado verificado para essa categoria.</p>
                  </div>
                ) : (
                  filteredPlaces.map((place, idx) => (
                    <motion.div 
                      key={idx} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h5 className="font-bold text-slate-800 text-sm">{place.name}</h5>
                        {place.rating && place.rating !== "null" && (
                          <div className="flex items-center gap-0.5 shrink-0 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-amber-100 mt-0.5">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {place.rating}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-1.5 mb-3">
                        {place.address && place.address !== "null" && (
                          <div className="flex items-start gap-1.5 text-[10px] text-slate-500 flex-wrap lg:flex-nowrap">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">{place.address}</span>
                          </div>
                        )}
                        {place.distance && place.distance !== "null" && (
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-600">
                            <Compass className="w-3 h-3 shrink-0" />
                            <span>{place.distance}</span>
                          </div>
                        )}
                      </div>

                      {place.description && place.description !== "null" && (
                        <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3">
                          {place.description}
                        </p>
                      )}

                      <div className="pt-3 flex justify-between items-center border-t border-slate-100 mt-auto">
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded-md border border-slate-150">
                          Verificado
                        </span>
                        
                        {(place.mapsLink || place.name) && (
                          <a 
                            href={place.mapsLink && place.mapsLink !== "null" ? place.mapsLink : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + (place.address || ""))}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors border border-indigo-100"
                          >
                            Abrir no Maps
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
