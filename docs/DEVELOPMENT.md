# 开发与部署

> 当前仓库已完成 MVP 主链路：订阅获取与解码、CanonicalNode 转换、五平台 sing-box 配置生成和接口返回。本文定义工程命令和交付流程。

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
├── renderers/sing-box/  outbounds 与配置组装
├── config/dns/          DNS Generator
├── config/rules/        Rules Generator
├── platforms/           平台 Overlay
├── security/            请求和上游策略
└── observability/       结构化日志
test/
├── unit/
├── integration/
├── e2e/
└── fixtures/
docs/
└── adr/
```

## 3. 安装

```bash
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

`.dev.vars` 必须被 Git 忽略。示例文件只列出键名和虚假值：

```text
THREE_X_UI_SUB_BASE_URL=https://subscription.example.invalid/sub/
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
| Lint                     | `pnpm lint`                      |
| Lint 自动修复            | `pnpm lint:fix`                  |
| 格式检查                 | `pnpm format:check`              |
| 格式化                   | `pnpm format`                    |
| 类型检查                 | `pnpm typecheck`                 |
| 生成 Worker binding 类型 | `pnpm cf:typegen`                |
| 构建                     | `pnpm build`                     |
| 发布前完整门禁           | `pnpm release:check`             |

Worker 的 binding 类型通过 Wrangler 生成，不手写与配置重复的 Env 接口。

## 6. 测试分层

### 单元测试

- 路径参数和 Base URL 校验。
- Base64/明文订阅识别。
- VLESS + REALITY 解析和兼容过滤。
- CanonicalNode 默认值、标签清洗和去重。
- DNS 与 Rules Generator 的独立片段测试。
- 平台 Overlay 和日志脱敏。

### 集成测试

使用模拟 3x-ui 覆盖：

- 有效、缺失和被拒绝的 Subscription ID。
- HTML、非法 Base64、超大响应和超时。
- 同域及跨域重定向。
- 部分节点兼容与零节点兼容。
- 上游元数据头 allowlist。
- 片段合并时的 tag 和字段冲突。

### 配置测试

先生成五个平台的 golden 配置，再执行：

```bash
pnpm fixtures:generate
sing-box check -c <generated-config>
```

CI 使用固定的 1.14.0 二进制及校验和，或固定 digest 的容器镜像。
macOS 校验 Linux fixture 时，脚本仅在临时副本中移除 Linux 专属的
`auto_redirect`，避免宿主平台初始化失败；仓库中的原始 fixture 不会被修改，且平台字段由单元测试断言。

### E2E

- 本地 Workers 测试运行时实时请求 `.dev.vars` 指定的专用 3x-ui 测试订阅，验证完整配置接口。
- 该测试不属于默认 `pnpm test` 或 `pnpm check`，必须显式运行 `pnpm test:e2e`。
- `pnpm test:e2e:config` 将实时生成 macOS 配置，在权限为 `0600` 的临时文件上执行
  sing-box 1.14.0 `check`，并在结束后删除该文件。
- `pnpm test:rulesets` 实时下载固定 revision 的三个规则集并核对 SHA-256，同时验证 iOS
  显式中国 IPv6 旁路与固定 `geoip-cn` 完全一致；该网络测试也不进入默认门禁。
- 真实测试只使用专用 3x-ui 测试用户；完整 E2E 只针对 staging Worker。
- 发布前 E2E 还应覆盖 staging 配置导入和基本连通性。
- 修改 outbound 网络能力时，必须在官方 iOS 与 macOS 客户端验证 TCP、UDP/WebRTC
  和订阅刷新；结果记录在对应 ADR 与 `CHANGELOG.md`。
- 不将真实配置上传为 CI artifact。

## 7. Lint 与代码约束

- 禁止显式 `any` 和不安全双重断言。
- 禁止 floating promises。
- 禁止请求级模块全局可变状态。
- 所有外部数据在边界解析，领域层不接收未校验对象。
- 测试代码与生产代码使用相同的基础 lint 规则。

## 8. Build 与 CI

`pnpm build` 必须完成类型检查和 Worker dry-run bundle，不嵌入本地 secret。生成配置的语义校验由 `pnpm test:config` 独立执行。

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
- 设置合理的 CPU 上限。
- 不声明 KV、D1、R2 或 Durable Objects binding。
- 普通配置使用 vars，敏感配置使用 Secret。

## 10. 部署

配置环境 Secret：

```bash
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env staging
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env production
```

部署流程：

```bash
pnpm deploy:staging
pnpm test:e2e
pnpm deploy:production
```

生产发布要求：

- CI 门禁通过。
- staging 验证同一提交或构建产物。
- Secret、自定义域名、速率限制和日志策略已配置。
- 使用 Wrangler Versions/Deployments 保留可回滚版本。

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
