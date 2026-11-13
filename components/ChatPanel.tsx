"use client";

import { useEffect, useRef, useState } from "react";
import type { TailoredCV } from "@/lib/schemas";
import { Button, Spinner, Textarea } from "./ui";

export type ChatMessage = {
  role: "user" | "assistant" | "error";
  text: string;
  /** For assistant messages that edited the CV. */
  changes?: string[];
  /** CV as it was before this change, so the change can be reverted from the chat. */
  before?: TailoredCV;
  reverted?: boolean;
};

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  /** Status shown while busy (defaults to "Thinking…"). */
  busyText?: string | null;
  onSend: (message: string) => void;
  onRevert: (messageIndex: number) => void;
  onClear: () => void;
};

const SUGGESTIONS = [
  "How well does my CV match this JD? What's missing?",
  "Limit my CV to 2 pages",
  "Use Times New Roman, 11pt, with navy headings and left-aligned header",
  "Move Education above Work Experience and rename Summary to Profile",
  "Add a Projects section with 2 projects from my experience",
  "Make the key technologies in my bullets bold",
  "Add 2 more bullets on CI/CD to my most recent role",
  "Make the summary more focused on the JD's must-have skills",
  "Make all bullets more concise",
  "Add a new role: Lead Developer at Accenture, Jan 2024 – Present, with 4 bullets",
  "Add the certification AWS Solutions Architect – Associate (2023)",
  "Which bullets are weakest, and how would you improve them?",
];

export function ChatPanel({ messages, busy, busyText, onSend, onRevert, onClear }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-semibold text-slate-800">Chat with AI about your CV</span>
        {messages.length > 0 && (
          <button type="button" onClick={onClear} disabled={busy} className="text-xs text-slate-400 hover:text-slate-600">
            Clear chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-slate-500">
              Ask questions or ask for any change, like in ChatGPT or Claude: wording, roles, dates, education, certifications, page limit, fonts, spacing, section order, new sections, anything. The AI remembers this conversation. Try:
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="ml-6 whitespace-pre-wrap rounded-lg bg-indigo-600 px-3 py-2 text-white">
                {m.text}
              </div>
            );
          }
          if (m.role === "error") {
            return (
              <div key={i} className="mr-6 rounded-lg bg-red-50 px-3 py-2 text-red-700">
                {m.text}
              </div>
            );
          }
          return (
            <div key={i} className="mr-6 rounded-lg bg-slate-100 px-3 py-2 text-slate-800">
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.changes && m.changes.length > 0 && (
                <div className={`mt-2 rounded-md border bg-white p-2 text-xs ${m.reverted ? "border-slate-200 opacity-60" : "border-green-200"}`}>
                  <p className="mb-1 font-medium text-green-800">
                    {m.reverted ? "Changes (reverted)" : "Changed in your CV"}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-slate-700">
                    {m.changes.map((c, j) => (
                      <li key={j}>{c}</li>
                    ))}
                  </ul>
                  {m.before && !m.reverted && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRevert(i)}
                      className="mt-1.5 text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-50"
                      title="Restore the CV to how it was before this change (later changes are also undone)"
                    >
                      ↺ Revert
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {busy && (
          <div className="mr-6 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
            <Spinner /> {busyText || "Thinking…"}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-2">
        <Textarea
          rows={2}
          placeholder="Message the AI… (Enter to send, Shift+Enter for a new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <Button onClick={() => send(input)} disabled={busy || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
