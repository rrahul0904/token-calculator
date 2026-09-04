export type TokenizerFamily =
  | "openai-o200k"
  | "anthropic-estimate"
  | "gemini-estimate"
  | "deepseek-estimate"
  | "grok-estimate";

export type TokenizerPrecision =
  | "exact"
  | "provider_reference"
  | "compatible_family"
  | "estimated";

export type TokenPiece = { id?: number; text: string };

export type TokenizerResult = {
  count: number;
  pieces: TokenPiece[];
  family: TokenizerFamily;
  precision: TokenizerPrecision;
  source?: string;
  caveat?: string;
  piecesTruncated: boolean;
};

export type TokenMetrics = {
  requestId: number;
  characters: number;
  charactersWithoutSpaces: number;
  words: number;
  results: Record<TokenizerFamily, TokenizerResult>;
};

export type TokenizerWorkerRequest = { requestId: number; text: string };
