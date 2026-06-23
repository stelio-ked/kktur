import React, { useState, useEffect } from "react";
import { 
  Clock, 
  Plane, 
  Calendar, 
  MapPin, 
  Sparkles, 
  Compass, 
  Building,
  ExternalLink,
  Map,
  CheckCircle2,
  Bell
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Destination } from "../types";
import { parseRangeToDates } from "../utils";

interface TripCountdownProps {
  destinations: Destination[];
}

export default function TripCountdown({ destinations }: TripCountdownProps) {
  const [firstDest, setFirstDest] = useState<Destination | null>(null);
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    status: "upcoming" | "ongoing" | "completed" | "none";
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    status: "none"
  });

  useEffect(() => {
    if (!destinations || destinations.length === 0) {
      setFirstDest(null);
      setTimeLeft(prev => ({ ...prev, status: "none" }));
      return;
    }

    // Sort destinations chronologically to find the very first destination highlight
    const sorted = [...destinations].sort((a, b) => {
      const getVal = (d: Destination) => {
        if (d.startDate) return d.startDate;
        if (d.checkInDate) return d.checkInDate.split('T')[0];
        const parsed = parseRangeToDates(d.dates || "");
        return parsed.startDate;
      };
      return getVal(a).localeCompare(getVal(b));
    });

    const first = sorted[0];
    setFirstDest(first);

    // Compute start and end times for this first destination using check-in details
    let startDateStr = first.startDate;
    let endDateStr = first.endDate;

    if (!startDateStr || !endDateStr) {
      const parsed = parseRangeToDates(first.dates || "");
      startDateStr = startDateStr || parsed.startDate;
      endDateStr = endDateStr || parsed.endDate;
    }

    const checkInHour = first.checkInTime || "15:00";
    const checkOutHour = first.checkOutTime || "11:00";

    const checkInDateTime = new Date(`${startDateStr}T${checkInHour}:00`);
    const checkOutDateTime = new Date(`${endDateStr}T${checkOutHour}:00`);

    const updateTimer = () => {
      const now = new Date();

      if (isNaN(checkInDateTime.getTime())) {
        setTimeLeft(prev => ({ ...prev, status: "none" }));
        return;
      }

      if (now < checkInDateTime) {
        // Upcoming check-in
        const diff = checkInDateTime.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / 1000 / 60) % 65 % 60);
        const seconds = Math.floor((diff / 1000) % 60);

        setTimeLeft({ days, hours, minutes, seconds, status: "upcoming" });
      } else if (now >= checkInDateTime && now <= checkOutDateTime) {
        // Ongoing stay
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, status: "ongoing" });
      } else {
        // Past stay
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, status: "completed" });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);

  }, [destinations]);

  if (timeLeft.status === "none" || !firstDest) {
    return null;
  }

  const hasHotel = !!(firstDest.hotelName || firstDest.hotelAddress);

  return (
    <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl overflow-hidden relative border border-indigo-500/10">
      {/* Background World Map / Plane Art overlay */}
      <div className="absolute top-0 right-0 p-8 opacity-5 select-none pointer-events-none">
        <Compass className="w-64 h-64 transform rotate-12 text-white animate-spin-slow" />
      </div>
      <div className="absolute bottom-[-20px] left-[20%] p-4 opacity-[0.03] select-none pointer-events-none">
        <Plane className="w-80 h-80 transform -rotate-45 text-white" />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header Ribbon & Section Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="text-[9px] text-orange-400 font-extrabold uppercase tracking-widest block mb-0.5">Destaque da Viagem</span>
              <h2 className="font-extrabold text-white text-base md:text-lg uppercase tracking-wide">
                Visualização de Próxima Viagem
              </h2>
            </div>
          </div>
          
          <div className="inline-flex self-start sm:self-auto items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-slate-350 font-bold uppercase tracking-wider">
            <Clock className="w-3 h-3 text-indigo-400" />
            <span>Horário Local: de Brasília</span>
          </div>
        </div>

        {/* Content Columns: Host Info vs Countdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Main Destination Showcase - 7 Cols */}
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/20 text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">
                Primeira Escala
              </div>
              <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">
                {firstDest.city}
              </h3>
              <p className="text-xs text-slate-350 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{firstDest.city}, {firstDest.state && `${firstDest.state}, `}{firstDest.country}</span>
              </p>
            </div>

            {/* Accommodation card under first destination */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 shadow-inner">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                  <Building className="w-4 h-4" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block">Local de Hospedagem</span>
                  <h4 className="font-bold text-sm text-white truncate">
                    {firstDest.hotelName || "A definir pousada / hotel"}
                  </h4>
                  {firstDest.hotelAddress && (
                    <p className="text-[11px] text-slate-300 font-medium line-clamp-1">
                      {firstDest.hotelAddress}
                    </p>
                  )}
                </div>
              </div>

              {/* Badges / metadata */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-white/5 text-[10px]">
                <div>
                  <span className="text-slate-400 block text-[8px] uppercase font-bold tracking-wider">Período</span>
                  <span className="font-extrabold text-[#FEE2E2] flex items-center gap-1 mt-0.5 font-mono">
                    <Calendar className="w-3 h-3 text-rose-400 shrink-0" />
                    {firstDest.dates}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[8px] uppercase font-bold tracking-wider">Horário Check-In</span>
                  <span className="font-extrabold text-emerald-400 mt-0.5 block">
                    {firstDest.checkInTime || "15:00"}h
                  </span>
                </div>
                {firstDest.hotelLink && (
                  <div className="col-span-2 md:col-span-1 flex items-end">
                    <a
                      href={firstDest.hotelLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-center py-1 px-2.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/20 rounded-lg text-indigo-300 font-bold transition-all flex items-center justify-center gap-1.2 cursor-pointer truncate"
                    >
                      <Map className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span>Ver no Local</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Big Countdown Timer - 5 Cols */}
          <div className="lg:col-span-5 bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden backdrop-blur-xs min-h-[190px]">
            {timeLeft.status === "upcoming" && (
              <>
                <div className="text-center space-y-1">
                  <span className="text-[9px] text-orange-400 font-black uppercase tracking-widest inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <Bell className="w-2.5 h-2.5 text-orange-400 animate-bounce" /> Contagem Regressiva para Check-In
                  </span>
                  <p className="text-xs text-slate-300 font-bold uppercase tracking-wider py-1">
                    Faltas apenas para o embarque / estadia:
                  </p>
                </div>

                {/* Display Grid */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 justify-center">
                  {/* Days */}
                  <div className="flex flex-col items-center">
                    <div className="w-13 h-13 md:w-15 md:h-15 bg-white text-slate-900 rounded-xl flex flex-col items-center justify-center shadow-lg">
                      <span className="text-xl md:text-2xl font-black font-mono leading-none">{timeLeft.days}</span>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Dias</span>
                    </div>
                  </div>

                  <span className="text-lg font-bold text-indigo-400 animate-pulse font-mono">:</span>

                  {/* Hours */}
                  <div className="flex flex-col items-center">
                    <div className="w-13 h-13 md:w-15 md:h-15 bg-white text-slate-900 rounded-xl flex flex-col items-center justify-center shadow-lg">
                      <span className="text-xl md:text-2xl font-black font-mono leading-none">
                        {String(timeLeft.hours).padStart(2, "0")}
                      </span>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Horas</span>
                    </div>
                  </div>

                  <span className="text-lg font-bold text-indigo-400 animate-pulse font-mono">:</span>

                  {/* Minutes */}
                  <div className="flex flex-col items-center">
                    <div className="w-13 h-13 md:w-15 md:h-15 bg-white text-slate-900 rounded-xl flex flex-col items-center justify-center shadow-lg">
                      <span className="text-xl md:text-2xl font-black font-mono leading-none">
                        {String(timeLeft.minutes).padStart(2, "0")}
                      </span>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Min</span>
                    </div>
                  </div>

                  <span className="text-lg font-bold text-indigo-500/40 animate-pulse font-mono">:</span>

                  {/* Seconds */}
                  <div className="flex flex-col items-center">
                    <div className="w-13 h-13 md:w-15 md:h-15 bg-indigo-500/25 border border-indigo-400/25 text-indigo-300 rounded-xl flex flex-col items-center justify-center">
                      <span className="text-xl md:text-2xl font-black font-mono leading-none">
                        {String(timeLeft.seconds).padStart(2, "0")}
                      </span>
                      <span className="text-[8px] text-indigo-400 font-black uppercase tracking-widest mt-0.5">Seg</span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 font-medium">
                  Até o dia {firstDest.dates.split("-")[0].trim() || "de início"} às {firstDest.checkInTime || "15:00"}h
                </div>
              </>
            )}

            {timeLeft.status === "ongoing" && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-3 py-4 w-full"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 mx-auto animate-pulse">
                  <CheckCircle2 className="w-6 h-6 animate-spin-slow" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black text-emerald-400">A Viagem Começou! 🎉</h4>
                  <p className="text-[11px] text-slate-300 max-w-xs font-medium mx-auto">
                    Você já está no período de hospedagem / escala em <span className="text-white font-bold">{firstDest.city}</span>!
                  </p>
                </div>
                <div className="text-[10px] text-slate-400 font-semibold bg-white/5 py-1 px-2.5 rounded-lg inline-block select-none">
                  Aproveite cada momento ! ✈️
                </div>
              </motion.div>
            )}

            {timeLeft.status === "completed" && (
              <div className="space-y-3 py-4 text-slate-300">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 mx-auto">
                  <Plane className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-slate-200">Roteiro Concluído! ✈️</h4>
                  <p className="text-[11px] text-slate-400 font-medium max-w-[240px] mx-auto">
                    Esta estada em {firstDest.city} terminou. Esperamos que tenha aproveitado ao máximo!
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
