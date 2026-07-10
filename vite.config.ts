import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import packageJson from './package.json';
import { APP_DISPLAY_NAME } from './src/app/appMeta';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/mainEntry.ts',
      userscript: {
        name: APP_DISPLAY_NAME,
        namespace: 'npm/tampermonkey-plugin-koishi-market-ai-helper',
        version: packageJson.version,
        description: 'Koishi 插件市场的 AI 对话式搜索助手，支持本地启发式召回、OpenAI-compatible 与 Anthropic。',
        author: 'VincentZyu233',
        include: [
          '/^https?:\\/\\/.+\\/market\\/?([?#].*)?$/',
          '/^https?:\\/\\/koishi\\.chat\\/[^/]+\\/market\\/?([?#].*)?$/',
        ],
        'run-at': 'document-idle',
        grant: [
          'GM_xmlhttpRequest',
          'GM_getValue',
          'GM_setValue',
          'GM_deleteValue',
          'GM_setClipboard',
          'GM_registerMenuCommand',
        ],
        connect: [
          'registry.koishi.chat',
          'api.deepseek.com',
          'api.openai.com',
          'api.anthropic.com',
          '*',
        ],
      },
    }),
  ],
  build: {
    minify: false,
    sourcemap: false,
  },
});
