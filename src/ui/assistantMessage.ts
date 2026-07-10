import type { LlmJsonResult, Message, PluginSummary } from '../types/appTypes';

export function buildAssistantMessage(
  raw: string,
  parsed: LlmJsonResult | null,
  candidates: PluginSummary[],
): Message {
  if (!parsed) {
    return {
      role: 'assistant',
      content: raw || 'LLM 没有返回内容。',
      cards: candidates.slice(0, 8),
    };
  }

  const byName = new Map(candidates.map((item) => [item.name, item]));
  const cards: PluginSummary[] = [];
  for (const group of [parsed.primary, parsed.alternatives]) {
    for (const item of group || []) {
      const base = byName.get(item.name) || ({ name: item.name, query: item.query || item.name } as PluginSummary);
      cards.push({
        ...base,
        reason: item.reason || base.description,
        warning: item.warning || '',
        query: item.query || base.shortname || base.name,
      });
    }
  }

  const lines = [];
  if (parsed.answer) lines.push(parsed.answer);
  if (parsed.searchSyntax) lines.push(`建议查询语法：${parsed.searchSyntax}`);
  if (parsed.notRecommended?.length) {
    lines.push(
      '不优先推荐：'
        + parsed.notRecommended.map((item) => `${item.name}（${item.reason || '原因未说明'}）`).join('；'),
    );
  }

  return {
    role: 'assistant',
    content: lines.join('\n') || '已根据候选插件完成推荐。',
    cards: uniqueCards(cards).slice(0, 10),
    notes: parsed.notes?.map(String) || [],
  };
}

function uniqueCards(cards: PluginSummary[]): PluginSummary[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (!card.name || seen.has(card.name)) return false;
    seen.add(card.name);
    return true;
  });
}
