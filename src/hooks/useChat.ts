import React, { useState, useEffect, useCallback } from "react";
import { ChatMessage } from "../types";

export function useChat(itineraryId: string | number, currentUserName?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTimestampRef = React.useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (typeof itineraryId === "string" && itineraryId.startsWith("local-")) {
      try {
        const stored = localStorage.getItem(`meu_agente_chat_${itineraryId}`);
        if (stored) {
          setMessages(JSON.parse(stored));
        }
      } catch(e) {}
      return;
    }

    try {
      const token = localStorage.getItem("auth_token");
      const url = currentUserName 
        ? `/api/messages/${encodeURIComponent(itineraryId)}?username=${encodeURIComponent(currentUserName)}${lastTimestampRef.current ? '&since=' + encodeURIComponent(lastTimestampRef.current) : ''}`
        : `/api/messages/${encodeURIComponent(itineraryId)}${lastTimestampRef.current ? '?since=' + encodeURIComponent(lastTimestampRef.current) : ''}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          const isInitialLoad = !lastTimestampRef.current;

          if (Array.isArray(data)) {
            if (data.length > 0) {
              lastTimestampRef.current = data[data.length - 1].timestamp;

              setMessages(prev => {
                const newIds = new Set(data.map((m: any) => m.id));
                return [...prev.filter(old => !newIds.has(old.id)), ...data].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              });
            }
            setTypingUsers([]);
          } else if (data && typeof data === "object") {
            if (data.messages && data.messages.length > 0) {
              lastTimestampRef.current = data.messages[data.messages.length - 1].timestamp;

              setMessages(prev => {
                const newIds = new Set(data.messages.map((m: any) => m.id));
                return [...prev.filter(old => !newIds.has(old.id)), ...data.messages].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              });
            }
            setTypingUsers(data.typingUsers || []);
          }
        } catch (e) {
          console.error("fetchMessages JSON parse error. content:", text.substring(0, 50));
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("fetchMessages failed:", res.status, errData);
      }
    } catch (e) {
      console.error("fetchMessages error:", e);
    }
  }, [itineraryId, currentUserName]);

  useEffect(() => {
    fetchMessages();
    const intervalId = setInterval(fetchMessages, 5000); // Polling every 5s
    return () => clearInterval(intervalId);
  }, [fetchMessages]);

  const setTyping = async (isTyping: boolean) => {
    if (typeof itineraryId === "string" && itineraryId.startsWith("local-") || !currentUserName) {
      return;
    }
    try {
      const token = localStorage.getItem("auth_token");
      await fetch("/api/messages/typing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          itineraryId,
          username: currentUserName,
          isTyping
        })
      });
    } catch (e) {
      console.error("Error setting typing status:", e);
    }
  };

  const sendMessage = async (payload: any) => {
    if (typeof itineraryId === "string" && itineraryId.startsWith("local-")) {
      const stored = localStorage.getItem(`meu_agente_chat_${itineraryId}`);
      const localMsgs = stored ? JSON.parse(stored) : [];
      localMsgs.push({
        id: 'msg-' + Math.random().toString(36).substring(7),
        itineraryId,
        timestamp: new Date().toISOString(),
        ...payload
      });
      localStorage.setItem(`meu_agente_chat_${itineraryId}`, JSON.stringify(localMsgs));
      fetchMessages();
      return true;
    }

    try {
      const token = localStorage.getItem("auth_token");
      setIsUploading(true);
      setError(null);
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          itineraryId,
          ...payload
        })
      });
      
      if (res.ok) {
        fetchMessages();
        return true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("sendMessage failed API response:", res.status, errorData);
        setError(errorData.error || "Erro ao enviar mensagem.");
        return false;
      }
    } catch (e) {
      console.error("sendMessage network error:", e);
      setError("Erro de conexão ao enviar mensagem.");
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    messages,
    typingUsers,
    isUploading,
    error,
    sendMessage,
    setTyping,
    fetchMessages
  };
}
