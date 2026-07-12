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
| 新建 Release 时触发 Greasy Fork Webhook | ❌ | ✅ | ✅ |

示例：

```bash
git commit -m "build action: verify workflow"
git commit -m "build release: release vX.Y.Z"
git commit -m "build publish: release and deploy userscript page"
git push
```

也可以在 GitHub Actions 页面手动运行 workflow，并选择 `action`、`release` 或 `publish`。

GitHub Release 标记规则：

1. 当 Release tag 等于 `v<package.json version>` 时，显式标记为 Latest。
2. 手动填写其他 tag 时，该 GitHub tag 必须已经存在，并且不会改变当前 Latest Release。
3. 所有版本都作为普通 Release 发布，即使 tag 包含 `alpha`、`beta` 或 `rc`，也不标记为 Pre-release。

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
3. 解析 GitHub tag 的真实 commit SHA，并与 Gitee tag 校验。
4. 如果 Gitee tag 不存在，则从 GitHub tag 指向的 commit SHA 创建。
5. 如果同 tag 的 Gitee Release 已存在，删除旧 Gitee Release 并等待删除完成。
6. 使用同一个 tag 重新创建普通 Gitee Release，固定 `prerelease: false`。
7. 上传全部 Release assets，并记录文件大小、HTTP 状态和上传耗时。

具体实现位于 `.github/scripts/sync-gitee-release.sh`。Workflow 会先通过 `actions/checkout@v4` 检出仓库，再显式使用 Bash 运行该脚本。

`.gitattributes` 固定 `*.sh` 使用 LF 换行，避免 Windows CRLF 导致 Linux Bash 解析失败。

Gitee API 没有与 GitHub `make_latest` 完全对应的开关，因此这里只保证 Gitee Release 不标记为 Pre-release。GitHub 的 latest 下载直链始终由当前 `package.json` 版本维护。

同 tag 的 Gitee Release 采用删除后重建策略，因此 Release ID 和附件下载计数可能重置。当前附件体积较小，这个取舍用于确保 Gitee 正文与附件和 GitHub 完全一致。

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

先登录 Greasy Fork，并打开 Webhook 配置说明页：

```text
https://greasyfork.org/zh-CN/users/webhook-info
```

点击 `Generate` 或 `Regenerate` 生成 Webhook Secret。复制页面显示的 Payload URL 和 Secret，Secret 只填写到 GitHub Webhook 配置中，不要写入仓库文件、Actions 日志或聊天记录。

进入 GitHub 仓库：

```text
Settings -> Webhooks -> Add webhook
```

按 Greasy Fork 页面给出的信息填写：

| 字段 | 值 |
| --- | --- |
| Payload URL | `https://greasyfork.org/zh-CN/users/1621917-vincentzyu233/webhook` |
| Content type | `application/json` |
| Secret | 填入 Greasy Fork Webhook 配置说明页生成的 Secret |
| Which events would you like to trigger this webhook? | 选择 `Let me select individual events` |
| Pushes | 取消勾选 |
| Releases | 勾选 |
| Active | 勾选 |

选择 `Releases` 的原因：本仓库的 Greasy Fork 同步 URL 使用 `releases/latest/download/*.user.js`，Greasy Fork 说明这个格式只适用于 release events。

Greasy Fork 会用这个 Secret 校验 GitHub 发送的 `X-Hub-Signature`。Secret 缺失或两边不一致时，Webhook 会直接返回 HTTP `403`。

配置完成后，本仓库执行 `build release` 或 `build publish` 创建新的 GitHub Release 时，GitHub 会把带签名的 `release: published` webhook 发给 Greasy Fork，Greasy Fork 再检查 latest release asset 并同步脚本。更新已有的同版本 Release 只会产生 `release: edited`，不会让 Greasy Fork 发布新版本。

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

下面的 SSH key 注释和文件名使用完整项目前缀，便于与其他仓库的镜像凭据区分。

Bash / Git Bash / Linux / macOS：

```bash
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -C "tampermonkey-plugin-koishi-market-ai-helper-gitee-mirror" -f ~/.ssh/tampermonkey_plugin_koishi_market_ai_helper_gitee_mirror -N ""
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force "$HOME\.ssh"
ssh-keygen -t ed25519 -C "tampermonkey-plugin-koishi-market-ai-helper-gitee-mirror" -f "$HOME\.ssh\tampermonkey_plugin_koishi_market_ai_helper_gitee_mirror"
```

PowerShell 提示 `Enter passphrase` 和 `Enter same passphrase again` 时，连续按两次回车即可留空 passphrase。

复制公钥：

```powershell
Get-Content "$HOME\.ssh\tampermonkey_plugin_koishi_market_ai_helper_gitee_mirror.pub"
```

把公钥添加到 Gitee：

```text
https://gitee.com/profile/sshkeys
```

复制私钥：

```powershell
Get-Content "$HOME\.ssh\tampermonkey_plugin_koishi_market_ai_helper_gitee_mirror" -Raw
```

在 GitHub Actions secrets 新增：

```text
Name: GITEE_PRIVATE_KEY
Value: 上面复制的完整私钥，包括 BEGIN 和 END 行
```

可选 SSH 连通性检查：

```powershell
ssh -i "$HOME\.ssh\tampermonkey_plugin_koishi_market_ai_helper_gitee_mirror" -T git@gitee.com
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
tampermonkey-plugin-koishi-market-ai-helper-github-actions
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

## 验证

发布后检查：

1. GitHub Actions 里的 `check-commit`、`build-dist`、`publish-release`、`sync-gitee-code`、`sync-gitee-release`、`publish-pages` 都成功。
2. Gitee `main` 是否同步到最新 commit。
3. Gitee Release 是否出现同名 tag。
4. Gitee Release 是否包含 `.user.js`、`dist.tar.gz`、`SHA256SUMS.txt`。
5. Gitee `.user.js` 头部 `@version` 是否等于 `package.json`。
6. GitHub Release 的 Latest tag 是否等于 `v<package.json version>`。
7. GitHub 仓库 `Settings -> Webhooks` 中 Greasy Fork webhook 的最近一次投递为成功。
8. Greasy Fork 脚本历史里出现新版本。
9. Greasy Fork 页面展示的 `@version` 和 `package.json` 一致。

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
6. GitHub Webhook 的 `Secret` 与 Greasy Fork Webhook 配置说明页生成的 Secret 完全一致。
7. GitHub Webhook 最近一次 `release: published` 投递是否为 `2xx`；如果返回 `403`，优先重新生成 Secret 并同步更新 GitHub Webhook。
8. 当前操作是否创建了新版本 Release；同版本 Release 的 `edited` 事件不会触发 Greasy Fork 发布新版本。
