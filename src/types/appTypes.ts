export type Provider = 'openai' | 'anthropic';
export type Role = 'user' | 'assistant';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type SendMode = 'enter' | 'ctrlEnter';
export type ChatDetail = 'chatty' | 'normal' | 'quiet';
export type ThinkingMode = 'auto' | 'enabled' | 'disabled';
export type AboutTab = 'overview' | 'guide' | 'privacy';

export interface Config {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
  persistApiKey: boolean;
  saveHistory: boolean;
  stream: boolean;
  thinkingMode: ThinkingMode;
  chatDetail: ChatDetail;
  logLevel: LogLevel;
  recallLimit: number;
  temperature: number;
  maxTokens: number;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  time: string;
  detail: string;
}

export interface Message {
  role: Role;
  content: string;
  reasoning?: string;
  reasoningOpen?: boolean;
  progress?: string;
  cards?: PluginSummary[];
  notes?: string[];
}

export interface User {
  username?: string;
  email?: string;
  name?: string;
}

export interface RegistryPackage {
  name?: string;
  version?: string;
  keywords?: string[];
  description?: string;
  date?: string;
  contributors?: User[];
  maintainers?: User[];
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
    size?: string;
  };
}

export interface RegistryObject {
  package?: RegistryPackage;
  shortname?: string;
  downloads?: {
    lastMonth?: number;
  };
  verified?: boolean;
  insecure?: boolean;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
  rating?: number;
  score?: {
    final?: number;
  };
  portable?: boolean;
  manifest?: {
    hidden?: boolean;
    preview?: boolean;
    description?: string | Record<string, string>;
    locales?: string[];
    service?: {
      required?: string[];
      optional?: string[];
      implements?: string[];
    };
  };
}

export interface RegistryData {
  version?: number;
  time?: string;
  total?: number;
  objects: RegistryObject[];
}

export interface PluginSummary {
  name: string;
  shortname: string;
  version: string;
  category: string;
  verified: boolean;
  portable: boolean;
  downloadsLastMonth: number;
  rating: number;
  scoreFinal: number;
  updatedAt: string;
  description: string;
  keywords: string[];
  npm: string;
  homepage: string;
  repository: string;
  query: string;
  reason?: string;
  warning?: string;
}

export interface SearchResult {
  score: number;
  item: PluginSummary;
}

export interface LlmJsonResult {
  answer?: string;
  primary?: LlmRecommendation[];
  alternatives?: LlmRecommendation[];
  notRecommended?: LlmRecommendation[];
  notes?: string[];
  searchSyntax?: string;
}

export interface LlmRecommendation {
  name: string;
  reason?: string;
  warning?: string;
  query?: string;
}

export interface LlmStreamSnapshot {
  content: string;
  reasoning: string;
  events: number;
}

export interface ModelOption {
  id: string;
  ownedBy?: string;
}

export interface AppState {
  closedForPage: boolean;
  collapsed: boolean;
  settingsOpen: boolean;
  aboutOpen: boolean;
  aboutTab: AboutTab;
  busy: boolean;
  notice: string;
  logOpen: boolean;
  logCopyLimit: number;
  sendMode: SendMode;
  logs: LogEntry[];
  registry: RegistryData | null;
  registryPromise: Promise<RegistryData> | null;
  sessionApiKey: string;
  lastLocalResults: SearchResult[];
  modelOptions: ModelOption[];
  config: Config;
  messages: Message[];
}
