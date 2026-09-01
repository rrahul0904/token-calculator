export type TokenizerFamily =
  | "openai-o200k"
  | "anthropic-estimate"
  | "gemini-estimate"
  | "deepseek-estimate"
  | "grok-estimate";

export type TokenPiece = { id: number; text: string };

export type TokenMetrics = {
  requestId: number;
  characters: number;
  charactersWithoutSpaces: number;
  words: number;
  openaiExact: number;
  anthropicEstimate: number;
  geminiEstimate: number;
  deepseekEstimate: number;
  grokEstimate: number;
  pieces: TokenPiece[];
};

export type TokenizerWorkerRequest = { requestId: number; text: string };
