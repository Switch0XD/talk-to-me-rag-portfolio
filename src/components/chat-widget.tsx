"use client";

import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ChatResponse } from "@/lib/types";

type ChatWidgetProps = { firstName: string };
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  tone?: "answer" | "refusal" | "error";
};

const EXAMPLES = ["What healthcare systems has he built?", "What is TrustDrive?", "Where did Kuldeep study?"];
const GENERIC_ERROR = "The assistant could not answer right now.";

// Model answers sometimes contain **bold**; render that instead of showing asterisks.
function renderInline(text: string) {
  return text.split(/\*\*(.+?)\*\*/gu).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>,
  );
}

export function ChatWidget({ firstName }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, loading, open]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, close]);

  function addMessage(message: Omit<Message, "id">) {
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);
  }

  async function ask(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (trimmed.length < 2 || loading) return;

    addMessage({ role: "user", text: trimmed });
    setQuestion("");
    setLoading(true);
    try {
      const request = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      // Read as text first: a crashed server function returns an empty body,
      // and request.json() would surface that as a confusing parse error.
      let data: (ChatResponse & { error?: string }) | null = null;
      try {
        data = JSON.parse(await request.text());
      } catch {
        data = null;
      }
      if (!request.ok || !data?.answer) {
        throw new Error(data?.error || `The assistant is temporarily unavailable (error ${request.status}). Please try again shortly.`);
      }
      addMessage({ role: "assistant", text: data.answer, tone: data.kind });
    } catch (caught) {
      addMessage({ role: "assistant", text: caught instanceof Error ? caught.message : GENERIC_ERROR, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <aside className="chat-shell" aria-label={`Talk to ${firstName}`}>
      {open ? (
        <div id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title">
          <div className="chat-heading">
            <span className="chat-avatar" aria-hidden="true">{firstName.charAt(0)}</span>
            <div className="chat-heading-text">
              <h2 id="chat-title">Talk to {firstName}</h2>
              <p className="chat-status">Portfolio assistant</p>
            </div>
            <button className="icon-button" type="button" onClick={close} aria-label="Close assistant">
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="chat-log" role="log" aria-live="polite" aria-busy={loading}>
            <div className="message message-assistant">
              <p className="bubble">
                Hi, I’m {firstName}’s portfolio assistant. Ask about his projects, experience, or education and I’ll answer from his résumé and project notes.
              </p>
            </div>

            {messages.map((message) => (
              <div key={message.id} className={`message message-${message.role}`}>
                <p className={`bubble${message.tone && message.tone !== "answer" ? ` bubble-${message.tone}` : ""}`}>
                  {message.role === "assistant" ? renderInline(message.text) : message.text}
                </p>
              </div>
            ))}

            {loading ? (
              <div className="message message-assistant">
                <p className="bubble typing" role="status" aria-label="Searching the portfolio material">
                  <span /><span /><span />
                </p>
              </div>
            ) : null}

            {!messages.length ? (
              <div className="suggestions" aria-label="Example questions">
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => void ask(example)}>
                    {example}
                  </button>
                ))}
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form className="chat-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="portfolio-question">Your question</label>
            <input
              ref={inputRef}
              id="portfolio-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Type a message…"
              maxLength={600}
              autoComplete="off"
            />
            <button type="submit" aria-label="Send" disabled={question.trim().length < 2 || loading}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M3.4 20.4 21 12 3.4 3.6v6.4l12.6 2-12.6 2z" />
              </svg>
            </button>
          </form>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        className="chat-trigger"
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls="chat-panel"
      >
        <span aria-hidden="true">✦</span>
        Talk to {firstName}
      </button>
    </aside>
  );
}
