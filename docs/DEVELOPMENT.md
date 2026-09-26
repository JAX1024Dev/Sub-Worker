# 开发与部署

> 当前 Worker 已从 GitHub channel 加载经摘要校验的配置包。旧 Generator 只保留为测试对照，不参与运行时回退。

## 1. 工具链

- Node.js：初始化时最新 Active LTS，通过 `.nvmrc` 或 `mise.toml` 固定。
- 包管理器：pnpm，通过 `packageManager` 固定版本。
- TypeScript：strict mode。
- Cloudflare Wrangler：项目开发依赖，不依赖全局安装。
- 测试：Vitest 与 Cloudflare Workers 测试环境。
- 校验器：固定版本的 sing-box 1.14.0。

依赖必须写入 lockfile。不得使用 sing-box 预发布版更新 golden fixture。

## 2. 项目目录

```text
src/
├── api/                 HTTP 输入与响应
├── application/         用例编排
├── domain/              CanonicalNode 与校验
├── sources/three-x-ui/  订阅获取和解码
├── parsers/             分享链接 parser
├── sources/remote-config/ manifest、bundle 获取与校验
├── renderers/sing-box/  节点 outbounds 与确定性配置组装
├── platforms/           旧平台行为基线（仅供测试对照）
└── security/            请求和上游策略
test/
├── unit/
├── integration/
├── e2e/
└── fixtures/
docs/
└── adr/
example/
└── sing-box/            可读源片段、profiles、schemas 与发布 bundle
```

远程目录和字段所有权以 [CONFIGURATION.md](./CONFIGURATION.md) 为准。不要先创建可随意
deep merge 的 JSON，再补验证规则。

## 3. 安装

```bash
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

`.dev.vars` 必须被 Git 忽略。示例文件只列出键名和虚假值：

```text
THREE_X_UI_SUB_BASE_URL=https://subscription.example.invalid/sub/
SING_BOX_CONFIG_MANIFEST_URL=https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json
LIVE_TEST_SUBSCRIPTION_ID=example-subscription-id
```

Base URL 按 secret 管理，不写入 `wrangler.jsonc`。

## 4. 本地运行

```bash
pnpm dev
```

本地请求示例：

```bash
curl --fail-with-body \
  http://127.0.0.1:8787/v1/sing-box/linux/example-sub-id
```

默认开发和测试不得访问真实 3x-ui。真实上游只用于显式启用的 staging E2E。

## 5. 标准命令

| 目的                     | 命令                             |
| ------------------------ | -------------------------------- |
| 单元和集成测试           | `pnpm test`                      |
| 单元测试                 | `pnpm test:unit`                 |
| 集成测试                 | `pnpm test:integration`          |
| 配置检查                 | `pnpm test:config`               |
| 重新生成 golden 配置     | `pnpm fixtures:generate`         |
| 固定规则集校验           | `pnpm test:rulesets`             |
| 生成 iOS 中国 IPv6 旁路  | `pnpm rules:generate:ios-routes` |
| 检查 iOS 旁路是否最新    | `pnpm rules:check:ios-routes`    |
| Staging E2E              | `pnpm test:e2e`                  |
| 真实配置 sing-box 校验   | `pnpm test:e2e:config`           |
| macOS 双栈实机试验       | `pnpm test:macos:dual-stack`     |
| Lint                     | `pnpm lint`                      |
| Lint 自动修复            | `pnpm lint:fix`                  |
| 格式检查                 | `pnpm format:check`              |
| 格式化                   | `pnpm format`                    |
| 类型检查                 | `pnpm typecheck`                 |
| 生成 Worker binding 类型 | `pnpm cf:typegen`                |
| 构建                     | `pnpm build`                     |
| 发布前完整门禁           | `pnpm release:check`             |

配置管理命令：

| 目的                                | 命令                                      |
| ----------------------------------- | ----------------------------------------- |
| 校验全部源片段、profile 和引用      | `pnpm config:validate`                    |
| 确定性生成五个平台 bundle           | `pnpm config:build`                       |
| 检查 bundle 最新及平台/策略组不变量 | `pnpm config:diff`                        |
| 校验已发布 channel 与 Git 对象      | `pnpm config:channels:check`              |
| 发布 staging manifest               | `pnpm config:publish:staging -- <commit>` |
| 提升 staging 到 production          | `pnpm config:promote:production`          |

发布命令只读取已提交的 Git 对象。staging 命令要求完整 40 位 commit SHA，production 命令
只复制当前 staging 的 URL 与摘要，不重建 bundle。两个 channel 现均已发布；不得将
本地未提交的 bundle 路径直接写进 manifest。

Worker 的 binding 类型通过 Wrangler 生成，不手写与配置重复的 Env 接口。

## 6. 测试分层

### 单元测试

- 路径参数和 Base URL 校验。
- Base64/明文订阅识别。
- VLESS + REALITY 解析和兼容过滤。
- CanonicalNode 默认值、标签清洗和去重。
- DNS 与 Rules Generator 的独立片段测试。
- 平台 Overlay 和日志脱敏。
- manifest、bundle、URL policy、SHA-256 和字段所有权 validator。
- 每种外部 JSON 均从 `unknown` 开始验证；禁止用类型断言绕过边界。

### 集成测试

使用模拟 3x-ui 覆盖：

- 有效、缺失和被拒绝的 Subscription ID。
- HTML、非法 Base64、超大响应和超时。
- 同域及跨域重定向。
- 部分节点兼容与零节点兼容。
- 上游元数据头 allowlist。
- 片段合并时的 tag 和字段冲突。
- GitHub 超时、超限、重定向、错误 content type、错误摘要、错误平台和 schema 不兼容。

### 配置测试

先生成五个平台的 golden 配置，再执行：

```bash
pnpm fixtures:generate
sing-box check -c <generated-config>
```

CI 使用固定的 1.14.0 二进制及校验和，或固定 digest 的容器镜像。
macOS 校验 Linux fixture 时，脚本仅在临时副本中移除 Linux 专属的
`auto_redirect`，避免宿主平台初始化失败；仓库中的原始 fixture 不会被修改，且平台字段由单元测试断言。

每个 profile bundle 必须先用脱敏 fixture 节点组合为完整配置，再执行同一版本的
`sing-box check`。bundle 本身不是完整 sing-box 配置，不能只做 JSON 语法检查。

### E2E

- 本地 Workers 测试运行时实时请求 `.dev.vars` 指定的专用 3x-ui 测试订阅，验证完整配置接口。
- 该测试不属于默认 `pnpm test` 或 `pnpm check`，必须显式运行 `pnpm test:e2e`。
- `pnpm test:e2e:config` 将实时生成 macOS 配置，在权限为 `0600` 的临时文件上执行
  sing-box 1.14.0 `check`，并在结束后删除该文件。
- macOS 双栈 staging 试验使用 `pnpm test:macos:dual-stack`。先在 `.dev.vars` 配置
  `STAGING_WORKER_BASE_URL` 与专用 `LIVE_TEST_SUBSCRIPTION_ID`；脚本会以 `0600` 权限
  保存配置、执行静态策略与 sing-box 检查、采集隧道前 IPv6 基线，并提示导入官方
  macOS 客户端后测试 IPv4/IPv6、中国/非中国、TCP 与 UDP。报告不得包含 Subscription ID、
  请求 URL、节点链接或完整配置。
- `pnpm test:macos:dual-stack -- --check-only --config <file>` 可只校验本地配置。
- `pnpm test:rulesets` 实时下载固定 revision 的所需规则集并核对 SHA-256，同时验证 iOS
  显式中国 IPv6 旁路与固定 `geoip-cn` 完全一致；该网络测试也不进入默认门禁。
- 真实测试只使用专用 3x-ui 测试用户；完整 E2E 只针对 staging Worker。
- 发布前 E2E 还应覆盖 staging 配置导入和基本连通性。
- 修改 outbound 网络能力时，必须在官方 iOS 与 macOS 客户端验证 TCP、UDP/WebRTC
  和订阅刷新；结果记录在对应 ADR 与 `CHANGELOG.md`。
- 不将真实配置上传为 CI artifact。
- E2E 必须断言返回配置对应预期 channel/bundle 摘要，但不得在响应头暴露完整内部 URL。

## 7. Lint 与代码约束

- 禁止显式 `any` 和不安全双重断言。
- 禁止 floating promises。
- 禁止请求级模块全局可变状态。
- 所有外部数据在边界解析，领域层不接收未校验对象。
- 测试代码与生产代码使用相同的基础 lint 规则。

## 8. Build 与 CI

`pnpm build` 必须完成类型检查和 Worker dry-run bundle，不嵌入本地 secret。`pnpm test:config`
同时检查旧 fixture 与五个平台远程 bundle 的真实组装结果，使用 sing-box 1.14.0 执行
`check`。

合并门禁：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:config
pnpm build
```

## 9. Wrangler 配置

项目使用 `wrangler.jsonc`：

- ES Modules Worker。
- 初始化时使用 Wrangler 与 Workers 测试运行时共同支持的最新 `compatibility_date`，后续受控升级。
- 启用 `nodejs_compat`。
- 启用 Workers Observability 并设置采样率。
- 禁用 invocation logs 和 tracing，防止 URL path 中的 Subscription ID 被平台自动采集。
- 不声明 KV、D1、R2 或 Durable Objects binding。
- 普通配置使用 vars，敏感配置使用 Secret。
- 使用 `SING_BOX_CONFIG_MANIFEST_URL` 选择配置 channel；
  `IOS_ROUTING_MODE`、`MACOS_ROUTING_MODE` 等配置细节已迁移到 profile，不再作为 Worker
  bindings。Wrangler 的环境 vars 不继承，staging 与 production 必须分别声明 manifest。

## 10. 部署

配置环境 Secret：

```bash
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env staging
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env production
```

同时为两个环境配置各自的公开 manifest URL。该 URL 只能指向批准仓库的 channel 文件，
不能包含 token，也不能由客户端覆盖。

部署流程：

```bash
pnpm deploy:staging
pnpm test:e2e
pnpm deploy:production
```

Worker 代码部署与配置发布是两条流程：只有 TypeScript、schema 兼容范围或 bindings
变化才部署 Worker；兼容 schema 内的 TUN、DNS、route 和平台参数通过 GitHub channel
发布。常规变更不得通过直接修改 production manifest 绕过 staging 验证；维护者明确
授权的例外须记录原因、执行静态检查并在发布后验证五平台线上响应。

生产发布要求：

- CI 门禁通过。
- staging 验证同一提交或构建产物；例外需单独记录。
- Secret、自定义域名、速率限制和日志策略已配置。
- 使用 Wrangler Versions/Deployments 保留可回滚版本。

2026-09-23 的独立服务策略组按明确授权直发：先部署能读取旧 bundle 的 Worker，再将
production manifest 指向新 bundle。GitHub Raw 对 `main` 路径可能短暂返回旧内容；
确认线上返回 `route.final = 🚀 节点选择` 和预期策略组后才视为配置切换完成。

## 11. 升级流程

### sing-box

1. 新增或取代版本 ADR。
2. 检查官方 migration 和 deprecated 文档。
3. 更新 schema、五个平台 fixture、[DNS.md](./DNS.md) 和 [RULES.md](./RULES.md)。
4. 使用新版本执行全部配置检查与 staging 导入测试。
5. 验证完成后才修改默认 renderer 版本。

### Cloudflare

- 更新 Wrangler、Workers 类型和 `compatibility_date` 前检查官方变更记录。
- 重新生成 binding 类型并运行完整 CI。
- 不跨越多个 compatibility date 而跳过 staging 验证。

## 12. 文档变更规则

- 项目范围变化：更新 [PROJECT.md](./PROJECT.md)。
- 模块或接口变化：更新 [ARCHITECTURE.md](./ARCHITECTURE.md)。
- 路由生成变化：只在 [RULES.md](./RULES.md) 维护详细规格。
- DNS 生成变化：只在 [DNS.md](./DNS.md) 维护详细规格。
- 服务安全边界变化：更新 [SECURITY.md](./SECURITY.md)。
- 已接受的重要取舍：新增 ADR；ADR 只记录理由并链接详细规格。

## 13. 当前维护重点

- 配置变更先修改 `example/sing-box/` 源片段，再生成 bundle 并走 staging → production；不要手改 `published/`。
- 服务策略组变更须同步更新 `pnpm config:diff` 的行为不变量和对应单元测试。
- 关键应用、UDP/WebRTC 与选择持久化仍需官方客户端实机回归；静态 `sing-box check` 不能替代连通性测试。
- 旧 Generator 仅供 golden diff；删除前须确认测试已改用等价基线并记录决策。
