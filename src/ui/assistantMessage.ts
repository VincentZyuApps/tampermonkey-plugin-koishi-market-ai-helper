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
  const ignoredNames: string[] = [];
  for (const group of [parsed.primary, parsed.alternatives]) {
    for (const item of group || []) {
      const base = byName.get(item.name);
      if (!base) {
        ignoredNames.push(item.name);
        continue;
      }
      cards.push({
        ...base,
        reason: item.reason || base.description,
        warning: item.warning || '',
        query: item.query || base.shortname || base.name,
      });
    }
  }

  const lines = [];
  if (parsed.answer && (cards.length || !ignoredNames.length)) lines.push(parsed.answer);
  if (parsed.searchSyntax) lines.push(`建议查询语法：${parsed.searchSyntax}`);
  const notRecommended = parsed.notRecommended?.filter((item) => byName.has(item.name)) || [];
  if (notRecommended.length) {
    lines.push(
      '不优先推荐：'
        + notRecommended.map((item) => `${item.name}（${item.reason || '原因未说明'}）`).join('；'),
    );
  }
  if (!cards.length && candidates.length) {
    lines.push('LLM 返回的推荐项不在本次候选列表中，已改显示本地召回结果；可以换用更具体的关键词再搜一次。');
  }

  const notes = parsed.notes?.map(String) || [];
  if (ignoredNames.length) {
    notes.push(`已忽略不在本次候选列表中的推荐：${[...new Set(ignoredNames)].join('、')}`);
  }

  return {
    role: 'assistant',
    content: lines.join('\n') || '已根据候选插件完成推荐。',
    cards: uniqueCards(cards.length ? cards : candidates.slice(0, 8)).slice(0, 10),
    notes,
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
