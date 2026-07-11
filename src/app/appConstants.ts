import type { Config } from '../types/appTypes';

export const MARKET_REGISTRY_URL = 'https://registry.koishi.chat/index.json';
export const DEFAULT_LOG_COPY_LIMIT = 32768;

export const DEFAULT_CONFIG: Config = {
  provider: 'openai',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  apiKey: '',
  persistApiKey: true,
  saveHistory: false,
  stream: true,
  thinkingMode: 'auto',
  chatDetail: 'chatty',
  logLevel: 'info',
  recallLimit: 25,
  temperature: 0.2,
  maxTokens: 1400,
};

export const STORAGE_KEYS = {
  config: 'kmh.config.v1',
  disabledHosts: 'kmh.disabledHosts.v1',
  history: 'kmh.history.v1',
  collapsed: 'kmh.collapsed.v1',
  logCopyLimit: 'kmh.logCopyLimit.v1',
  sendMode: 'kmh.sendMode.v1',
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  adapter: '适配器',
  general: '通用服务',
  extension: '扩展功能',
  webui: '控制台',
  manage: '管理工具',
  preset: '行为预设',
  image: '图片服务',
  media: '资讯服务',
  tool: '实用工具',
  life: '生活指南',
  ai: '人工智能',
  meme: '趣味交互',
  game: '娱乐玩法',
  gametool: '游戏辅助',
  other: '其他',
};
