import packageJson from '../../package.json';

export const APP_ID = 'tampermonkey-plugin-koishi-market-ai-helper';
export const APP_DISPLAY_NAME = 'Tampermonkey Plugin Koishi Market AI Helper';
export const APP_SHORT_NAME = 'Koishi Market AI Helper';
export const APP_LOG_PREFIX = `[${APP_DISPLAY_NAME}]`;
export const APP_VERSION = packageJson.version;
export const APP_DESCRIPTION = packageJson.description;
export const APP_LICENSE = packageJson.license;
export const APP_AUTHOR_NAME = packageJson.author.replace(/\s*<.*>$/, '');
export const APP_AUTHOR_EMAIL = packageJson.author.match(/<([^>]+)>/)?.[1] || '';
export const APP_RELEASE_CHANNEL = APP_VERSION.includes('-')
  ? APP_VERSION.split('-')[1]?.split('.')[0]?.toUpperCase() || 'PREVIEW'
  : 'STABLE';

export const APP_LINKS = {
  github: 'https://github.com/VincentZyuApps/tampermonkey-plugin-koishi-market-ai-helper',
  gitee: 'https://gitee.com/vincent-zyu/tampermonkey-plugin-koishi-market-ai-helper',
  greasyFork: 'https://greasyfork.org/zh-CN/scripts/586466-tampermonkey-plugin-koishi-market-ai-helper',
  qqGroup: 'https://qm.qq.com/q/ZN7fxZ3qCq',
} as const;
