"use client";

import { useMemo, useState } from "react";
import { estimateModelMemory, type Precision } from "@/lib/planning";

const gpus = [{ name: "24 GB GPU", memory: 24 }, { name: "48 GB GPU", memory: 48 }, { name: "80 GB GPU", memory: 80 }, { name: "96 GB GPU", memory: 96 }, { name: "141 GB GPU", memory: 141 }];

export function MemoryCalculator() {
  const [parameters, setParameters] = useState(70);
  const [precision, setPrecision] = useState<Precision>("fp16");
  const [overhead, setOverhead] = useState(20);
  const estimate = useMemo(() => estimateModelMemory(parameters, precision, overhead), [parameters, precision, overhead]);
  const fit = gpus.find((gpu) => gpu.memory >= estimate.totalGb);
  const gpuCount = Math.ceil(estimate.totalGb / 80);
  return <div className="tool-stack"><section className="tool-card"><div className="tool-grid tool-grid--3"><label>Model size (B params)<input type="number" min="0" step="0.1" value={parameters} onChange={(e) => setParameters(Number(e.target.value) || 0)} /></label><label>Precision<select value={precision} onChange={(e) => setPrecision(e.target.value as Precision)}><option value="fp32">FP32 · 4 bytes</option><option value="fp16">FP16 / BF16 · 2 bytes</option><option value="int8">INT8 / FP8 · 1 byte</option><option value="int4">INT4 · 0.5 bytes</option></select></label><label>Runtime overhead (%)<input type="number" min="0" max="200" value={overhead} onChange={(e) => setOverhead(Number(e.target.value) || 0)} /></label></div></section><section className="insight-strip"><div><span>Total estimate</span><strong>{estimate.totalGb.toFixed(1)} GB</strong><small>weights + planning overhead</small></div><div><span>Model weights</span><strong>{estimate.weightsGb.toFixed(1)} GB</strong><small>{estimate.bytesPerParameter} bytes / parameter</small></div><div><span>Hardware fit</span><strong>{fit?.name ?? `${gpuCount}× 80 GB GPUs`}</strong><small>Before KV cache / concurrency headroom</small></div></section><section className="tool-card caveat-card"><p className="eyebrow">Production caveat</p><h2>VRAM is more than model weights.</h2><p>This calculator intentionally gives a fast baseline. KV cache, batch size, context length, concurrent requests, framework allocation, attention kernels, and quantization metadata can materially change real serving memory.</p></section></div>;
}
