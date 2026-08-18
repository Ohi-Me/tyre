"use client";

import { useState } from "react";
import { Mic, Volume2, Send, Sparkles } from "lucide-react";

const SAMPLE_INTENTS = [
  { text: "Patna se Delhi load chahiye", lang: "Bhojpuri", agent: "Dispatch" },
  { text: "Mera load kahan hai?", lang: "Hindi", agent: "Tracking" },
  { text: "₹10,000 advance release karo", lang: "Hindi", agent: "Payment" },
  { text: "Broker Sahajanand ka trust score", lang: "Hindi", agent: "Trust" },
  { text: "Return load Delhi se Patna", lang: "Hindi", agent: "Dispatch" },
];

export function VoiceView() {
  const [recording, setRecording] = useState(false);
  const [input, setInput] = useState("");

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-7">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#181410] mb-2">
          Voice studio
        </h1>
        <p className="text-[13.5px] text-[#71717A]">
          Test the voice pipeline · Whisper STT · Llama-3.3 intent · 5-language support
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Voice input panel */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
          <h2 className="text-[14px] font-semibold text-[#181410] mb-4">Try a voice command</h2>

          {/* Mic visualization */}
          <div className="flex flex-col items-center py-8">
            <button
              onClick={() => setRecording((v) => !v)}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                recording
                  ? "tyre-bg-gradient shadow-[0_0_40px_rgba(233,30,99,0.5)]"
                  : "bg-[#181410] hover:bg-[#27272A]"
              }`}
            >
              {recording && (
                <>
                  <span className="absolute inset-0 rounded-full bg-[#8FE03A] animate-ping opacity-30" />
                  <span
                    className="absolute -inset-3 rounded-full border-2 border-[#8FE03A]/40 animate-pulse"
                  />
                </>
              )}
              <Mic className={`w-8 h-8 ${recording ? "text-white" : "text-white"}`} />
            </button>
            <div className="mt-5 text-[13px] font-semibold text-[#181410]">
              {recording ? "Listening..." : "Tap to speak"}
            </div>
            <div className="text-[11.5px] text-[#71717A] mt-1">
              {recording ? "Whisper Large v3 · auto-detect language" : "Hindi · Bhojpuri · English · Bengali · Marathi"}
            </div>
          </div>

          {/* Or type */}
          <div className="mt-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              Or type a command
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. Patna se Delhi load chahiye"
                className="flex-1 h-10 px-3 rounded-lg bg-[#F4F4F5] border border-transparent focus:border-[#181410]/10 focus:bg-white focus:outline-none text-[13px]"
              />
              <button className="px-3 rounded-lg bg-[#181410] text-white hover:bg-[#27272A]">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sample intents */}
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A] mb-2">
              Try a sample
            </div>
            <div className="space-y-1.5">
              {SAMPLE_INTENTS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => setInput(s.text)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#FAFAFA] text-left"
                >
                  <div className="w-6 h-6 rounded-md bg-[#EBFBD6] flex items-center justify-center">
                    <Volume2 className="w-3 h-3 text-[#8FE03A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[#181410] truncate">"{s.text}"</div>
                    <div className="text-[10px] text-[#71717A]">
                      {s.lang} → {s.agent} agent
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
          <h2 className="text-[14px] font-semibold text-[#181410] mb-4">Pipeline trace</h2>

          <div className="space-y-3">
            {[
              { step: "STT · Whisper Large v3", input: "audio (Bhojpuri, 3.2s)", output: "Patna se Delhi load chahiye", t: "180ms", ok: true },
              { step: "Language detect · fastText", input: "transcript", output: "bho · 0.94 confidence", t: "12ms", ok: true },
              { step: "Intent · Llama-3.3-70b", input: "transcript", output: "search_loads{origin:Patna, dest:Delhi}", t: "420ms", ok: true },
              { step: "Dispatch agent", input: "intent", output: "6 matching loads · ranked by rate+trust", t: "210ms", ok: true },
              { step: "TTS · ElevenLabs", input: "response text", output: "audio response (Bhojpuri)", t: "260ms", ok: true },
            ].map((p, i) => (
              <div
                key={i}
                className="rounded-xl border border-black/[0.06] bg-[#FAFAFA] p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11.5px] font-mono font-semibold text-[#181410]">
                    {p.step}
                  </div>
                  <div className="text-[10px] font-mono text-[#71717A]">{p.t}</div>
                </div>
                <div className="text-[10.5px] text-[#71717A]">
                  <span className="font-mono">in:</span> {p.input}
                </div>
                <div className="text-[10.5px] text-[#181410] font-medium mt-0.5">
                  <span className="font-mono text-[#71717A]">out:</span> {p.output}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-[#181410] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#FF6A2B]" />
                <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                  Total latency
                </div>
              </div>
              <div className="text-[20px] font-bold text-white">1.08s</div>
            </div>
            <div className="text-[10.5px] text-white/55 mt-1">
              Within 1.5s SLA · 92% of voice calls complete end-to-end under this threshold
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
