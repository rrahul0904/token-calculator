"use client";

import { useMemo, useState } from "react";
import { formatTokens } from "@/lib/format";
import { tokensToWords, wordsToTokens, type TextProfile } from "@/lib/planning";

const profiles: { value: TextProfile; title: string; description: string }[] = [
  { value: "prose", title: "English prose", description: "Articles, docs, email, and ordinary chat." },
  { value: "dense", title: "Dense / multilingual", description: "Compact, punctuation-heavy, or multilingual text." },
  { value: "code", title: "Code / JSON", description: "Symbols, keys, braces, logs, and structured payloads." },
];

export function TokensWordsCalculator() {
  const [tokens, setTokens] = useState(1_000_000);
  const [words, setWords] = useState(750_000);
  const [profile, setProfile] = useState<TextProfile>("prose");
  const wordRange = useMemo(() => tokensToWords(tokens, profile), [tokens, profile]);
  const tokenRange = useMemo(() => wordsToTokens(words, profile), [words, profile]);
  return <div className="tool-stack"><section className="tool-card"><div className="tool-grid tool-grid--2"><label>Tokens<input type="number" min="0" value={tokens} onChange={(e) => setTokens(Number(e.target.value) || 0)} /></label><label>Words<input type="number" min="0" value={words} onChange={(e) => setWords(Number(e.target.value) || 0)} /></label></div><div className="profile-selector">{profiles.map((item) => <button key={item.value} type="button" className={profile === item.value ? "profile-option profile-option--active" : "profile-option"} onClick={() => setProfile(item.value)}><strong>{item.title}</strong><span>{item.description}</span></button>)}</div></section><section className="insight-strip"><div><span>Estimated words</span><strong>{formatTokens(wordRange.min)}–{formatTokens(wordRange.max)}</strong><small>from {formatTokens(tokens)} tokens</small></div><div><span>Estimated tokens</span><strong>{formatTokens(tokenRange.min)}–{formatTokens(tokenRange.max)}</strong><small>from {formatTokens(words)} words</small></div><div><span>Planning mode</span><strong>{profiles.find((item) => item.value === profile)?.title}</strong><small>Use exact tokenization for billing.</small></div></section></div>;
}
