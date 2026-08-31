export type TextProfile = "prose" | "dense" | "code";

const ratios: Record<TextProfile, { minWordsPerToken: number; maxWordsPerToken: number }> = {
  prose: { minWordsPerToken: 0.67, maxWordsPerToken: 0.77 },
  dense: { minWordsPerToken: 0.5, maxWordsPerToken: 0.67 },
  code: { minWordsPerToken: 0.35, maxWordsPerToken: 0.58 },
};

export function tokensToWords(tokens: number, profile: TextProfile) {
  const safe = Math.max(0, tokens);
  const ratio = ratios[profile];
  return { min: Math.round(safe * ratio.minWordsPerToken), max: Math.round(safe * ratio.maxWordsPerToken) };
}

export function wordsToTokens(words: number, profile: TextProfile) {
  const safe = Math.max(0, words);
  const ratio = ratios[profile];
  return { min: Math.round(safe / ratio.maxWordsPerToken), max: Math.round(safe / ratio.minWordsPerToken) };
}

export type Precision = "fp32" | "fp16" | "int8" | "int4";
const bytesPerParameter: Record<Precision, number> = { fp32: 4, fp16: 2, int8: 1, int4: 0.5 };

export function estimateModelMemory(parametersBillions: number, precision: Precision, overheadPercent: number) {
  const parameters = Math.max(parametersBillions, 0);
  const overhead = Math.max(overheadPercent, 0);
  const weightsGb = parameters * bytesPerParameter[precision];
  const overheadGb = weightsGb * (overhead / 100);
  return { weightsGb, overheadGb, totalGb: weightsGb + overheadGb, bytesPerParameter: bytesPerParameter[precision] };
}

export function estimateGenerationTime(outputTokens: number, tokensPerSecond: number, timeToFirstTokenSeconds = 0) {
  const tokens = Math.max(outputTokens, 0);
  const speed = Math.max(tokensPerSecond, 0.001);
  const ttft = Math.max(timeToFirstTokenSeconds, 0);
  const decodeSeconds = tokens / speed;
  return { decodeSeconds, totalSeconds: ttft + decodeSeconds };
}
