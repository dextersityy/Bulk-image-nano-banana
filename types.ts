export enum ApiKeyStatus {
  Active = 'Active',
  RateLimited = 'Rate Limited',
}

export enum AIService {
  Gemini = 'Gemini',
  OpenAI = 'OpenAI',
}

export interface ApiKey {
  key: string;
  status: ApiKeyStatus;
  service: AIService;
}

export interface GenerationResult {
  prompt: string;
  images: string[]; // base64 strings
  error?: string;
}

export interface HistoryItem {
  id: string;
  date: string;
  results: GenerationResult[];
}

export type Page = 'generator' | 'history';
