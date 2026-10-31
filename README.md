# dsh-tuitui

把 360 推推（Tuitui）IM 机器人接入 DeepSeek Harness 的插件。

- 私聊消息直接回复；群聊仅在 @机器人 时回复。
- 回答由 Harness agent 生成（模型跟随 Harness 配置）。
- **管理员 / 成员双角色**：管理员（manager）使用完整 agent，可用工具、技能与 `/shell` 等操作；非管理员一律是成员（member），使用「无工具、无技能」的受限预设，只能问答，不能执行任何操作。
- 每个推推会话映射到一个独立的 Harness 会话；在推推里发送 `/new` 开启新会话，`/status` 检查连接，`/whoami` 查看自己的身份，`/help` 查看帮助。
- 自动识别每条消息的发送人：转发给 Harness 的提问以 `账号(角色)：内容` 呈现（如 `fengzhao(manager)：今天天气怎么样`、`alice(member)：帮我查个资料`）。
- 在 Harness「设置 → 推推机器人」页面接入凭据，并可随时**启用 / 停止 / 删除**机器人，维护管理员账号列表。
- App Secret 只写入本机 Harness 凭据存储（引用名 `DSH_TUITUI_BOT_SECRET_<appId>`），任何 RPC 响应都不会返回。

## 角色与权限

| 角色 | 判定方式 | 能力 |
| --- | --- | --- |
| 管理员 `manager` | 账号/UID 在设置页「管理员账号列表」内 | 完整 Harness agent：工具、Skill、`/shell` 等 |
| 成员 `member` | 其余所有账号（默认） | 仅问答：挂载 `tuitui-member` 受限预设，宿主全局工具被清空，无 Skill / 终端 / 文件权限 |

成员模式的实现是两道保险：

1. 成员会话使用受限 agent 预设 `tuitui-member`（插件启动时通过 `agentPresets` 服务动态注册，可在「设置 → Agent 预设 → 自定义」里看到）。预设只挂一个 `dsh-persona`，系统提示词明确「没有任何工具」。
2. 预设内还挂了 `dsh-tuitui/member-guard`：它在会话作用域执行 `ctx.tools.restrict({ allow: [] })`，把宿主基座注册的全局工具（例如 `working_directory`）也一并屏蔽，因此成员会话的工具数为 0。

管理员与成员在同一个推推会话里各自拥有独立上下文（会话键带角色），成员无法复用管理员的（带工具）会话。受限预设未就绪时，成员消息会被拒绝，**不会**回退到管理员预设。

## 安装

### 方式一：从 GitHub 安装（推荐）

```sh
dsh plugin --profile web add github:adil-bit-hub/dsh-tuitui
```

### 方式二：本地开发安装

```sh
git clone https://github.com/adil-bit-hub/dsh-tuitui.git
cd dsh-tuitui

npm install
npm run build

dsh plugin --profile web add .
```

重启 `dsh web`（或重启 DeepSeek Harness 桌面端），打开「设置 → 推推机器人」，填写 App ID 与 App Secret 接入即可。

> 桌面端使用保留 profile `desktop`：`dsh plugin --profile desktop add .`。桌面端运行时会锁定该 profile，请先完全退出应用再执行安装命令。

## 使用

1. **接入机器人**：在设置页填写推推开放平台的 App ID 和 App Secret
2. **启用 / 停止**：点击对应按钮控制消息连接
3. **删除**：清除凭据与会话状态

### 会话管理指令（在推推私聊发送）

- `/new` - 开启新会话（同时重置该会话的管理员与成员上下文）
- `/status` - 检查连接状态（附带当前身份与角色）
- `/whoami` - 查看自己的昵称、账号、UID 与角色（配置管理员前先用它查账号）
- `/help` - 显示帮助

### 管理员指令（仅管理员账号列表内的用户）

- `/shell <命令>` - 在会话工作区执行 shell 命令并回传输出（别名 `/exec`、`/run`，默认超时 120 秒）
- 成员尝试使用时会被拒绝，并提示当前身份与联系管理员的方式。

## 安全与管理员配置（设置页）

在「设置 → 推推机器人」页面的「安全与管理员」卡片中：

1. **管理员账号列表**：添加/移除推推账号（也支持 UID）。仅列表内的用户是管理员；列表为空时所有账号都是成员。
2. **成员（member）能力**：单一开关「允许成员问答」。关掉后成员无法与机器人对话；管理员不受影响。
3. 修改后立即落盘，对后续消息实时生效，无需重启。
4. 安全策略保存在 `~/.dsh/integrations/dsh-tuitui/config.json` 的 `security` 字段。

## 配置（可选）

在 profile 的 `cordis.patch.yml` 中覆盖插件配置：

```yaml
- id: dsh-tuitui
  config:
    agentPreset: standard          # 管理员会话的 Harness agent 预设
    memberAgentPreset: tuitui-member  # 成员会话的受限预设 id
    workspace: 'D:\some\dir'       # 会话工作区，也是 /shell 的执行目录，默认 dsh 启动目录
    replyTimeoutMs: 600000         # 单条回复超时
    shellTimeoutMs: 120000         # /shell 执行超时（毫秒）
    memberPresetWaitMs: 15000      # 等待受限预设注册完成的超时
    staleConnectionRefreshMs: 1800000  # 连接建立后长期无事件则重建（默认 30 分钟）
```

`memberAgentPreset` 建议保持默认：改名时插件会注册同名受限预设，但请勿把它指向带工具的预设。

## 兼容性（DSH 0.2.1-rc.5 桌面 / Web）

本版本针对 DSH `0.2.1-rc.5` 的插件契约做了适配：

- **设置页槽位**：`settings.plugins.tab` → `settings.section`（与内置插件一致，出现在设置左侧导航）。
- **浏览器 ⇄ 宿主传输**：不再使用 `ctx.connection.rpc`（rc.5 里第三方插件注册会报 `cannot get property "webServer" without inject`），改为插件自己在 `webServer` 注册 `/tuitui` 前缀路由，并用 `connection.admit(req)` 复用内置 `/api` 的 Host/Origin 围栏与登录态检查；客户端同源 `fetch` 调用。
- **驱动 Harness 会话**：不再通过 HTTP `/api`（rc.5 的 `/api` 只接受已认证浏览器 Peer），改为注入宿主 `sessionController` 服务在进程内创建会话、提交提问，并通过 `session/event` 流等待 `turn/end`。
- **工具屏蔽**：使用 `ctx.tools.restrict({ allow: [] })` 在受限预设作用域内清空全局工具。
- 客户端 bundle 契约不变：`window.__ModuleLoader__.load({ id, factory })`，React 由平台基线模块提供。

若升级到 DSH 新版本后插件未激活，请查看宿主日志中的 `did not activate`（等待服务）与 `web boot` 报错。

## 开发

- Host 端源码：`plugin-src/host/`（esbuild 打包到 `lib/index.js` 与 `lib/member-guard.js`，SDK 与 ws 一并内联，运行期零依赖）。
- 客户端设置页：`plugin-src/client/`（打包到 `lib/client.js`，由 DSH 客户端模块系统加载）。
- 测试：`npm test`（`node --test`，覆盖角色分流、`/shell` 权限、会话重建、RPC 校验等）。

```
plugin-src/host/
  index.mjs          # 插件入口：注册受限预设、装配控制器与 RPC 路由
  rpc.mjs            # /tuitui HTTP 路由 + 准入检查 + 端点校验
  controller.mjs     # 机器人生命周期（接入/启用/停止/删除）
  runtime.mjs        # 单个机器人：推推 WebSocket 订阅
  bridge.mjs         # 消息 → 角色分流 → Harness 会话 → 回复
  harness-client.mjs # 进程内 sessionController 驱动 + session/event 跟踪
  preset.mjs         # 动态注册 tuitui-member 受限预设
  member-guard.mjs   # 受限预设内的零工具守卫
  policy.mjs         # 管理员/成员策略与角色标签
  stores.mjs         # 配置与会话状态持久化
  shell.mjs          # 管理员 /shell 执行
```

## 更换 / 修复凭据

- **App Secret 失效或被轮换**（状态显示「推推开放平台拒绝了当前凭据（401）」）：
  1. 到 360 推推开放平台复制该机器人当前的 App Secret；
  2. 在「设置 → 推推机器人」点「接入另一个机器人」，**填相同的 App ID + 新的 App Secret**；
  3. 点「接入机器人」。插件会先调用推推开放接口校验，通过后就在原机器人记录上覆盖 Secret 并重连，**不需要删除**，该机器人的会话映射会保留。
- **换成了另一个机器人（App ID 不同）**：用新 App ID + Secret 接入，然后在旧机器人卡片上点「删除」清理旧凭据。
- 直接改 `~/.dsh/.credentials.yaml` 里的 `DSH_TUITUI_BOT_SECRET_<appId>` 也会生效，但需要重启 Harness；该文件是明文凭据存储，操作前请先备份。

## 注意

- 同一机器人账号不要同时运行其他监听进程（例如另一台机器上的同名机器人监听），否则消息会被重复消费。
- **推送僵死的长连接**：推推平台偶发把早期建立的 WebSocket 变成「只发心跳、不再推送消息」的空连接，此时界面仍显示「已连接」但「已接收」一直是 0。插件现在会记录「最近事件」时间，并在连接建立后 30 分钟仍无任何事件时自动重建一次（可用 `staleConnectionRefreshMs` 调整）；也可以手动点机器人卡片上的「重新连接」立即换一条新连接。
- 停止机器人只断开消息连接，凭据和会话映射保留；删除才会清理凭据与会话状态。
- `/shell` 会在宿主机上以 Harness 进程权限执行命令，请务必只把信任的账号加入管理员列表；`/shell` 不支持向成员授权。

## License

MIT
