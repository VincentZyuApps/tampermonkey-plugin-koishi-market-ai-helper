# GitHub Actions 发布、Gitee 镜像与 Greasy Fork 同步

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
| 同步 Gitee 仓库代码 | ✅ | ✅ | ✅ |
| 创建或更新 GitHub Release | ❌ | ✅ | ✅ |
| 上传 Release assets | ❌ | ✅ | ✅ |
| 同步 Gitee Release assets | ❌ | ✅ | ✅ |
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

`build release` 和 `build publish` 会上传：

```text
tampermonkey-plugin-koishi-market-ai-helper.user.js
tampermonkey-plugin-koishi-market-ai-helper-dist.tar.gz
SHA256SUMS.txt
```

常用发布命令：

```bash
npm version patch --no-git-tag-version
npm run check
git add -A
git commit -m "build publish: release and deploy userscript page"
git push origin main
```

## Gitee 同步

Gitee 仓库地址：

```text
https://gitee.com/vincent-zyu/tampermonkey-plugin-koishi-market-ai-helper
```

`sync-gitee-code` 会在 push 或手动运行 workflow 时同步 GitHub 仓库代码到 Gitee：

```text
GitHub VincentZyuApps/tampermonkey-plugin-koishi-market-ai-helper
-> Gitee vincent-zyu/tampermonkey-plugin-koishi-market-ai-helper
```

`sync-gitee-release` 会在 `build release` 或 `build publish` 的 GitHub Release 成功后运行：

1. 读取 GitHub Release 正文和 assets。
2. 下载 GitHub Release assets。
3. 确认 Gitee tag 存在，不存在则从 Gitee `main` 创建。
4. 如果同 tag 的 Gitee Release 已存在，删除旧 Gitee Release。
5. 重新创建 Gitee Release。
6. 上传全部 Release assets。

Gitee Release 同步失败会让整个 GitHub Actions 变红。这样可以避免 GitHub 已发布、Gitee 没同步时被误认为完整发布成功。

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

配置完成后，本仓库执行 `build release` 或 `build publish` 创建或更新 GitHub Release 时，GitHub 会把 release webhook 发给 Greasy Fork，Greasy Fork 再检查 latest release asset 并同步脚本。

## Actions 仓库密钥总表

在 GitHub 仓库中打开：

```text
Settings -> Secrets and variables -> Actions
```

| Key | 类型 | 是否需要手动配置 | 用途 | 配置说明 |
| --- | --- | --- | --- | --- |
| `GITHUB_TOKEN` | GitHub 内置 token | ❌ | 创建或更新 GitHub Release、读取 Release assets | [查看说明](#key-github-token) |
| `GITEE_PRIVATE_KEY` | Repository secret | ✅ | `Yikun/hub-mirror-action` 推送 Gitee 镜像代码 | [配置步骤](#key-gitee-private-key) |
| `GITEE_TOKEN` | Repository secret | ✅ | Gitee 代码镜像校验、创建 tag / Release、上传 Release 附件 | [配置步骤](#key-gitee-token) |
| `GREASYFORK_WEBHOOK_URL` | Repository secret | 可选 | Actions 最后主动通知 Greasy Fork webhook | [配置步骤](#key-greasyfork-webhook-url) |

<a id="key-github-token"></a>

### `GITHUB_TOKEN`

`GITHUB_TOKEN` 是 GitHub Actions 自动提供的内置 token，不需要在仓库 secrets 里手动新增。

本 workflow 需要这些权限：

```yaml
permissions:
  contents: write
  pages: write
  id-token: write
```

`contents: write` 用于创建或更新 GitHub Release，`pages: write` 和 `id-token: write` 用于部署 GitHub Pages。

<a id="key-gitee-private-key"></a>

### `GITEE_PRIVATE_KEY`

`GITEE_PRIVATE_KEY` 是同步代码到 Gitee 时使用的 SSH 私钥。建议为这个 workflow 单独生成一对 SSH key。

Bash / Git Bash / Linux / macOS：

```bash
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -C "koishi-market-ai-helper-gitee-mirror" -f ~/.ssh/koishi_market_ai_helper_gitee_mirror -N ""
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force "$HOME\.ssh"
ssh-keygen -t ed25519 -C "koishi-market-ai-helper-gitee-mirror" -f "$HOME\.ssh\koishi_market_ai_helper_gitee_mirror"
```

PowerShell 提示 `Enter passphrase` 和 `Enter same passphrase again` 时，连续按两次回车即可留空 passphrase。

复制公钥：

```powershell
Get-Content "$HOME\.ssh\koishi_market_ai_helper_gitee_mirror.pub"
```

把公钥添加到 Gitee：

```text
https://gitee.com/profile/sshkeys
```

复制私钥：

```powershell
Get-Content "$HOME\.ssh\koishi_market_ai_helper_gitee_mirror" -Raw
```

在 GitHub Actions secrets 新增：

```text
Name: GITEE_PRIVATE_KEY
Value: 上面复制的完整私钥，包括 BEGIN 和 END 行
```

可选 SSH 连通性检查：

```powershell
ssh -i "$HOME\.ssh\koishi_market_ai_helper_gitee_mirror" -T git@gitee.com
```

不要复用日常个人 SSH 私钥。如果这个私钥出现在聊天、issue、日志或不可信机器上，应删除对应 Gitee 公钥和 GitHub secret 后重新生成。

<a id="key-gitee-token"></a>

### `GITEE_TOKEN`

`GITEE_TOKEN` 是 Gitee 私人令牌，用于 Gitee API 和代码镜像动作。

创建地址：

```text
https://gitee.com/profile/personal_access_tokens
```

建议创建专用 token，名称可以填：

```text
koishi-market-ai-helper-github-actions
```

权限要求：

| 项目 | 值 |
| --- | --- |
| Gitee 仓库 | `vincent-zyu/tampermonkey-plugin-koishi-market-ai-helper` |
| 所需权限 | 仓库 / 项目读写权限 |
| 用途 | 镜像代码、创建 tag、删除并重建 Release、上传 Release 附件 |

在 GitHub Actions secrets 新增：

```text
Name: GITEE_TOKEN
Value: 上面复制的 Gitee 私人令牌
```

Token 所属 Gitee 账号必须能写入 `vincent-zyu/tampermonkey-plugin-koishi-market-ai-helper`。

<a id="key-greasyfork-webhook-url"></a>

### `GREASYFORK_WEBHOOK_URL`

如果只使用 GitHub 仓库 Webhook，可以不配置这个 secret。

如果想让 GitHub Actions 在 `build publish` 的最后也主动 POST 一次 Greasy Fork webhook，可以新增：

```text
Name: GREASYFORK_WEBHOOK_URL
Value: https://greasyfork.org/zh-CN/users/1621917-vincentzyu233/webhook
```

不建议同时长期启用“GitHub 仓库 Webhook”和这个 Actions secret，避免一次 release 产生两次通知。当前如果 GitHub 仓库 Webhook 持续返回 403，可以先配置这个 secret 测试 Actions 直连通知。

如果没有配置，会输出：

```text
GREASYFORK_WEBHOOK_URL is not configured. Skipping Greasy Fork webhook notification.
```

这是正常跳过，不代表 Release、Pages 或 Gitee 同步失败。

## 验证

发布后检查：

1. GitHub Actions 里的 `check-commit`、`build-dist`、`publish-release`、`sync-gitee-code`、`sync-gitee-release`、`publish-pages` 都成功。
2. Gitee `main` 是否同步到最新 commit。
3. Gitee Release 是否出现同名 tag。
4. Gitee Release 是否包含 `.user.js`、`dist.tar.gz`、`SHA256SUMS.txt`。
5. Gitee `.user.js` 头部 `@version` 是否等于 `package.json`。
6. GitHub 仓库 `Settings -> Webhooks` 中 Greasy Fork webhook 的最近一次投递为成功。
7. Greasy Fork 脚本历史里出现新版本。
8. Greasy Fork 页面展示的 `@version` 和 `package.json` 一致。

如果 Gitee 没更新，先确认：

1. `GITEE_PRIVATE_KEY` 和 `GITEE_TOKEN` 已配置。
2. Gitee token 所属账号有目标仓库写权限。
3. Gitee SSH 公钥已添加到同一个账号。
4. Gitee 仓库名是 `vincent-zyu/tampermonkey-plugin-koishi-market-ai-helper`。
5. `sync-gitee-code` 是否先成功。

如果 Greasy Fork 没更新，先确认：

1. `package.json` 版本号已递增。
2. Release latest 直链能下载 `.user.js`。
3. `.user.js` 头部的 `@version` 已更新。
4. GitHub Webhook 事件选择了 `Releases`。
5. GitHub Webhook 的 `Payload URL` 是 Greasy Fork 页面显示的 webhook URL。
