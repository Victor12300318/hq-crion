"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, User, AlertCircle, MessageSquare, Lightbulb, Headphones } from "lucide-react";
import { clsx } from "clsx";

type SuggestionValue = string | number | boolean | null | SuggestionValue[] | { [key: string]: SuggestionValue };

export interface DashboardCall {
  call_sid: string;
  conversation_id: string | null;
  start_time: string | Date | null;
  user_phone: string | null;
  agent_name: string | null;
  motivo_contato: string;
  nota_qa: number | string | null;
  status: string | null;
  summary: string | null;
  cpf: string | null;
  nome: string | null;
  justificativa_nota: string | null;
  sugestoes: SuggestionValue | null;
  transferido: boolean;
}

interface CallMessage {
  id: number;
  role: string | null;
  time_in_call_secs: number | null;
  message: string | null;
}

interface CallDetailsModalProps {
  call: DashboardCall | null | undefined;
  isOpen: boolean;
  onClose: () => void;
}

const TERMS_TO_HIGHLIGHT = [
  "procon",
  "advogado",
  "justica",
  "processo",
  "reclame aqui",
  "bosta",
  "merda",
  "lixo",
  "cancelar",
  "cancelamento",
  "atraso",
  "fraude"
];

function highlightText(text: string, wordsToHighlight: string[]): ReactNode {
  if (!text || wordsToHighlight.length === 0) return text;

  const escapedWords = wordsToHighlight.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const splitRegex = new RegExp(`(${escapedWords})`, "gi");
  const testRegex = new RegExp(`^(${escapedWords})$`, "i");

  return text.split(splitRegex).map((part, index) =>
    testRegex.test(part) ? (
      <mark key={`${part}-${index}`} className="bg-red-200 text-red-900 rounded-sm px-1 font-medium">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function extractSuggestionText(value: SuggestionValue | undefined): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSuggestionText(item));
  }

  if (typeof value !== "object") {
    return [];
  }

  const currentSuggestion = typeof value.texto_sugestao === "string" ? [value.texto_sugestao] : [];
  const nestedSuggestions = Object.entries(value)
    .filter(([key]) => key !== "texto_sugestao")
    .flatMap(([, item]) => extractSuggestionText(item));

  return [...currentSuggestion, ...nestedSuggestions];
}

function normalizeSuggestions(value: SuggestionValue | null): string[] {
  return Array.from(new Set(extractSuggestionText(value).map((suggestion) => suggestion.trim()).filter(Boolean)));
}

export default function CallDetailsModal({ call, isOpen, onClose }: CallDetailsModalProps) {
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(false);

  useEffect(() => {
    if (!isOpen || !call?.call_sid) return;

    const controller = new AbortController();
    let ignoreResult = false;

    async function loadMessages(callSid: string) {
      setLoadingMsg(true);
      setMessages([]);

      try {
        const response = await fetch(`/api/calls/${encodeURIComponent(callSid)}/messages`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.status}`);
        }

        const data = (await response.json()) as { messages?: CallMessage[] };
        if (!ignoreResult) {
          setMessages(data.messages || []);
        }
      } catch (error) {
        if (!ignoreResult && !(error instanceof DOMException && error.name === "AbortError")) {
          console.error(error);
          setMessages([]);
        }
      } finally {
        if (!ignoreResult) {
          setLoadingMsg(false);
        }
      }
    }

    void loadMessages(call.call_sid);

    return () => {
      ignoreResult = true;
      controller.abort();
    };
  }, [isOpen, call?.call_sid]);

  if (!call) return null;

  const wordsToHighlight = call.justificativa_nota ? TERMS_TO_HIGHLIGHT : [];
  const suggestions = normalizeSuggestions(call.sugestoes);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <DialogHeader className="p-6 pb-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <DialogTitle className="text-xl font-bold flex flex-wrap items-center gap-2 text-foreground">
            <span>Detalhes da Chamada</span>
            <span className="text-sm font-normal text-muted-foreground font-mono break-all">({call.call_sid})</span>
          </DialogTitle>
          <a
            href={`https://elevenlabs.io/app/agents/history/${call.conversation_id || call.call_sid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 self-start sm:self-auto"
          >
            <Headphones className="w-4 h-4" /> Escutar Ligação
          </a>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6 bg-muted/40">
          <div className="w-full md:w-1/2 space-y-6">
            <section className="bg-card p-4 rounded-xl shadow-sm border border-border">
              <h3 className="flex items-center text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                <User className="w-4 h-4 mr-2 text-blue-500" /> Dados do Cliente
              </h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground font-medium">Nome:</span> <span className="font-semibold">{call.nome || "Nao identificado"}</span></p>
                <p><span className="text-muted-foreground font-medium">CPF:</span> <span className="font-mono">{call.cpf || "Nao identificado"}</span></p>
                <p><span className="text-muted-foreground font-medium">Telefone:</span> <span className="font-mono">{call.user_phone}</span></p>
              </div>
            </section>

            <section className="bg-card p-4 rounded-xl shadow-sm border border-border">
              <h3 className="flex items-center text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                <FileText className="w-4 h-4 mr-2 text-blue-500" /> Resumo da Chamada
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed bg-muted p-3 rounded-lg">
                {call.summary || "Resumo nao disponivel."}
              </p>
            </section>

            <section className="bg-card p-4 rounded-xl shadow-sm border border-red-500/20">
              <h3 className="flex items-center text-sm font-semibold text-red-700 mb-3 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 mr-2" /> Justificativa de QA / Nota
              </h3>
              {call.justificativa_nota ? (
                <p className="text-sm text-red-600 leading-relaxed bg-red-50 p-3 rounded-lg border border-red-100">
                  {call.justificativa_nota}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sem justificativa registrada.</p>
              )}
            </section>

            {suggestions.length > 0 ? (
              <section className="bg-card p-4 rounded-xl shadow-sm border border-amber-500/30">
                <h3 className="flex items-center text-sm font-semibold text-amber-800 mb-3 uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4 mr-2" /> Sugestoes para o Prompt
                </h3>
                <ol className="space-y-2 list-decimal list-inside">
                  {suggestions.map((suggestion, index) => (
                    <li key={`${suggestion}-${index}`} className="text-sm text-amber-900 leading-relaxed bg-amber-50 p-3 rounded-lg border border-amber-100">
                      {suggestion}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <div className="w-full md:w-1/2 flex flex-col h-[500px] md:h-auto bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 border-b bg-muted/60 flex items-center">
              <MessageSquare className="w-4 h-4 mr-2 text-blue-500" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Transcricao</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ddd5]/20">
              {loadingMsg ? (
                <div className="flex justify-center items-center h-full">
                  <span className="text-muted-foreground text-sm">Carregando mensagens...</span>
                </div>
              ) : messages.length > 0 ? (
                messages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <div key={message.id} className={clsx("flex flex-col max-w-[85%]", isUser ? "ml-auto items-end" : "mr-auto items-start")}>
                      <span className="text-[10px] text-muted-foreground mb-1 mx-1 font-medium">
                        {isUser ? "Cliente" : "IA Clara"} - {message.time_in_call_secs ?? 0}s
                      </span>
                      <div
                        className={clsx(
                          "px-4 py-2 rounded-2xl text-sm shadow-sm relative whitespace-pre-wrap",
                          isUser
                            ? "bg-[#dcf8c6] text-gray-800 rounded-tr-none border border-[#c4eab0]"
                            : "bg-card text-foreground rounded-tl-none border border-border"
                        )}
                      >
                        {highlightText(message.message || "", wordsToHighlight)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex justify-center items-center h-full">
                  <span className="text-muted-foreground text-sm italic">Nenhuma mensagem encontrada.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
