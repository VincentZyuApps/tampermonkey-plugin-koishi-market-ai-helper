import type { PluginSummary, RegistryObject, SearchResult } from '../types/appTypes';

export function searchPlugins(objects: RegistryObject[], query: string, limit: number): SearchResult[] {
  const tokens = expandQueryTokens(query);
  const queryLower = query.toLowerCase().trim();
  const ranked: SearchResult[] = [];

  for (const data of objects) {
    const item = summarizePlugin(data);
    const name = item.name.toLowerCase();
    const shortname = item.shortname.toLowerCase();
    const category = item.category.toLowerCase();
    const description = item.description.toLowerCase();
    const keywordText = item.keywords.map((keyword) => keyword.toLowerCase()).join(' ');
    const searchable = [name, shortname, category, description, keywordText].join(' ');
    let score = 0;

    if (queryLower) {
      if (queryLower === name || queryLower === shortname) score += 20;
      else if (containsQuery(name, queryLower) || containsQuery(shortname, queryLower)) score += 8;
      else if (containsQuery(description, queryLower)) score += 4;
      else if (containsQuery(keywordText, queryLower)) score += 3;
    }

    for (const token of tokens) {
      if (token === name || token === shortname) score += 12;
      else if (containsQuery(name, token) || containsQuery(shortname, token)) score += 5;
      else if (containsQuery(category, token)) score += 2.5;
      else if (containsQuery(description, token)) score += 2;
      else if (containsQuery(keywordText, token)) score += 1.5;
      else if (containsQuery(searchable, token)) score += 1;
    }

    score += Math.log1p(item.downloadsLastMonth) / 10;
    score += item.scoreFinal / 3;
    score += Math.min(item.rating, 10) / 50;
    if (item.verified) score += 0.3;

    ranked.push({ score, item });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

export function summarizePlugin(data: RegistryObject): PluginSummary {
  const pkg = data.package || {};
  const links = pkg.links || {};
  return {
    name: pkg.name || '',
    shortname: data.shortname || '',
    version: pkg.version || '',
    category: data.category || 'other',
    verified: Boolean(data.verified),
    portable: Boolean(data.portable),
    downloadsLastMonth: data.downloads?.lastMonth || 0,
    rating: data.rating || 0,
    scoreFinal: data.score?.final || 0,
    updatedAt: data.updatedAt || pkg.date || '',
    description: pickDescription(data),
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
    npm: links.npm || '',
    homepage: links.homepage || '',
    repository: links.repository || '',
    query: data.shortname || pkg.name || '',
  };
}

function pickDescription(data: RegistryObject): string {
  const desc = data.manifest?.description || data.package?.description || '';
  if (desc && typeof desc === 'object') {
    for (const key of ['zh-CN', 'zh', 'en']) {
      const value = desc[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return Object.values(desc).map((value) => String(value).trim()).filter(Boolean).join(' ');
  }
  return String(desc || '').trim();
}

function expandQueryTokens(query: string): string[] {
  const tokens = query.toLowerCase().match(/[@a-z0-9_.+\-/]+|[\u4e00-\u9fff]+/g) || [];
  const extra: string[] = [];
  const lower = query.toLowerCase();

  if (/绘图|画图|图片|文生图|图生图|image|draw/.test(lower)) {
    extra.push('ai', 'image', 'draw', '绘图', '画图', '文生图', '图生图', 'category:image');
  }
  if (/聊天|对话|chat|gpt|llm|openai|claude|deepseek/.test(lower)) {
    extra.push('ai', 'chat', 'llm', 'openai', '对话', '聊天', 'category:ai');
  }
  if (/视频|video|文生视频|图生视频/.test(lower)) extra.push('video', 'ai', '视频');
  if (/b站|bilibili|哔哩/.test(lower)) extra.push('bilibili', 'media', '通知');
  if (/minecraft|mc|服务器/.test(lower)) extra.push('minecraft', 'server', 'gametool', '服务器');
  if (/管理|权限|群管|审核|moderation/.test(lower)) extra.push('manage', 'tool', '审核', '管理');
  if (query.trim()) extra.push(query.toLowerCase().trim());

  return [...new Set([...tokens, ...extra].filter(Boolean))];
}

function containsQuery(text: string, token: string): boolean {
  if (!token) return false;
  if (/[\u4e00-\u9fff]/.test(token)) return text.includes(token);
  const bare = token.replace(/^@/, '');
  if (bare.length <= 2 && /^[a-z0-9]+$/.test(bare)) {
    return text.split(/[^a-z0-9]+/).includes(bare);
  }
  return text.includes(token);
}
