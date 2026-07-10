# GitHub Actions 发布与 Greasy Fork 同步

## 触发方式

提交信息里包含这些关键词时会触发不同发布行为：

```text
build action
build release
build publish
```

行为矩阵：

| 行为 | `build action` | `build release` | `build publish` |
| --- | --- | --- | --- |
| 检查提交信息 | ✅ | ✅ | ✅ |
| 安装依赖 | ✅ | ✅ | ✅ |
| 类型检查 | ✅ | ✅ | ✅ |
| 构建 userscript | ✅ | ✅ | ✅ |
| 语法检查 | ✅ | ✅ | ✅ |
| 上传临时 artifact | ✅ | ✅ | ✅ |
| 创建或更新 GitHub Release | ❌ | ✅ | ✅ |
| 上传 Release assets | ❌ | ✅ | ✅ |
| 部署 GitHub Pages | ❌ | ❌ | ✅ |
| 触发 Greasy Fork 同步 | ❌ | ✅ | ✅ |

示例：

```bash
git commit -m "build action: verify workflow"
git commit -m "build release: release vX.Y.Z"
git commit -m "build publish: release and deploy userscript page"
git push
```

也可以在 GitHub Actions 页面手动运行 workflow，并选择 `action`、`release` 或 `publish`。

`build release` 会上传：

```text
tampermonkey-plugin-koishi-market-ai-helper.user.js
tampermonkey-plugin-koishi-market-ai-helper-dist.tar.gz
SHA256SUMS.txt
```

`build release` 和 `build publish` 都会创建或更新 GitHub Release；如果仓库配置了 Greasy Fork 的 GitHub release webhook，Greasy Fork 会在 release 事件后检查同步来源。

常用发布命令：

```bash
npm version patch --no-git-tag-version
npm run check
git add -A
git commit -m "build publish: release and deploy userscript page"
git push origin main
```

## Greasy Fork 同步来源

进入脚本管理页：

```text
https://greasyfork.org/zh-CN/scripts/586466-tampermonkey-plugin-koishi-market-ai-helper/admin
```

在“源代码同步”区域设置：

1. `此脚本的同步方式` 选择 `自动`。
2. `同步安装链接` 填写 GitHub Release latest 直链：

```text
https://github.com/VincentZyuApps/tampermonkey-plugin-koishi-market-ai-helper/releases/latest/download/tampermonkey-plugin-koishi-market-ai-helper.user.js
```

Greasy Fork 的 webhook 说明页明确支持这个格式：

```text
https://github.com/YourRepoName/YourProjectName/releases/latest/download/script.user.js
```

注意：这个格式只用于 GitHub release webhook 事件。因此本仓库不使用 GitHub Pages URL 作为 Greasy Fork 同步来源。

## 配置 GitHub Webhook

进入 GitHub 仓库：

```text
Settings -> Webhooks -> Add webhook
```

按 Greasy Fork 页面给出的信息填写：

| 字段 | 值 |
| --- | --- |
| Payload URL | `https://greasyfork.org/zh-CN/users/1621917-vincentzyu233/webhook` |
| Content type | `application/json` |
| Secret | 留空 |
| Which events would you like to trigger this webhook? | 选择 `Let me select individual events` |
| Pushes | 取消勾选 |
| Releases | 勾选 |
| Active | 勾选 |

选择 `Releases` 的原因：本仓库的 Greasy Fork 同步 URL 使用 `releases/latest/download/*.user.js`，Greasy Fork 说明这个格式只适用于 release events。

配置完成后，本仓库执行 `build release` 或 `build publish` 创建/更新 GitHub Release 时，GitHub 会把 release webhook 发给 Greasy Fork，Greasy Fork 再检查 latest release asset 并同步脚本。

## 可选：Actions Secret 通知

当前 workflow 里保留了 `notify-greasyfork` job。它会读取：

```text
secrets.GREASYFORK_WEBHOOK_URL
```

如果只使用上面的 GitHub 仓库 Webhook，可以不配置这个 secret。

如果想让 GitHub Actions 在 `build publish` 的最后也主动 POST 一次 Greasy Fork webhook，可以进入：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

新增：

```text
Name: GREASYFORK_WEBHOOK_URL
Value: https://greasyfork.org/zh-CN/users/1621917-vincentzyu233/webhook
```

不建议同时长期启用“GitHub 仓库 Webhook”和这个 Actions secret，避免一次 release 产生两次通知。当前更推荐使用 GitHub 仓库 Webhook。

`notify-greasyfork` 会读取：

```text
secrets.GREASYFORK_WEBHOOK_URL
```

如果没有配置，会输出：

```text
GREASYFORK_WEBHOOK_URL is not configured. Skipping Greasy Fork webhook notification.
```

这是正常跳过，不代表 Release 或 Pages 发布失败。

如果已经配置 secret，workflow 会向 Greasy Fork webhook POST 一份 release payload，用于通知 Greasy Fork 检查同步来源。

## 验证

发布后检查：

1. GitHub Actions 里的 `check-commit`、`build-dist`、`publish-release`、`publish-pages` 都成功。
2. GitHub 仓库 `Settings -> Webhooks` 中 Greasy Fork webhook 的最近一次投递为成功。
3. Greasy Fork 脚本历史里出现新版本。
4. Greasy Fork 页面展示的 `@version` 和 `package.json` 一致。

如果 Greasy Fork 没更新，先确认：

1. `package.json` 版本号已递增。
2. Release latest 直链能下载 `.user.js`。
3. `.user.js` 头部的 `@version` 已更新。
4. GitHub Webhook 事件选择了 `Releases`。
5. GitHub Webhook 的 `Payload URL` 是 Greasy Fork 页面显示的 webhook URL。
