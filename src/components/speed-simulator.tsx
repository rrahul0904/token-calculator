"use client";

import { useEffect, useMemo, useState } from "react";
import { estimateGenerationTime } from "@/lib/planning";

const sample = "Streaming makes long model responses feel faster because users can start reading while the completion is still being generated. Token Intelligence helps product teams size output budgets, compare decode speeds, and separate time-to-first-token from generation time.";

export function SpeedSimulator() {
  const [speed, setSpeed] = useState(80);
  const [outputTokens, setOutputTokens] = useState(800);
  const [ttft, setTtft] = useState(0.8);
  const [running, setRunning] = useState(false);
  const [generated, setGenerated] = useState(0);
  const timing = useMemo(() => estimateGenerationTime(outputTokens, speed, ttft), [outputTokens, speed, ttft]);
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      const afterFirstToken = Math.max(0, elapsed - ttft);
      const next = Math.min(outputTokens, Math.floor(afterFirstToken * speed));
      setGenerated(next);
      if (next >= outputTokens) { setRunning(false); window.clearInterval(timer); }
    }, 50);
    return () => window.clearInterval(timer);
  }, [running, outputTokens, speed, ttft]);
  function start() { setGenerated(0); setRunning(false); requestAnimationFrame(() => setRunning(true)); }
  const progress = outputTokens <= 0 ? 0 : (generated / outputTokens) * 100;
  const visibleChars = Math.min(sample.length, Math.round(sample.length * progress / 100));
  return <div className="tool-stack"><section className="tool-card"><div className="tool-grid tool-grid--3"><label>Generation speed (tokens/s)<input type="number" min="1" value={speed} onChange={(e) => setSpeed(Math.max(1, Number(e.target.value) || 1))} /></label><label>Output length (tokens)<input type="number" min="1" value={outputTokens} onChange={(e) => setOutputTokens(Math.max(1, Number(e.target.value) || 1))} /></label><label>Time to first token (s)<input type="number" min="0" step="0.1" value={ttft} onChange={(e) => setTtft(Math.max(0, Number(e.target.value) || 0))} /></label></div><button type="button" className="button button--primary simulator-button" onClick={start}>{running ? "Restart simulation" : "Start simulation"}</button></section><section className="insight-strip"><div><span>Full response</span><strong>{timing.totalSeconds.toFixed(2)}s</strong><small>{timing.decodeSeconds.toFixed(2)}s decode + {ttft.toFixed(2)}s TTFT</small></div><div><span>Generated</span><strong>{generated.toLocaleString()} tokens</strong><small>{progress.toFixed(1)}% complete</small></div><div><span>Decode throughput</span><strong>{speed} tok/s</strong><small>{Math.round(speed * 60).toLocaleString()} tokens/min</small></div></section><section className="tool-card stream-card"><div className="stream-progress"><span style={{ width: `${progress}%` }} /></div><p className="eyebrow">Simulated streamed output</p><div className="stream-output">{generated === 0 ? <span className="muted">Start the simulation to preview perceived response pacing.</span> : <>{sample.slice(0, visibleChars)}<span className="stream-cursor">▋</span></>}</div></section></div>;
}
