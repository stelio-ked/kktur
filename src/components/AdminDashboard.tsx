import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Trash2, 
  Search, 
  Users, 
  DollarSign, 
  MapPin, 
  Plane, 
  FileText, 
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
  Info,
  Activity,
  History,
  Pencil,
  Plus,
  UserPlus,
  Check,
  X
} from "lucide-react";
import { Traveler, CostItem, Destination, FlightInfo, TravelDocument } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface AdminDashboardProps {
  travelers: Traveler[];
  onRemoveTraveler: (id: string) => void;
  onAddTraveler?: (name: string, email?: string, role?: string) => void;
  onEditTraveler?: (id: string, name: string, email?: string, role?: string) => void;
  costs: CostItem[];
  onRemoveCost: (id: string) => void;
  destinations: Destination[];
  onRemoveDestination: (id: string) => void;
  flights: FlightInfo[];
  onRemoveFlight: (id: string) => void;
  documents: TravelDocument[];
  onRemoveDocument: (id: string) => void;
  currentUser?: { email?: string; name?: string } | null;
  transactionLogs?: any[];
  itineraryId?: string | number;
  token?: string | null;
}

type AdminTab = "travelers" | "costs" | "destinations" | "flights" | "documents" | "logs" | "access_logs";

export default function AdminDashboard({
  travelers,
  onRemoveTraveler,
  onAddTraveler,
  onEditTraveler,
  costs,
  onRemoveCost,
  destinations,
  onRemoveDestination,
  flights,
  onRemoveFlight,
  documents,
  onRemoveDocument,
  currentUser,
  transactionLogs = [],
  itineraryId,
  token
}: AdminDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>("travelers");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New Traveler Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("Viajante");

  // Edit Traveler State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("Viajante");
  
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [loadingAccessLogs, setLoadingAccessLogs] = useState(false);

  const handleCreateTravelerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !onAddTraveler) return;
    onAddTraveler(newName.trim(), newEmail.trim() || undefined, newRole);
    setNewName("");
    setNewEmail("");
    setNewRole("Viajante");
    setShowAddForm(false);
  };

  const handleStartEdit = (t: Traveler) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditEmail(t.email || "");
    setEditRole(t.role || "Viajante");
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim() || !onEditTraveler) return;
    onEditTraveler(id, editName.trim(), editEmail.trim() || undefined, editRole);
    setEditingId(null);
  };

  useEffect(() => {
    if (activeSubTab === "access_logs" && itineraryId && token) {
      setLoadingAccessLogs(true);
      fetch(`/api/itineraries/${encodeURIComponent(itineraryId)}/access_logs`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.logs) {
          setAccessLogs(data.logs);
        }
      })
      .catch(err => console.error("Error fetching access logs:", err))
      .finally(() => setLoadingAccessLogs(false));
    }
  }, [activeSubTab, itineraryId, token]);

  // Filter lists based on search
  const filteredTravelers = travelers.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (t.email && t.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (t.role && t.role.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredCosts = costs.filter(c => 
    c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.createdByEmail && c.createdByEmail.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredDestinations = destinations.filter(d => 
    d.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.hotelName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFlights = flights.filter(f => 
    f.airline.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.flightCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.departureCity.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.arrivalCity.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDocuments = documents.filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.passengerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = (transactionLogs || []).filter(l => 
    l.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.itemType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.itemId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.itemDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.timestamp.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTriggerDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const handleExecuteDelete = (id: string) => {
    if (activeSubTab === "travelers") {
      onRemoveTraveler(id);
    } else if (activeSubTab === "costs") {
      onRemoveCost(id);
    } else if (activeSubTab === "destinations") {
      onRemoveDestination(id);
    } else if (activeSubTab === "flights") {
      onRemoveFlight(id);
    } else if (activeSubTab === "documents") {
      onRemoveDocument(id);
    }
    setConfirmDeleteId(null);
  };

  // Stats calculation
  const totalTravelers = travelers.length;
  const totalCostBRL = costs.reduce((sum, item) => sum + item.totalCostBRL, 0);
  const totalDestinations = destinations.length;
  const totalFlights = flights.length;
  const totalDocuments = documents.length;

  return (
    <div id="admin-dashboard-container" className="space-y-6">
      
      {/* Welcome & Stats Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-indigo-500/25 border border-indigo-400 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Administrador Do Portal
            </span>
            <span className="bg-emerald-500/25 border border-emerald-400 text-emerald-200 px-2 py-1 rounded-full text-[10px] font-bold uppercase">
              Acesso Total
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight">Painel de Controle Centralizado</h2>
          <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-xl">
            Como Administrador, você possui permissões privilegiadas para auditar e excluir qualquer recurso ou cadastro
            associado a esta viagem de forma centralizada.
          </p>
        </div>
        
        {/* Quick Bento Stats Widget */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 shrink-0">
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/5 text-center min-w-[70px]">
            <Users className="w-4 h-4 text-indigo-300 mx-auto mb-1" />
            <div className="text-lg font-black">{totalTravelers}</div>
            <div className="text-[10px] text-slate-400 font-extrabold uppercase">Membros</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/5 text-center min-w-[70px]">
            <DollarSign className="w-4 h-4 text-emerald-300 mx-auto mb-1" />
            <div className="text-lg font-black text-emerald-300">R$ {totalCostBRL.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            <div className="text-[10px] text-slate-400 font-extrabold uppercase">Custos</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/5 text-center min-w-[70px]">
            <MapPin className="w-4 h-4 text-rose-300 mx-auto mb-1" />
            <div className="text-lg font-black">{totalDestinations}</div>
            <div className="text-[10px] text-slate-400 font-extrabold uppercase">Destinos</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/5 text-center min-w-[70px]">
            <Plane className="w-4 h-4 text-cyan-300 mx-auto mb-1" />
            <div className="text-lg font-black">{totalFlights}</div>
            <div className="text-[10px] text-slate-400 font-extrabold uppercase">Voos</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/5 text-center min-w-[70px] col-span-2 sm:col-span-1">
            <FileText className="w-4 h-4 text-amber-300 mx-auto mb-1" />
            <div className="text-lg font-black">{totalDocuments}</div>
            <div className="text-[10px] text-slate-400 font-extrabold uppercase">Docs</div>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Navigation & Search Tool */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-4">
          {/* Bento Subtabs with explicit wrap gaps to prevent overflow or truncation */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 w-full pb-1">
            {[
              { id: "travelers", label: "Membros", icon: Users, count: travelers.length },
              { id: "costs", label: "Despesas", icon: DollarSign, count: costs.length },
              { id: "destinations", label: "Destinos", icon: MapPin, count: destinations.length },
              { id: "flights", label: "Voos", icon: Plane, count: flights.length },
              { id: "documents", label: "Cofre Docs", icon: FileText, count: documents.length },
              { id: "logs", label: "Logs de Auditoria", icon: Activity, count: transactionLogs.length },
              { id: "access_logs", label: "Acessos", icon: History, count: accessLogs.length || 0 }
            ].map((subTab) => {
              const Icon = subTab.icon;
              const isSelected = activeSubTab === subTab.id;
              return (
                <button
                  key={subTab.id}
                  onClick={() => {
                    setActiveSubTab(subTab.id as AdminTab);
                    setSearchQuery("");
                    setConfirmDeleteId(null);
                  }}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
                    isSelected 
                      ? "bg-slate-900 text-white shadow-xs" 
                      : "text-slate-650 hover:bg-slate-200/60 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{subTab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    {subTab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search on its own explicit line below */}
          <div className="w-full pt-1 border-t border-slate-100">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={`Buscar em ${activeSubTab === "travelers" ? "membros" : activeSubTab === "costs" ? "despesas" : activeSubTab === "destinations" ? "destinos" : activeSubTab === "flights" ? "voos" : activeSubTab === "documents" ? "documentos" : "logs"}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-505 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Content Lists */}
        <div className="p-4 md:p-6 min-h-[350px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSubTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {/* Category: TRAVELERS */}
              {activeSubTab === "travelers" && (
                <div className="space-y-4">
                  <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <p className="text-slate-600 text-xs leading-relaxed">
                        Gerenciamento centralizado de membros e permissões de acesso da viagem. Altere nomes, e-mails e níveis de acesso (Administrador, Organizador, Viajante, Co-piloto, etc) em tempo real.
                      </p>
                    </div>
                    {onAddTraveler && (
                      <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                      >
                        {showAddForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                        <span>{showAddForm ? "Cancelar" : "Adicionar Usuário / Viajante"}</span>
                      </button>
                    )}
                  </div>

                  {/* Add New Traveler Form */}
                  {showAddForm && (
                    <motion.form 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleCreateTravelerSubmit}
                      className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-md space-y-3"
                    >
                      <div className="flex items-center gap-2 border-b border-indigo-50 pb-2">
                        <UserPlus className="w-4 h-4 text-indigo-600" />
                        <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">Novo Cadastro de Viajante / Usuário</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nome Completo</label>
                          <input
                            type="text"
                            placeholder="Ex: Maria Silva"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">E-mail de Acesso (Opcional)</label>
                          <input
                            type="email"
                            placeholder="exemplo@email.com"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cargo / Nível de Acesso</label>
                          <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="Administrador">Administrador (Acesso Total)</option>
                            <option value="Organizador">Organizador (Coordenação)</option>
                            <option value="Viajante">Viajante (Participante)</option>
                            <option value="Co-piloto">Co-piloto (Edição de Roteiro)</option>
                            <option value="Finanças">Finanças (Gestão Financeira)</option>
                            <option value="Colaborador">Colaborador (Dicas e Notas)</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                        >
                          Salvar Novo Viajante
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {filteredTravelers.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-xs font-bold">Nenhum membro encontrado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredTravelers.map((traveler) => (
                        <div 
                          key={traveler.id} 
                          className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors"
                        >
                          {editingId === traveler.id ? (
                            <div className="space-y-3 bg-white p-3 rounded-lg border border-indigo-200">
                              <p className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider">Editando Viajante / Usuário</p>
                              <div className="grid grid-cols-1 gap-2">
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Nome</label>
                                  <input 
                                    type="text" 
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white font-medium text-slate-800"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">E-mail</label>
                                  <input 
                                    type="email" 
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white text-slate-800"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Função / Cargo</label>
                                  <select
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white font-bold text-slate-800 cursor-pointer"
                                  >
                                    <option value="Administrador">Administrador</option>
                                    <option value="Organizador">Organizador</option>
                                    <option value="Viajante">Viajante</option>
                                    <option value="Co-piloto">Co-piloto</option>
                                    <option value="Finanças">Finanças</option>
                                    <option value="Colaborador">Colaborador</option>
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(traveler.id)}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" /> Salvar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-extrabold flex items-center justify-center text-sm shrink-0">
                                  {traveler.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-xs text-slate-800 flex items-center gap-2 flex-wrap">
                                    <span className="truncate">{traveler.name}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                      traveler.role === "Administrador" 
                                        ? "bg-slate-900 text-white" 
                                        : traveler.role === "Organizador" 
                                          ? "bg-indigo-100 text-indigo-800" 
                                          : traveler.role === "Co-piloto"
                                            ? "bg-amber-100 text-amber-800"
                                            : traveler.role === "Finanças"
                                              ? "bg-emerald-100 text-emerald-800"
                                              : "bg-slate-200 text-slate-700"
                                    }`}>
                                      {traveler.role || "Viajante"}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">{traveler.email || "E-mail não cadastrado"}</div>
                                  {traveler.createdByEmail && (
                                    <div className="text-[9px] text-slate-400 mt-0.5 truncate">Convidado por: {traveler.createdByEmail}</div>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                {onEditTraveler && (
                                  <button
                                    onClick={() => handleStartEdit(traveler)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                    title="Editar dados e cargo"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {confirmDeleteId === traveler.id ? (
                                  <div className="flex items-center gap-1.5 animate-pulse bg-white/85 p-1 rounded-lg border border-rose-200">
                                    <span className="text-[9px] text-rose-600 font-black uppercase px-1">Excluir?</span>
                                    <button 
                                      onClick={() => handleExecuteDelete(traveler.id)}
                                      className="px-2 py-1 bg-rose-600 text-white rounded-md text-[10px] font-bold hover:bg-rose-700 transition"
                                    >
                                      Sim
                                    </button>
                                    <button 
                                      onClick={handleCancelDelete}
                                      className="px-2 py-1 bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold hover:bg-slate-350 transition"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleTriggerDelete(traveler.id)}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Excluir membro"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Category: COSTS */}
              {activeSubTab === "costs" && (
                <div className="space-y-3">
                  <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100 flex items-start gap-2.5 mb-4">
                    <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Auditoria centralizada do fluxo de finanças da viagem. Como Administrador, você pode expurgar qualquer
                      custo incorreto, rascunho ou duplicado inserido por qualquer participante.
                    </p>
                  </div>

                  {filteredCosts.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-xs font-bold">Nenhuma despesa correspondente encontrada.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-100 rounded-xl bg-slate-50">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 text-[10px] font-black uppercase bg-slate-100/70">
                            <th className="p-3 pl-4">Descrição</th>
                            <th className="p-3">Categoria</th>
                            <th className="p-3">Valor</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Criado Por</th>
                            <th className="p-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {filteredCosts.map((cost) => (
                            <tr key={cost.id} className="hover:bg-indigo-50/20 transition-colors">
                              <td className="p-3 pl-4 font-bold text-slate-800">
                                {cost.description}
                                {cost.notes && <div className="text-[10px] text-slate-450 font-normal">{cost.notes}</div>}
                              </td>
                              <td className="p-3 text-slate-500">
                                <span className="inline-block px-2 py-0.5 rounded-md bg-slate-200 text-[10px] font-bold uppercase">
                                  {cost.category}
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-slate-900">
                                R$ {cost.totalCostBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  cost.status === "Pago" 
                                    ? "bg-emerald-100 text-emerald-800" 
                                    : cost.status === "Pgto no local" 
                                      ? "bg-amber-100 text-amber-800" 
                                      : "bg-rose-100 text-rose-800"
                                }`}>
                                  {cost.status}
                                </span>
                              </td>
                              <td className="p-3 text-slate-500 text-[10px]">
                                {cost.createdByEmail || "Dono da Viagem"}
                              </td>
                              <td className="p-3 text-right">
                                {confirmDeleteId === cost.id ? (
                                  <div className="inline-flex items-center gap-1.5 bg-white p-1 rounded-lg border border-rose-250 animate-pulse">
                                    <button 
                                      onClick={() => handleExecuteDelete(cost.id)}
                                      className="px-2 py-1 bg-rose-600 text-white rounded-md text-[9px] font-bold hover:bg-rose-700 transition"
                                    >
                                      Sim
                                    </button>
                                    <button 
                                      onClick={handleCancelDelete}
                                      className="px-2 py-1 bg-slate-200 text-slate-700 rounded-md text-[9px] font-bold hover:bg-slate-350 transition"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleTriggerDelete(cost.id)}
                                    className="p-1.5 text-slate-450 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Excluir custo"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category: DESTINATIONS */}
              {activeSubTab === "destinations" && (
                <div className="space-y-3">
                  <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100 flex items-start gap-2.5 mb-4">
                    <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Gerenciamento centralizado do itinerário geográfico. Excluir um destino removerá também todos os dias,
                      atividades e coordenadas vinculadas àquela localidade. Use com parcimônia extrema.
                    </p>
                  </div>

                  {filteredDestinations.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-xs font-bold">Nenhum destino encontrado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredDestinations.map((dest) => (
                        <div 
                          key={dest.id} 
                          className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors flex justify-between gap-4"
                        >
                          <div>
                            <h3 className="font-extrabold text-slate-800 text-sm">{dest.city}, {dest.state}</h3>
                            <p className="text-slate-500 text-xs font-medium">{dest.country} • {dest.dates}</p>
                            <div className="mt-2 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-150 inline-block">
                              <span className="font-extrabold">Hospedagem:</span> {dest.hotelName}
                            </div>
                            {dest.createdByEmail && (
                              <div className="text-[9px] text-slate-400 mt-2">Criado por: {dest.createdByEmail}</div>
                            )}
                          </div>

                          <div className="self-center">
                            {confirmDeleteId === dest.id ? (
                              <div className="flex flex-col gap-1 bg-white p-2 rounded-lg border border-rose-200 animate-pulse text-center min-w-[100px]">
                                <span className="text-[9px] text-rose-600 font-extrabold uppercase mb-1 block">Confirmar?</span>
                                <div className="flex gap-1 justify-center">
                                  <button 
                                    onClick={() => handleExecuteDelete(dest.id)}
                                    className="px-2 py-1 bg-rose-600 text-white rounded-md text-[10px] font-bold hover:bg-rose-700 transition"
                                  >
                                    Deletar
                                  </button>
                                  <button 
                                    onClick={handleCancelDelete}
                                    className="px-2 py-1 bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold hover:bg-slate-350 transition"
                                  >
                                    Não
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleTriggerDelete(dest.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-150"
                                title="Excluir destino completo"
                              >
                                <Trash2 className="w-4 h-4 text-rose-500" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Category: FLIGHTS */}
              {activeSubTab === "flights" && (
                <div className="space-y-3">
                  <div className="bg-cyan-50/50 rounded-xl p-3 border border-cyan-100 flex items-start gap-2.5 mb-4">
                    <Info className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Gerenciamento centralizado de trechos e passagens aéreas registradas. Um clique exclui o voo do painel
                      de voos global e de sua timeline de monitoração automática.
                    </p>
                  </div>

                  {filteredFlights.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <Plane className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-xs font-bold">Nenhum trecho aéreo encontrado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredFlights.map((flight) => (
                        <div 
                          key={flight.id} 
                          className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                              <span>{flight.airline}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-[10px] font-bold">{flight.flightCode}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1">
                              <span className="font-extrabold">{flight.departureCity} ({flight.departureCode})</span> → <span className="font-extrabold">{flight.arrivalCity} ({flight.arrivalCode})</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              Partida: {flight.dateStr} às {flight.departureTime}
                            </div>
                            {flight.createdByEmail && (
                              <div className="text-[9px] text-slate-400 mt-2">Criado por: {flight.createdByEmail}</div>
                            )}
                          </div>

                          <div>
                            {confirmDeleteId === flight.id ? (
                              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-rose-200 animate-pulse">
                                <button 
                                  onClick={() => handleExecuteDelete(flight.id)}
                                  className="px-2 py-1 bg-rose-600 text-white rounded-md text-[9px] font-bold hover:bg-rose-700 transition"
                                >
                                  Sim
                                </button>
                                <button 
                                  onClick={handleCancelDelete}
                                  className="px-1.5 py-1 bg-slate-200 text-slate-700 rounded-md text-[9px] font-bold hover:bg-slate-350 transition"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleTriggerDelete(flight.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Excluir trecho de voo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Category: DOCUMENTS */}
              {activeSubTab === "documents" && (
                <div className="space-y-3">
                  <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100 flex items-start gap-2.5 mb-4">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Gerenciamento centralizado do cofre de arquivos e passaportes. Delete qualquer documento impróprio,
                      antigo ou expirado. Isso removerá o PDF/Imagem de forma definitiva do servidor.
                    </p>
                  </div>

                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-xs font-bold">Nenhum documento encontrado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredDocuments.map((doc) => (
                        <div 
                          key={doc.id} 
                          className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-colors flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                              <span>{doc.title}</span>
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-[9px] font-black uppercase">
                                {doc.type}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-505 mt-0.5">Pax: {doc.passengerName}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Sincronizado em: {doc.uploadedAt}</p>
                            {doc.createdByEmail && (
                              <div className="text-[9px] text-slate-400 mt-1">Enviado por: {doc.createdByEmail}</div>
                            )}
                          </div>

                          <div>
                            {confirmDeleteId === doc.id ? (
                              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-rose-200 animate-pulse">
                                <button 
                                  onClick={() => handleExecuteDelete(doc.id)}
                                  className="px-2 py-1 bg-rose-600 text-white rounded-md text-[9px] font-bold hover:bg-rose-700 transition"
                                >
                                  Sim
                                </button>
                                <button 
                                  onClick={handleCancelDelete}
                                  className="px-1.5 py-1 bg-slate-200 text-slate-700 rounded-md text-[9px] font-bold hover:bg-slate-350 transition"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleTriggerDelete(doc.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Excluir documento permanentemente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Category: LOGS */}
              {activeSubTab === "logs" && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-slate-705 uppercase tracking-wider">Log de Transações Centralizado (Huso Horário de Brasília)</h4>
                      <p className="text-slate-550 text-[11px] leading-relaxed mt-0.5 font-medium">
                        Histórico completo das modificações feitas para este itinerário de viagem por administradores, organizadores e viajantes autorizados.
                      </p>
                    </div>
                  </div>

                  {filteredLogs.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      <Activity className="w-10 h-10 text-slate-300 mx-auto mb-2 opacity-50" />
                      <p className="text-slate-500 text-xs font-bold">Nenhum log de transações encontrado.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-150 rounded-2xl bg-white shadow-2xs">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="border-b border-slate-150 text-slate-400 text-[10px] font-black uppercase bg-slate-50/50">
                            <th className="p-3.5 pl-4">Horário (Brasília)</th>
                            <th className="p-3.5">Usuário / Quem Alterou</th>
                            <th className="p-3.5">Ação</th>
                            <th className="p-3.5">Tipo do Recurso</th>
                            <th className="p-3.5">Identificador do Item</th>
                            <th className="p-3.5 pr-4">Descrição Auxiliar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {filteredLogs.map((log) => {
                            let actionColor = "bg-slate-100 text-slate-700";
                            if (log.action === "Adicionado") actionColor = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                            else if (log.action === "Alterado") actionColor = "bg-amber-50 text-amber-700 border border-amber-100";
                            else if (log.action === "Excluído") actionColor = "bg-rose-50 text-rose-700 border border-rose-100";

                            let resourceColor = "text-slate-500";
                            if (log.itemType === "Membro") resourceColor = "text-indigo-600 font-bold";
                            else if (log.itemType === "Despesa") resourceColor = "text-emerald-600 font-bold";
                            else if (log.itemType === "Destino") resourceColor = "text-rose-600 font-bold";
                            else if (log.itemType === "Voo") resourceColor = "text-cyan-600 font-bold";
                            else if (log.itemType === "Documento") resourceColor = "text-orange-600 font-bold";

                            return (
                              <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                                <td className="p-3.5 pl-4 font-mono font-extrabold text-[11px] text-slate-500 whitespace-nowrap">
                                  {log.timestamp}
                                </td>
                                <td className="p-3.5">
                                  <div className="font-extrabold text-slate-700 text-[11px] truncate max-w-[200px]" title={log.user}>
                                    {log.user}
                                  </div>
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${actionColor}`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="p-3.5">
                                  <span className={`text-[11px] ${resourceColor}`}>
                                    {log.itemType}
                                  </span>
                                </td>
                                <td className="p-3.5 font-mono font-bold text-[10px] text-slate-450">
                                  {log.itemId}
                                </td>
                                <td className="p-3.5 pr-4 text-slate-600 font-medium max-w-[280px] truncate" title={log.itemDesc}>
                                  {log.itemDesc}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Category: ACCESS LOGS */}
              {activeSubTab === "access_logs" && (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-indigo-800 uppercase tracking-wider">Histórico de Acessos</h4>
                      <p className="text-indigo-600 text-[11px] leading-relaxed mt-0.5 font-medium">
                        Veja quem e quando acessou (visualizou ou sincronizou) esta viagem. Auditoria de acessos para segurança.
                      </p>
                    </div>
                  </div>

                  {loadingAccessLogs ? (
                    <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto mb-2"></div>
                      <p className="text-slate-500 text-xs font-bold">Carregando logs de acesso...</p>
                    </div>
                  ) : accessLogs.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      <History className="w-10 h-10 text-slate-300 mx-auto mb-2 opacity-50" />
                      <p className="text-slate-500 text-xs font-bold">Nenhum acesso registrado recentemente.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-150 rounded-2xl bg-white shadow-2xs">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="border-b border-slate-150 text-slate-400 text-[10px] font-black uppercase bg-slate-50/50">
                            <th className="p-3.5 pl-4">Data de Acesso</th>
                            <th className="p-3.5">E-mail do Usuário</th>
                            <th className="p-3.5">Endereço IP</th>
                            <th className="p-3.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {accessLogs.map((log) => {
                            const date = new Date(log.attemptedAt);
                            const formattedDate = date.toLocaleString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            });

                            return (
                              <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                                <td className="p-3.5 pl-4 font-mono font-extrabold text-[11px] text-slate-500 whitespace-nowrap">
                                  {formattedDate}
                                </td>
                                <td className="p-3.5">
                                  <div className="font-extrabold text-slate-800 text-[11px]">
                                    {log.userEmail}
                                  </div>
                                </td>
                                <td className="p-3.5">
                                  <div className="font-mono font-bold text-[10px] text-slate-500">
                                    {log.ipAddress || "Desconhecido"}
                                  </div>
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${log.status === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
                                    {log.status === "success" ? "Autorizado" : "Negado"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
