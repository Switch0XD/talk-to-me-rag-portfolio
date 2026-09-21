"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ChatResponse } from "@/lib/types";

type ChatWidgetProps = { firstName: string };
type WidgetState = "idle" | "loading" | "answer" | "refusal" | "error";

export function ChatWidget({ firstName }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<WidgetState>("idle");
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 2 || status === "loading") return;

    setStatus("loading");
    setResponse(null);
    setError("");
    try {
      const request = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await request.json()) as ChatResponse & { error?: string };
      if (!request.ok) throw new Error(data.error || "The assistant could not answer right now.");
      setResponse(data);
      setStatus(data.kind);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant could not answer right now.");
      setStatus("error");
    }
  }

  const examples = ["What healthcare systems has he built?", "What is TrustDrive?", "Has he worked at Google?"];

  return (
    <aside className="chat-shell" aria-label={`Talk to ${firstName}`}>
      {open ? (
        <div id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">Grounded portfolio assistant</p>
              <h2 id="chat-title">Talk to {firstName}</h2>
            </div>
            <button className="icon-button" type="button" onClick={close} aria-label="Close assistant">
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <p className="chat-disclaimer">Answers come only from Kuldeep’s supplied portfolio materials.</p>

          {status === "idle" ? (
            <div className="chat-empty">
              <p>Ask about projects, experience, or technical decisions.</p>
              <div className="suggestions" aria-label="Example questions">
                {examples.map((example) => (
                  <button key={example} type="button" onClick={() => setQuestion(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="chat-result" aria-live="polite" aria-busy={status === "loading"}>
            {status === "loading" ? <p className="thinking">Searching the portfolio material…</p> : null}
            {status === "answer" || status === "refusal" ? (
              <>
                <p className={status === "refusal" ? "refusal" : "answer"}>{response?.answer}</p>
                {response?.citations.length ? (
                  <div className="citations" aria-label="Answer sources">
                    <span>Sources</span>
                    {response.citations.map((citation) => (
                      <span key={`${citation.sourceId}-${citation.heading}`} className="citation">
                        {citation.title}{citation.heading ? ` · ${citation.heading}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {status === "error" ? <p className="error-message">{error}</p> : null}
          </div>

          <form className="chat-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="portfolio-question">Your question</label>
            <input
              ref={inputRef}
              id="portfolio-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about Kuldeep’s work…"
              maxLength={600}
              disabled={status === "loading"}
            />
            <button type="submit" disabled={question.trim().length < 2 || status === "loading"}>
              {status === "loading" ? "Thinking" : "Ask"}
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
