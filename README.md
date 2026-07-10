# 🔍 Tampermonkey Plugin Koishi Market AI Helper

Koishi 插件市场的 AI 对话式搜索助手。脚本以 TypeScript 编写，通过 Vite 和 `vite-plugin-monkey` 构建为单文件 userscript。

## 🧰 环境要求

- Node.js 24+
- npm 11+
- Tampermonkey 或 Violentmonkey

## 📦 安装依赖

```bash
npm install
```

如果本机 npm 全局缓存目录权限异常，可以临时使用项目内缓存：

```bash
npm install --cache ./.npm-cache
```

CI / GitHub Actions 使用 lockfile 安装：

```bash
npm ci
```

## 🛠️ 开发

启动 Vite 开发服务：

```bash
npm run dev
```

入口文件在：

```text
src/mainEntry.ts
```

Tampermonkey 元数据配置在：

```text
vite.config.ts
```

## 🏗️ 构建

生成 userscript：

```bash
npm run build
```

构建产物：

```text
dist/tampermonkey-plugin-koishi-market-ai-helper.user.js
```

`dist/` 不提交到 git，由本地构建或 GitHub Actions 生成。

## ✅ 检查

只做 TypeScript 类型检查：

```bash
npm run typecheck
```

检查生成后的 userscript 语法：

```bash
npm run syntax
```

完整检查：

```bash
npm run check
```

`npm run check` 会依次执行：

```bash
npm run typecheck
npm run build
npm run syntax
```

## 🔖 版本更新

项目版本以 `package.json` 为准，`vite.config.ts` 会读取这个版本并写入 userscript 的 `@version`。

推荐用 `npm version` 更新版本：

```bash
npm version patch --no-git-tag-version
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
npm version 0.2.2 --no-git-tag-version
```

`npm version` 会同步更新 `package.json` 和 `package-lock.json`。

这里使用 `--no-git-tag-version`，表示只改文件，不自动创建 git commit 和 tag。

如果已经手动改过 `package.json`，可以用下面的命令只刷新 lockfile：

```bash
npm install --package-lock-only
```

`npm install --package-lock-only` 只更新 `package-lock.json`，不安装依赖，也不改 `node_modules`。

## 🚀 提交前流程

普通开发提交前建议执行：

```bash
npm run check
git status
git add -A
git commit -m "build action: 描述本次变更"
git push origin main
```

发 GitHub Release 或发布 GitHub Pages 时使用：

```bash
# 如果这次需要递增版本号，先执行这一行；只重新发布当前版本时可以跳过
npm version patch --no-git-tag-version
npm run check
git add -A

# 二选一：发布 Release
git commit -m "build release: release vX.Y.Z"

# 二选一：发布 Pages
git commit -m "build publish: deploy userscript page"
git push origin main
```

## ⚙️ GitHub Actions

GitHub Actions 会在 push 到 `main` 或 `master` 时运行。

默认只有提交信息包含以下关键词时，才会执行构建或发布：

```text
build action
build release
build publish
```

含义：

| 提交关键词 | 行为 |
| --- | --- |
| `build action` | 只运行类型检查、构建和语法检查，并上传临时 artifact，不发布到外部渠道 |
| `build release` | 构建并创建/更新 GitHub Release，只发布 Release assets |
| `build publish` | 构建并发布 GitHub Pages 固定安装地址，不创建 Release |

示例：

```bash
git commit -m "build action: verify workflow"
git commit -m "build release: release vX.Y.Z"
git commit -m "build publish: deploy userscript page"
git push
```

也可以在 GitHub Actions 页面手动运行 workflow，并选择 `action`、`release` 或 `publish`。

`build release` 会上传：

```text
tampermonkey-plugin-koishi-market-ai-helper.user.js
tampermonkey-plugin-koishi-market-ai-helper-dist.tar.gz
SHA256SUMS.txt
```

## 🧩 一键安装

发布 Release 后，可以用 latest 直链安装：

```text
https://github.com/OWNER/REPO/releases/latest/download/tampermonkey-plugin-koishi-market-ai-helper.user.js
```

将 `OWNER/REPO` 替换为实际 GitHub 仓库路径。

发布 GitHub Pages 后，可以用固定地址安装：

```text
https://OWNER.github.io/tampermonkey-plugin-koishi-market-ai-helper/tampermonkey-plugin-koishi-market-ai-helper.user.js
```

将 `OWNER` 替换为实际 GitHub 用户名或组织名。

## 🌐 分发渠道说明

GitHub Release 是版本归档和 changelog 主渠道。

GitHub Pages 是固定安装 URL，适合后续作为 `@downloadURL` / `@updateURL` 候选。

Greasy Fork 和 OpenUserJS 更适合在平台侧配置 GitHub 同步或 webhook；当前 workflow 不直接携带平台账号 token 上传。

GitHub / Gist Raw 指的是用户直接访问 Raw `.user.js` 安装。当前项目不提交 `dist/`，所以正式安装优先使用 Release 或 Pages。

## 📜 常用 npm scripts

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖并生成/更新 `node_modules` |
| `npm ci` | 按 `package-lock.json` 干净安装，适合 CI |
| `npm run dev` | 启动 Vite 开发服务 |
| `npm run build` | 构建 userscript 到 `dist/` |
| `npm run typecheck` | 执行 `tsc --noEmit` |
| `npm run syntax` | 对构建后的 `.user.js` 执行 `node --check` |
| `npm run check` | 类型检查 + 构建 + 语法检查 |
