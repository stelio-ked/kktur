import React, { useState, useEffect } from "react";
import { auth, googleProvider } from "../utils/firebase";
import { signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { 
  Lock, 
  User, 
  LogIn, 
  UserPlus, 
  Compass, 
  Sparkles, 
  AlertCircle, 
  Mail, 
  Key, 
  ArrowLeft, 
  RefreshCw, 
  Inbox, 
  CheckCircle2, 
  Eye, 
  EyeOff 
} from "lucide-react";

interface LoginScreenProps {
  onLogin: (token: string, user: any) => void;
  onTravelerLogin: (email: string, linkedItineraries: any[], hasPassword?: boolean, isFirstAccess?: boolean) => void;
}

export default function LoginScreen({ onLogin, onTravelerLogin }: LoginScreenProps) {
  // Mode selection: "planner" | "traveler"
  const [accessMode, setAccessMode] = useState<"planner" | "traveler">("planner");
  
  // Organizer state (Standard credentials)
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  
  // Travelers tab state
  const [travelerEmail, setTravelerEmail] = useState("");

  // Google Sign-In / Password Setup states
  const [useGoogle, setUseGoogle] = useState(false);
  const [googleFlowMode, setGoogleFlowMode] = useState<"simulated" | "real">("simulated");
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleName, setGoogleName] = useState("");
  const [googleIsRegister, setGoogleIsRegister] = useState(false);
  
  // Mailbox simulator state
  const [simulatedEmails, setSimulatedEmails] = useState<any[]>([]);
  const [selectedSimulatedEmail, setSelectedSimulatedEmail] = useState<any | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  // Secure Password Setup Mode (accessed via email link)
  const [setupPasswordMode, setSetupPasswordMode] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupName, setSetupName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  
  // General view states
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch simulated emails for active input
  const fetchSimulatedEmails = async (targetEmail: string) => {
    if (!targetEmail || !targetEmail.includes("@")) return;
    try {
      const res = await fetch(`/api/dev/last-emails?email=${encodeURIComponent(targetEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setSimulatedEmails(data);
      }
    } catch (err) {
      console.error("Error fetching simulated emails:", err);
    }
  };

  // Poll for simulated e-mails when Google login/signup is active
  useEffect(() => {
    let emailToPoll = useGoogle ? googleEmail : "";
    if (setupPasswordMode) {
      emailToPoll = setupEmail;
    }
    
    if (emailToPoll && emailToPoll.toLowerCase().endsWith("@gmail.com")) {
      fetchSimulatedEmails(emailToPoll);
      const interval = setInterval(() => {
        fetchSimulatedEmails(emailToPoll);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [useGoogle, googleEmail, setupPasswordMode, setupEmail]);

  // Intercepting / Setup link from URL search query on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const token = params.get("token");
    if (action === "setup_password" && token) {
      handleActivateToken(token);
      // Clear query params to make UI clean
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Handle redirect result for Mobile Safari/Chrome where popup is converted to redirect
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          setLoading(true);
          const fbUser = result.user;
          if (!fbUser.email) throw new Error("Sem e-mail do Firebase.");

          const res = await fetch("/api/auth/firebase-google-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: fbUser.email,
              name: fbUser.displayName || fbUser.email.split("@")[0],
              firebaseUid: fbUser.uid
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Erro Google Server.");
          
          localStorage.setItem("auth_token", data.token);
          onLogin(data.token, data.user);
        }
      } catch (err: any) {
        console.error("Firebase Redirect Error:", err);
        setError(err.message || "Erro durante o login via redirecionamento Google.");
      } finally {
        setLoading(false);
      }
    };
    handleRedirect();
  }, [onLogin]);

  const handleSubmitOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister ? { email, name, password } : { email, password };
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Erro de autenticação para Organizador");
      }
      
      localStorage.setItem("auth_token", data.token);
      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFirebaseGoogleLogin = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      if (!fbUser.email) {
        throw new Error("Não foi possível obter o e-mail da conta Google através do Firebase.");
      }

      const res = await fetch("/api/auth/firebase-google-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fbUser.email,
          name: fbUser.displayName || fbUser.email.split("@")[0],
          firebaseUid: fbUser.uid
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao autenticar a sessão do Google com o servidor.");
      }

      localStorage.setItem("auth_token", data.token);
      onLogin(data.token, data.user);
    } catch (err: any) {
      console.error("Firebase Auth Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("O login foi cancelado. A janela de autenticação do Google foi fechada.");
      } else {
        setError(err.message || "Falha na autenticação via Firebase Google Auth.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmail.toLowerCase().endsWith("@gmail.com")) {
      setError("Por favor, digite uma conta de e-mail do Google (@gmail.com) válida.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/gmail-google-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: googleEmail })
      });
      const data = await res.json();
      
      if (!res.ok) {
        // If account isn't registered, offer to register with quick selection
        if (res.status === 404) {
          setError("Esta conta do Gmail não foi encontrada como organizador. Deseja criá-la? Clique em 'Criar Conta com Gmail' abaixo.");
          setGoogleIsRegister(true);
          return;
        }
        // Force immediate fetch of emails because the server just sent a simulated password setup token
        fetchSimulatedEmails(googleEmail);
        throw new Error(data.error || "Erro no login federado");
      }
      
      localStorage.setItem("auth_token", data.token);
      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
      fetchSimulatedEmails(googleEmail);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmail.toLowerCase().endsWith("@gmail.com")) {
      setError("Por favor, digite um e-mail do @gmail.com de sua posse.");
      return;
    }
    if (!googleName.trim()) {
      setError("Por favor, informe seu nome.");
      return;
    }

    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/gmail-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: googleEmail, name: googleName })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Erro na solicitação de cadastro via Google");
      }
      
      setSuccessMsg("Link de ativação gerado! O link para criar sua senha de organizador de forma segura foi enviado para sua caixa postal simulada do Gmail do Google.");
      fetchSimulatedEmails(googleEmail);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateToken = async (tokenVal: string) => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/gmail-verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenVal })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Token inválido");
      }
      
      setSetupToken(tokenVal);
      setSetupEmail(data.email);
      setSetupName(data.name);
      setSetupPasswordMode(true);
      setSelectedSimulatedEmail(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("As senhas informadas não coincidem. Certifique-se de preencher dados idênticos.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A senha escolhida precisa conter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/gmail-set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: setupToken, password: newPassword })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Tentativa de confirmação falhou.");
      }
      
      localStorage.setItem("auth_token", data.token);
      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!travelerEmail.trim()) {
      setError("Por favor, digite seu endereço de e-mail de viajante.");
      return;
    }
    setError("");
    setLoading(true);
    
    try {
      const res = await fetch("/api/traveler/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: travelerEmail })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Erro ao consultar as viagens para este viajante.");
      }
      
      // Successfully authenticated traveler via linked email!
      onTravelerLogin(data.email, data.itineraries, data.hasPassword, data.isFirstAccess);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 transition-all duration-300">
        
        {/* Top Banner */}
        <div className="bg-indigo-650 bg-gradient-to-br from-indigo-600 to-slate-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl transform translate-x-8 -translate-y-8" />
          <Compass className="w-12 h-12 text-white mx-auto mb-4 animate-bounce" />
          <h2 className="text-2xl font-black text-white tracking-tight">KK TUR Diário de Bordo</h2>
          <p className="text-indigo-200 text-xs font-semibold mt-2">
            Seu planejador de viagens inteligente e copilotado
          </p>
        </div>

        {/* Access Role Switcher Tab Controls (Decoupled & untouchable for traveler rule) */}
        {!setupPasswordMode && (
          <div className="flex border-b border-slate-200 p-2 bg-slate-50/50">
            <button
              type="button"
              onClick={() => {
                setAccessMode("planner");
                setError("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                accessMode === "planner"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Organizador</span>
            </button>
            <button
              type="button"
              id="traveler-linked-access-tab-btn"
              onClick={() => {
                setAccessMode("traveler");
                setError("");
                setSuccessMsg("");
              }}
              className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                accessMode === "traveler"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <User className="w-4 h-4" />
              <span>Viajante Vinculado</span>
            </button>
          </div>
        )}
        
        {/* Render Form */}
        <div className="p-8 space-y-6">
          {error && (
            <div className="bg-rose-50 text-rose-800 p-4 rounded-2xl text-xs font-bold border border-rose-100 flex items-start gap-2.5 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl text-xs font-bold border border-emerald-100 flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* PASSWORD SETUP MODE STATE */}
          {setupPasswordMode ? (
            <form onSubmit={handleSavePassword} className="space-y-4 animate-fadeIn">
              <div className="text-center space-y-1">
                <span className="inline-flex p-3 bg-indigo-50 text-indigo-650 rounded-full mb-2">
                  <Key className="w-6 h-6 animate-pulse" />
                </span>
                <h3 className="text-base font-black text-slate-800">Crie Sua Senha de Acesso</h3>
                <p className="text-slate-500 text-xs font-medium">
                  Olá, <strong className="text-indigo-650">{setupName}</strong>. Defina uma senha forte de organizador para seu e-mail <span className="underline">{setupEmail}</span>.
                </p>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Digite Nova Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showNewPass ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold text-slate-800"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Confirme Nova Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showNewPass ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold text-slate-800"
                    placeholder="Repita a senha longa"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3.5 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 hover:scale-[1.01] disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Salvar Senha e Entrar"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetupPasswordMode(false);
                  setSetupToken("");
                  setError("");
                  setSuccessMsg("");
                }}
                className="w-full text-slate-500 hover:text-slate-800 font-black text-xs py-2 text-center cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar para o início</span>
              </button>
            </form>
          ) : (
            <>
              {/* ORGANIZER ACCESS FLOW */}
              {accessMode === "planner" ? (
                <>
                  {useGoogle ? (
                    /* GOOGLE GMAIL FLOW (REAL SECURE FIREBASE PROVIDER & SIMULATED SANDBOX DUAL-MODE) */
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                          <span className="text-[10px] font-black tracking-widest text-slate-450 uppercase">Autenticação Google</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUseGoogle(false);
                            setError("");
                            setSuccessMsg("");
                          }}
                          className="text-xs text-indigo-650 font-black hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          <span>Senha Padrão</span>
                        </button>
                      </div>

                      {/* Google Auth Modality Selector */}
                      <div className="flex border border-slate-200 p-1 bg-slate-50/80 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setGoogleFlowMode("simulated");
                            setError("");
                            setSuccessMsg("");
                          }}
                          className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center ${
                            googleFlowMode === "simulated"
                              ? "bg-white text-indigo-700 shadow-xs border border-indigo-100"
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <span>Modo Simulador</span>
                          <span className="text-[8px] opacity-75 font-normal tracking-tight">Recomendado na pré-visualização</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGoogleFlowMode("real");
                            setError("");
                            setSuccessMsg("");
                          }}
                          className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center ${
                            googleFlowMode === "real"
                              ? "bg-white text-indigo-700 shadow-xs border border-indigo-100"
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <span>Provedor Real</span>
                          <span className="text-[8px] opacity-75 font-normal tracking-tight">Requer abrir em nova guia</span>
                        </button>
                      </div>

                      {googleFlowMode === "simulated" ? (
                        /* SIMULATED HIGH-FIDELITY GMAIL SANDBOX IMPLEMENTATION */
                        <div className="space-y-4">
                          <div className="p-3 bg-red-50/50 border border-red-100 rounded-2xl text-[11px] font-semibold text-slate-600 leading-relaxed space-y-1.5">
                            <div className="flex items-center gap-1.5 text-red-800 font-extrabold text-[12px]">
                              <Inbox className="w-4 h-4 text-red-500 shrink-0" />
                              <span>Ambiente de Sandbox Conectado</span>
                            </div>
                            <p>
                              Digite seu e-mail do Gmail para simular o comportamento exato de um login OAuth com token seguro. A caixa de entrada simulada aparecerá no rodapé desta tela!
                            </p>
                          </div>

                          <form onSubmit={googleIsRegister ? handleGoogleSignup : handleGoogleLogin} className="space-y-3.5">
                            <div className="space-y-1.5">
                              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">E-mail do Google (@gmail.com)</label>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                  type="email"
                                  required
                                  value={googleEmail}
                                  onChange={e => setGoogleEmail(e.target.value)}
                                  className="w-full pl-10 pr-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold text-slate-800"
                                  placeholder="nome.usuario@gmail.com"
                                />
                              </div>
                            </div>

                            {googleIsRegister && (
                              <div className="space-y-1.5 animate-fadeIn">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome do Organizador</label>
                                <div className="relative">
                                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <input
                                    type="text"
                                    required
                                    value={googleName}
                                    onChange={e => setGoogleName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold text-slate-800"
                                    placeholder="Ex: João da Silva"
                                  />
                                </div>
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full cursor-pointer bg-red-600 hover:bg-red-700 text-white font-black text-xs py-3.5 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 hover:scale-[1.01] disabled:opacity-50"
                            >
                              {loading ? "Processando..." : googleIsRegister ? "Cadastrar com Gmail" : "Validar e Acessar com Google"}
                            </button>

                            <div className="text-center pt-1 border-t border-slate-100 mt-2">
                              {googleIsRegister ? (
                                <p className="text-[11px] text-slate-500 font-bold">
                                  Já possui cadastro de organizador?{" "}
                                  <button
                                    type="button"
                                    onClick={() => { setGoogleIsRegister(false); setError(""); setSuccessMsg(""); }}
                                    className="text-red-650 font-black hover:underline cursor-pointer"
                                  >
                                    Entrar com Gmail
                                  </button>
                                </p>
                              ) : (
                                <p className="text-[11px] text-slate-500 font-bold">
                                  Não encontrou sua conta @gmail.com?{" "}
                                  <button
                                    type="button"
                                    onClick={() => { setGoogleIsRegister(true); setError(""); setSuccessMsg(""); }}
                                    className="text-red-650 font-black hover:underline cursor-pointer"
                                  >
                                    Cadastrar Nova Conta Gmail
                                  </button>
                                </p>
                              )}
                            </div>
                          </form>
                        </div>
                      ) : (
                        /* REAL POPUP FIREBASE AUTH IMPLEMENTATION */
                        <div className="space-y-4">
                          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-[11px] font-semibold text-slate-600 space-y-2 leading-relaxed">
                            <div className="flex items-center gap-1.5 text-indigo-850 font-black">
                              <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                              <span>Autenticação Federada Oficial</span>
                            </div>
                            <p>
                              Acesse sua conta ou crie um novo cadastro instantaneamente utilizando o provedor oficial do Google através do Firebase. 
                            </p>
                            <p className="text-[10px] text-indigo-600 font-extrabold flex items-start gap-1">
                              ⚠️ Nota: Se a janela popup não abrir, certifique-se de permitir popups nas configurações do navegador ou abra o aplicativo em uma **Nova Guia** para contornar as restrições de iframe.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={handleFirebaseGoogleLogin}
                            disabled={loading}
                            className="w-full cursor-pointer bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-black text-xs py-3.5 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2.5 hover:scale-[1.01] disabled:opacity-50"
                          >
                            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                              <path
                                fill="#FFFFFF"
                                d="M21.35,11.1H12V12.9H19.6C18.9,14.9 17.1,16.2 15,16.2C12.2,16.2 10,14 10,11.2C10,8.4 12.2,6.2 15,6.2C16.2,6.2 17.3,6.6 18.2,7.4L19.5,6.1C18.3,5 16.7,4.3 15,4.3C10.7,4.3 7.2,7.8 7.2,12.1C7.2,16.4 10.7,19.9 15,19.9C19.1,19.9 22,17 22,12.9C22,12.3 21.9,11.7 21.35,11.1Z"
                              />
                            </svg>
                            <span>{loading ? "Autenticando..." : "Entrar com Conta Google"}</span>
                          </button>

                          <p className="text-center text-[10px] text-slate-400 font-bold italic pt-1">
                            Apenas e-mails terminados em @gmail.com são aceitos pelo sistema de segurança.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* STANDARD EMAIL / PASSWORD FORM */
                    <form onSubmit={handleSubmitOrganizer} className="space-y-4">
                      <p className="text-slate-500 text-xs font-semibold leading-relaxed mb-1">
                        Acesse como Organizador para criar, estender e salvar roteiros de viagem e gerenciar viajantes.
                      </p>

                      {isRegister && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-widest">Nome Completo</label>
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              type="text"
                              required
                              value={name}
                              onChange={e => setName(e.target.value)}
                              className="w-full pl-10 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold"
                              placeholder="Seu nome"
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-widest">E-mail</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold"
                            placeholder="organizador@email.com"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-widest">Senha</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full cursor-pointer bg-indigo-600 hover:bg-indigo-750 text-white font-black text-xs py-3.5 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:bg-indigo-400 hover:scale-[1.01]"
                      >
                        {loading ? "Aguarde..." : (isRegister ? <><UserPlus className="w-4.5 h-4.5" /> Cadastrar Organizador</> : <><LogIn className="w-4.5 h-4.5" /> Entrar como Organizador</>)}
                      </button>

                      {/* Google Sign-on Trigger Button (Temporarily Hidden) */}

                      <p className="text-center text-xs text-slate-500 font-bold shrink-0 pt-1">
                        {isRegister ? "Já possui conta?" : "Não tem conta de organizador?"}{" "}
                        <button
                          type="button"
                          onClick={() => { setIsRegister(!isRegister); setError(""); }}
                          className="text-indigo-600 font-black hover:underline cursor-pointer"
                        >
                          {isRegister ? "Fazer Login" : "Criar uma Conta"}
                        </button>
                      </p>
                    </form>
                  )}
                </>
              ) : (
                /* TRAVELER GUEST READONLY DECOUPLED FLOW (Untouched behavior) */
                <form onSubmit={handleSubmitTraveler} className="space-y-4 animate-fadeIn">
                  <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-[11px] font-semibold text-indigo-950 flex items-start gap-2.5 leading-relaxed font-sans">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
                    <span>
                      <strong>Acesso para Viajantes:</strong> Você não precisa de uma senha! Basta usar o seu e-mail cadastrado pelo Organizador na lista de viajantes do grupo. Se o seu e-mail estiver vinculado a uma viagem, você terá acesso total à visualização do roteiro, hotel e planilha de despesas de modo prático!
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-widest">Seu E-mail Vinculado</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        id="traveler-guest-email-input"
                        value={travelerEmail}
                        onChange={e => setTravelerEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 text-xs font-semibold"
                        placeholder="seu.email@viajante.com"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    id="traveler-guest-submit-btn"
                    className="w-full cursor-pointer bg-gradient-to-r from-indigo-600 to-pink-600 hover:opacity-95 text-white font-black text-xs py-3.5 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.01]"
                  >
                    {loading ? "Verificando..." : <><LogIn className="w-4.5 h-4.5" /> Entrar e Ver Minhas Viagens</>}
                  </button>

                  <div className="text-center text-[11px] text-slate-400 font-semibold p-2">
                    Dica: O planejador da sua viagem deve adicionar o seu e-mail na aba "Participantes" para liberar seu acesso.
                  </div>
                </form>
              )}
            </>
          )}

        </div>
      </div>

      {/* DETACHED SIMULATED GOOGLE GMAIL INBOX FOR DEVELOPMENT & INTERACTIVE TESTING */}
      {((useGoogle && googleEmail.toLowerCase().endsWith("@gmail.com")) || (setupPasswordMode && setupEmail.toLowerCase().endsWith("@gmail.com"))) && (
        <div id="gmail-simulated-mailbox" className="max-w-md w-full mt-6 bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-2xl border border-slate-800 animate-slideUp">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-red-500/10 text-red-500 rounded-xl">
                <Inbox className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs font-black tracking-tight text-white">Gmail Sandbox Simulado</h4>
                <p className="text-[10px] text-slate-400 font-medium">{useGoogle ? googleEmail : setupEmail}</p>
              </div>
            </div>
            <button
              onClick={() => fetchSimulatedEmails(useGoogle ? googleEmail : setupEmail)}
              className="p-2 hover:bg-slate-800 rounded-xl transition text-slate-400 hover:text-white cursor-pointer"
              title="Sincronizar caixa de entrada"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {simulatedEmails.length === 0 ? (
            <div className="py-8 text-center text-slate-500 space-y-2">
              <Inbox className="w-8 h-8 mx-auto stroke-[1.2] opacity-55 animate-pulse" />
              <p className="text-xs font-bold leading-normal">Caixa de entrada vazia</p>
              <p className="text-[10px] max-w-xs mx-auto text-slate-400 leading-relaxed font-semibold">
                Caso tenha clicado em cadastrar, aguarde ou clique no botão de atualizar. Os e-mails são processados nos servidores locais da KK TUR.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-[9px] font-black tracking-widest text-indigo-400 uppercase block mb-1">Novas Mensagens ({simulatedEmails.length})</span>
              
              {simulatedEmails.map((mail) => (
                <div 
                  key={mail.id} 
                  className={`p-3.5 rounded-2xl text-left border transition-all ${
                    selectedSimulatedEmail?.id === mail.id 
                      ? "bg-slate-800/80 border-indigo-650" 
                      : "bg-slate-800/60 hover:bg-slate-800 border-slate-800 cursor-pointer"
                  }`}
                  onClick={() => setSelectedSimulatedEmail(selectedSimulatedEmail?.id === mail.id ? null : mail)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] bg-red-500/20 text-red-400 font-black px-2 py-0.5 rounded-md mb-1.5 inline-block uppercase">Gmail</span>
                      <h5 className="text-xs font-black text-white">{mail.subject}</h5>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 font-semibold">De: seguranca@kktur.com.br</p>
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold">Agora mesmo</span>
                  </div>

                  {selectedSimulatedEmail?.id === mail.id && (
                    <div className="mt-4 pt-4 border-t border-slate-700 space-y-3.5 animate-fadeIn">
                      <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-medium">
                        {mail.body}
                      </p>
                      
                      {/* Fully interactive link block that executes authentication verification */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const tokenMatch = mail.link.match(/token=([^&]+)/);
                          if (tokenMatch && tokenMatch[1]) {
                            handleActivateToken(tokenMatch[1]);
                          }
                        }}
                        className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer shadow-md select-none"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Definir Minha Senha com Segurança</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
