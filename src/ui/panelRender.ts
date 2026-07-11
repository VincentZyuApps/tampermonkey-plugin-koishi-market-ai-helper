import { CATEGORY_LABELS } from '../app/appConstants';
import { providerLabel } from '../app/appConfig';
import {
  APP_AUTHOR_EMAIL,
  APP_AUTHOR_NAME,
  APP_DESCRIPTION,
  APP_LICENSE,
  APP_LINKS,
  APP_RELEASE_CHANNEL,
  APP_SHORT_NAME,
  APP_VERSION,
} from '../app/appMeta';
import { escapeAttr, escapeHtml, formatContent } from '../shared/htmlUtils';
import { renderIcon } from './iconRender';
import type { AboutTab, AppState, LogEntry, Message, PluginSummary } from '../types/appTypes';

export function renderBubble(): string {
  return `
    <button class="kmh-bubble" type="button" data-action="expand" title="Koishi AI 插件搜索助手">
      <span class="kmh-bubble-mark">AI✨</span>
    </button>
  `;
}

export function renderPanel(state: AppState, apiKey: string, animateEnter = false): string {
  return `
    ${renderAbout(state)}
    ${renderSettings(state, apiKey)}
    ${renderLogs(state)}
    <div class="kmh-stack ${animateEnter ? 'kmh-stack-enter' : ''}">
      <section class="kmh-panel" aria-label="Koishi AI 插件搜索助手">
        <header class="kmh-header">
          <div class="kmh-title-wrap">
            <button class="kmh-icon-btn kmh-about-btn" type="button" data-action="toggle-about" data-role="about-trigger" title="${state.aboutOpen ? '关闭关于' : '打开关于、使用指南和隐私说明'}" aria-label="${state.aboutOpen ? '关闭关于' : '打开关于、使用指南和隐私说明'}" aria-controls="kmh-about-panel" aria-expanded="${state.aboutOpen ? 'true' : 'false'}">${renderIcon('info')}</button>
            <div>
              <div class="kmh-title">🔍 Koishi 插件 AI 搜索</div>
              <div class="kmh-subtitle">🤖 ${escapeHtml(providerLabel(state.config.provider))} · 🧭 召回 ${escapeHtml(String(state.config.recallLimit))}</div>
            </div>
          </div>
          <div class="kmh-header-actions">
            <button class="kmh-icon-btn" type="button" data-action="toggle-log" data-role="log-trigger" title="${state.logOpen ? '向右收起日志' : '向左展开日志'}" aria-label="${state.logOpen ? '向右收起日志' : '向左展开日志'}" aria-controls="kmh-log-panel" aria-expanded="${state.logOpen ? 'true' : 'false'}">${renderIcon('log')}</button>
            <button class="kmh-icon-btn" type="button" data-action="toggle-settings" data-role="settings-trigger" title="${state.settingsOpen ? '向左下收起设置' : '向右上展开设置'}" aria-label="${state.settingsOpen ? '向左下收起设置' : '向右上展开设置'}" aria-controls="kmh-settings-panel" aria-expanded="${state.settingsOpen ? 'true' : 'false'}">⚙</button>
            <button class="kmh-icon-btn" type="button" data-action="collapse" title="收回">−</button>
            <button class="kmh-icon-btn" type="button" data-action="close-page" title="本页关闭">×</button>
          </div>
        </header>
        <main class="kmh-messages" data-role="messages">
          ${renderMessages(state.messages)}
        </main>
        ${state.notice ? `<div class="kmh-notice">${escapeHtml(state.notice)}</div>` : ''}
        <footer class="kmh-compose">
          <textarea class="kmh-input" data-role="input" rows="2" placeholder="例如：🎨 找一个 AI 绘图插件，最好支持文生图和图生图"></textarea>
          <div class="kmh-dialog-actions">
            <button class="kmh-secondary" type="button" data-action="clear-current-chat">🧹 清空当前对话</button>
            <button class="kmh-secondary" type="button" data-action="clear-all-history">🗑️ 清空所有历史</button>
          </div>
          <div class="kmh-compose-actions">
            <select class="kmh-send-mode" data-role="send-mode" title="选择回车发送方式">
              <option value="enter" ${state.sendMode === 'enter' ? 'selected' : ''}>↵ Enter 发送</option>
              <option value="ctrlEnter" ${state.sendMode === 'ctrlEnter' ? 'selected' : ''}>⌘ Ctrl+Enter 发送</option>
            </select>
            <button class="kmh-secondary" type="button" data-action="local-search" ${state.busy ? 'disabled' : ''}>🧭 本地搜索</button>
            <button class="${state.busy ? 'kmh-stop' : 'kmh-primary'}" type="button" data-action="send" title="${state.busy ? '停止当前请求，快捷键 Esc' : '发送当前输入'}">${state.busy ? '⏹ 停止' : '🚀 发送'}</button>
          </div>
        </footer>
      </section>
    </div>
  `;
}

function renderAbout(state: AppState): string {
  return `
    <section id="kmh-about-panel" class="kmh-about ${state.aboutOpen ? 'kmh-about-open' : 'kmh-about-closed'}" role="dialog" aria-labelledby="kmh-about-title" aria-hidden="${state.aboutOpen ? 'false' : 'true'}" ${state.aboutOpen ? '' : 'inert'}>
      <div class="kmh-about-head">
        <div>
          <div id="kmh-about-title" class="kmh-about-title">ℹ️ 关于 ${escapeHtml(APP_SHORT_NAME)}</div>
          <div class="kmh-about-subtitle">概览、快速上手、最佳实践与隐私说明</div>
        </div>
        <button class="kmh-secondary" type="button" data-action="close-about">✕ 关闭</button>
      </div>
      <div class="kmh-about-tabs" role="tablist" aria-label="关于页面分类">
        ${renderAboutTab('overview', '概览', state.aboutTab)}
        ${renderAboutTab('quickstart', '快速上手', state.aboutTab)}
        ${renderAboutTab('practices', '最佳实践', state.aboutTab)}
        ${renderAboutTab('privacy', '隐私帮助', state.aboutTab)}
      </div>
      <div class="kmh-about-body">
        ${renderAboutOverview(state)}
        ${renderAboutQuickStart(state)}
        ${renderAboutPractices(state)}
        ${renderAboutPrivacy(state)}
      </div>
    </section>
  `;
}

function renderAboutTab(tab: AboutTab, label: string, activeTab: AboutTab): string {
  const active = tab === activeTab;
  return `<button id="kmh-about-tab-${tab}" class="kmh-about-tab ${active ? 'kmh-about-tab-active' : ''}" type="button" role="tab" data-about-tab="${tab}" aria-controls="kmh-about-pane-${tab}" aria-selected="${active ? 'true' : 'false'}" tabindex="${active ? '0' : '-1'}">${label}</button>`;
}

function renderAboutOverview(state: AppState): string {
  const active = state.aboutTab === 'overview';
  return `
    <section id="kmh-about-pane-overview" class="kmh-about-pane" role="tabpanel" aria-labelledby="kmh-about-tab-overview" tabindex="0" ${active ? '' : 'hidden inert'}>
      <div class="kmh-about-product">
        <div class="kmh-about-product-name">${escapeHtml(APP_SHORT_NAME)}</div>
        <div class="kmh-about-badges">
          <span>v${escapeHtml(APP_VERSION)}</span>
          <span>${escapeHtml(APP_RELEASE_CHANNEL)}</span>
          <span>${escapeHtml(APP_LICENSE)}</span>
        </div>
        <p>${escapeHtml(APP_DESCRIPTION)}</p>
      </div>
      <dl class="kmh-about-meta">
        <div><dt>作者</dt><dd>${escapeHtml(APP_AUTHOR_NAME)}</dd></div>
        <div><dt>邮箱</dt><dd><a href="mailto:${escapeAttr(APP_AUTHOR_EMAIL)}">${escapeHtml(APP_AUTHOR_EMAIL)}</a></dd></div>
        <div><dt>当前请求格式</dt><dd>${escapeHtml(providerLabel(state.config.provider))}</dd></div>
        <div><dt>当前模型</dt><dd>${escapeHtml(state.config.model)}</dd></div>
        <div><dt>本地索引</dt><dd>${state.registry ? `${escapeHtml(String(state.registry.objects.length))} 个插件` : '尚未加载'}</dd></div>
      </dl>
      <div class="kmh-about-links" aria-label="项目链接">
        ${renderExternalLink('GitHub', APP_LINKS.github)}
        ${renderExternalLink('Gitee', APP_LINKS.gitee)}
        ${renderExternalLink('Greasy Fork', APP_LINKS.greasyFork)}
        ${renderExternalLink('QQ 群', APP_LINKS.qqGroup)}
      </div>
    </section>
  `;
}

function renderAboutQuickStart(state: AppState): string {
  const active = state.aboutTab === 'quickstart';
  return `
    <section id="kmh-about-pane-quickstart" class="kmh-about-pane" role="tabpanel" aria-labelledby="kmh-about-tab-quickstart" tabindex="0" ${active ? '' : 'hidden inert'}>
      <section class="kmh-about-section">
        <h3>快速上手</h3>
        <ol>
          <li>打开设置，选择 OpenAI-compatible 或 Anthropic，并填写 Base URL 与 API Key。</li>
          <li>点击模型字段旁的刷新按钮获取模型，也可以直接手工输入模型名称。</li>
          <li>输入插件需求后点击发送；不希望请求 LLM 时使用“本地搜索”。</li>
        </ol>
      </section>
    </section>
  `;
}

function renderAboutPractices(state: AppState): string {
  const active = state.aboutTab === 'practices';
  return `
    <section id="kmh-about-pane-practices" class="kmh-about-pane" role="tabpanel" aria-labelledby="kmh-about-tab-practices" tabindex="0" ${active ? '' : 'hidden inert'}>
      <section class="kmh-about-section">
        <h3>最佳实践</h3>
        <ul>
          <li>先用本地搜索验证关键词，再让 AI 对候选插件进行语义重排。</li>
          <li>思考模式建议保持“自动”；明确开启 Anthropic 思考时，最大输出 token 建议至少 2400。</li>
          <li>“思考模式”控制请求偏好，“聊天过程”只控制界面展示多少推理与阶段信息。</li>
          <li>共享电脑建议关闭 API Key 持久化，聊天历史按需开启。</li>
          <li>推荐结果不等同于安全审计，安装前仍应检查插件权限、源码与维护状态。</li>
        </ul>
      </section>
    </section>
  `;
}

function renderAboutPrivacy(state: AppState): string {
  const active = state.aboutTab === 'privacy';
  const sendKey = state.sendMode === 'ctrlEnter' ? 'Ctrl/Cmd + Enter' : 'Enter';
  return `
    <section id="kmh-about-pane-privacy" class="kmh-about-pane" role="tabpanel" aria-labelledby="kmh-about-tab-privacy" tabindex="0" ${active ? '' : 'hidden inert'}>
      <section class="kmh-about-section">
        <h3>隐私与存储</h3>
        <ul>
          <li>本地搜索会读取 Koishi registry，但不会请求 LLM。</li>
          <li>AI 搜索会把搜索需求与候选插件摘要发送到你配置的 API。</li>
          <li>API Key 当前${state.config.persistApiKey ? '保存于 Tampermonkey 本地存储' : '仅保留在本页会话'}。</li>
          <li>聊天历史当前${state.config.saveHistory ? '会保存到 Tampermonkey 本地存储' : '不会持久化保存'}。</li>
          <li>脚本不会读取或上传 Koishi 登录凭据。</li>
        </ul>
      </section>
      <section class="kmh-about-section">
        <h3>快捷键</h3>
        <ul>
          <li>${sendKey} 发送，Shift + Enter 始终换行。</li>
          <li>另一种发送组合用于换行，可在输入框下方切换发送方式。</li>
          <li>Esc 优先停止当前请求；模型列表打开时先关闭列表，否则关闭当前焦点所在或最近打开的辅助面板。</li>
        </ul>
      </section>
    </section>
  `;
}

function renderExternalLink(label: string, href: string): string {
  return `<a class="kmh-about-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderSettings(state: AppState, apiKey: string): string {
  return `
    <section id="kmh-settings-panel" class="kmh-settings ${state.settingsOpen ? 'kmh-back-open' : 'kmh-back-closed'}" role="dialog" aria-label="设置" aria-hidden="${state.settingsOpen ? 'false' : 'true'}" ${state.settingsOpen ? '' : 'inert'}>
      <div class="kmh-settings-actions">
        <button class="kmh-primary" type="button" data-action="save-settings">💾 保存设置</button>
        <button class="kmh-secondary" type="button" data-action="disable-host">🚫 在此站点禁用</button>
        <button class="kmh-secondary" type="button" data-action="clear-history">🗑️ 清空历史</button>
      </div>
      <div class="kmh-settings-feedback" data-role="settings-feedback" aria-live="polite"></div>
      <div class="kmh-settings-grid">
        <label>
          <span>🤖 请求格式</span>
          <select data-setting="provider">
            <option value="openai" ${state.config.provider === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
            <option value="anthropic" ${state.config.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          </select>
        </label>
        <label>
          <span>🌐 Base URL</span>
          <input data-setting="baseUrl" value="${escapeAttr(state.config.baseUrl)}" placeholder="https://api.deepseek.com">
        </label>
        <div class="kmh-setting-field kmh-model-setting">
          <label for="kmh-model-input">🧠 模型</label>
          <div class="kmh-model-control">
            <input id="kmh-model-input" data-setting="model" value="${escapeAttr(state.config.model)}" placeholder="deepseek-v4-flash" autocomplete="off" aria-describedby="kmh-model-status">
            <button class="kmh-secondary kmh-model-action" type="button" data-action="model-primary" data-mode="${state.modelOptions.length ? 'menu' : 'fetch'}" title="${state.modelOptions.length ? '打开模型列表' : '获取模型列表'}" aria-label="${state.modelOptions.length ? '打开模型列表' : '获取模型列表'}" aria-controls="kmh-model-menu" aria-expanded="false" ${state.modelOptions.length ? 'aria-haspopup="listbox"' : ''}>
              <span class="kmh-model-icon kmh-model-refresh-icon">${renderIcon('refresh')}</span>
              <span class="kmh-model-icon kmh-model-chevron-icon">${renderIcon('chevron-down')}</span>
            </button>
          </div>
          <div id="kmh-model-menu" class="kmh-model-menu" data-role="model-menu" hidden>
            ${renderModelMenu(state)}
          </div>
          <span id="kmh-model-status" class="kmh-field-help" data-role="model-status" aria-live="polite">${state.modelOptions.length ? `已加载 ${state.modelOptions.length} 个模型，可输入或从候选列表选择。` : '可手工输入，或点击右侧按钮从当前服务获取。'}</span>
        </div>
        <label>
          <span>🔑 API key</span>
          <input data-setting="apiKey" type="password" value="${escapeAttr(apiKey)}" placeholder="sk-...">
        </label>
        <label>
          <span>🧭 本地召回数量</span>
          <input data-setting="recallLimit" type="number" min="5" max="80" value="${escapeAttr(String(state.config.recallLimit))}">
        </label>
        <label>
          <span>📏 最大输出 token</span>
          <input data-setting="maxTokens" type="number" min="300" max="10000" value="${escapeAttr(String(state.config.maxTokens))}">
        </label>
        <label>
          <span>💭 思考模式</span>
          <select data-setting="thinkingMode">
            <option value="auto" ${state.config.thinkingMode === 'auto' ? 'selected' : ''}>自动 · 最兼容</option>
            <option value="enabled" ${state.config.thinkingMode === 'enabled' ? 'selected' : ''}>开启 · 接口支持时启用</option>
            <option value="disabled" ${state.config.thinkingMode === 'disabled' ? 'selected' : ''}>关闭 · 接口支持时禁用</option>
          </select>
          <span class="kmh-field-help">Anthropic 明确开启时最大输出 token 至少需要 2048。</span>
        </label>
        <label>
          <span>💬 聊天过程</span>
          <select data-setting="chatDetail">
            <option value="chatty" ${state.config.chatDetail === 'chatty' ? 'selected' : ''}>chatty · 显示推理与正文</option>
            <option value="normal" ${state.config.chatDetail === 'normal' ? 'selected' : ''}>normal · 显示阶段与正文</option>
            <option value="quiet" ${state.config.chatDetail === 'quiet' ? 'selected' : ''}>quiet · 只显示必要结果</option>
          </select>
        </label>
        <label>
          <span>🧾 Log level</span>
          <select data-setting="logLevel">
            <option value="error" ${state.config.logLevel === 'error' ? 'selected' : ''}>error</option>
            <option value="warn" ${state.config.logLevel === 'warn' ? 'selected' : ''}>warn</option>
            <option value="info" ${state.config.logLevel === 'info' ? 'selected' : ''}>info</option>
            <option value="debug" ${state.config.logLevel === 'debug' ? 'selected' : ''}>debug</option>
            <option value="trace" ${state.config.logLevel === 'trace' ? 'selected' : ''}>trace</option>
          </select>
        </label>
      </div>
      <label class="kmh-check">
        <input data-setting="persistApiKey" type="checkbox" ${state.config.persistApiKey ? 'checked' : ''}>
        <span>🔐 保存 API key 到 Tampermonkey 存储</span>
      </label>
      <label class="kmh-check">
        <input data-setting="saveHistory" type="checkbox" ${state.config.saveHistory ? 'checked' : ''}>
        <span>💬 保存聊天历史</span>
      </label>
      <label class="kmh-check">
        <input data-setting="stream" type="checkbox" ${state.config.stream ? 'checked' : ''}>
        <span>🌊 优先尝试流式输出，失败时自动非流式重试</span>
      </label>
    </section>
  `;
}

function renderModelMenu(state: AppState): string {
  if (!state.modelOptions.length) return '';
  const activeModel = state.modelOptions.some((model) => model.id === state.config.model)
    ? state.config.model
    : state.modelOptions[0]?.id;
  return `
    <div class="kmh-model-menu-head">
      <span>${state.modelOptions.length} 个模型</span>
      <button class="kmh-secondary kmh-model-refresh" type="button" data-action="fetch-models" title="重新获取模型列表" aria-label="重新获取模型列表">${renderIcon('refresh')}</button>
    </div>
    <div class="kmh-model-menu-list" role="listbox" aria-label="可用模型">
      ${state.modelOptions.map((model) => `
        <button class="kmh-model-option" type="button" role="option" data-model-id="${escapeAttr(model.id)}" title="${escapeAttr(model.id)}" aria-selected="${model.id === state.config.model ? 'true' : 'false'}" tabindex="${model.id === activeModel ? '0' : '-1'}">
          <span>${escapeHtml(model.id)}</span>
          ${model.ownedBy ? `<small>${escapeHtml(model.ownedBy)}</small>` : ''}
        </button>
      `).join('')}
    </div>
  `;
}

function renderLogs(state: AppState): string {
  const last = state.logs[state.logs.length - 1];
  return `
    <section id="kmh-log-panel" class="kmh-log ${state.logOpen ? 'kmh-back-open' : 'kmh-back-closed'}" role="dialog" aria-label="调试日志" aria-hidden="${state.logOpen ? 'false' : 'true'}" ${state.logOpen ? '' : 'inert'}>
      <div class="kmh-back-header">
        <div>
          <div class="kmh-back-title">🧾 调试日志 ${state.logs.length}</div>
          <div class="kmh-back-subtitle">${last ? escapeHtml(last.message) : '📭 暂无日志'}</div>
        </div>
        <div class="kmh-log-tools">
          <label>
            <span>📋 复制上限</span>
            <input data-role="log-copy-limit" type="number" min="1" max="1000000" value="${escapeAttr(String(state.logCopyLimit))}">
          </label>
          <button class="kmh-secondary" type="button" data-action="copy-log" title="复制日志到剪贴板">📋 复制日志</button>
          <button class="kmh-secondary" type="button" data-action="clear-log">🧹 清空</button>
        </div>
      </div>
      <div class="kmh-log-body">
        ${state.logs.length ? state.logs.map(renderLogEntry).join('') : '<div class="kmh-log-empty">📭 暂无日志。</div>'}
      </div>
    </section>
  `;
}

export function renderMessages(messages: Message[]): string {
  return messages.map((message, index) => renderMessage(message, index)).join('');
}

function renderMessage(message: Message, index: number): string {
  return `
    <article class="kmh-message kmh-${message.role}">
      <div class="kmh-message-role">${message.role === 'user' ? '🧑 你' : '🤖 助手'}</div>
      ${message.progress ? `<div class="kmh-message-progress">${escapeHtml(message.progress)}</div>` : ''}
      ${message.reasoning ? renderReasoning(message, index) : ''}
      <div class="kmh-message-content">${formatContent(message.content)}</div>
      ${message.cards?.length ? renderCards(message.cards) : ''}
      ${message.notes?.length ? renderNotes(message.notes) : ''}
    </article>
  `;
}

function renderReasoning(message: Message, index: number): string {
  const isOpen = Boolean(message.reasoningOpen);
  const chars = message.reasoning?.length || 0;
  return `
    <section class="kmh-reasoning">
      <button class="kmh-reasoning-head" type="button" data-action="toggle-reasoning" data-message-index="${escapeAttr(String(index))}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <span>🧠 思考过程 · ${escapeHtml(String(chars))} chars</span>
        <span>${isOpen ? '收起' : '展开'}</span>
      </button>
      <div class="kmh-message-reasoning ${isOpen ? 'kmh-reasoning-open' : 'kmh-reasoning-collapsed'}" data-role="reasoning-body" data-message-index="${escapeAttr(String(index))}">
        ${formatContent(message.reasoning || '')}
      </div>
    </section>
  `;
}

function renderNotes(notes: string[]): string {
  return `<ul class="kmh-notes">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
}

function renderCards(cards: PluginSummary[]): string {
  return `<div class="kmh-cards">${cards.map(renderCard).join('')}</div>`;
}

function renderCard(card: PluginSummary): string {
  const badges = [
    card.category ? CATEGORY_LABELS[card.category] || card.category : '',
    card.verified ? '✅ 认证' : '',
    card.downloadsLastMonth ? `📦 30日下载 ${card.downloadsLastMonth}` : '',
  ].filter(Boolean);
  return `
    <section class="kmh-card">
      <div class="kmh-card-title">${escapeHtml(card.name)}${card.version ? `<span>@${escapeHtml(card.version)}</span>` : ''}</div>
      ${badges.length ? `<div class="kmh-card-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
      ${card.description || card.reason ? `<p>${escapeHtml(card.reason || card.description)}</p>` : ''}
      ${card.warning ? `<p class="kmh-warning">${escapeHtml(card.warning)}</p>` : ''}
      <div class="kmh-card-actions">
        <button type="button" data-card-action="apply-search" data-query="${escapeAttr(card.query || card.shortname || card.name)}">🔎 填入本页</button>
        <button type="button" data-card-action="open-market" data-query="${escapeAttr(card.query || card.shortname || card.name)}">🧩 打开市场搜索</button>
        <button type="button" data-card-action="copy" data-name="${escapeAttr(card.name)}">📋 复制包名</button>
        ${card.npm ? `<button type="button" data-card-action="open-url" data-url="${escapeAttr(card.npm)}">npm</button>` : ''}
        ${card.homepage || card.repository ? `<button type="button" data-card-action="open-url" data-url="${escapeAttr(card.homepage || card.repository)}">🏠 主页/仓库</button>` : ''}
      </div>
    </section>
  `;
}

function renderLogEntry(entry: LogEntry): string {
  return `
    <article class="kmh-log-entry kmh-log-${entry.level}">
      <div class="kmh-log-line">
        <span class="kmh-log-level">${escapeHtml(entry.level.toUpperCase())}</span>
        <span class="kmh-log-time">${escapeHtml(entry.time)}</span>
        <span class="kmh-log-message">${escapeHtml(entry.message)}</span>
      </div>
      ${entry.detail ? `<pre>${escapeHtml(entry.detail)}</pre>` : ''}
    </article>
  `;
}
