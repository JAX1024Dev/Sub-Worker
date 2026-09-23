# 发布检查

## 版本范围

首个 MVP 版本为 `0.1.0`，目标运行时为 Cloudflare Workers，输出格式固定为
sing-box `1.14.0`。首期仅支持 VLESS Reality。

## 本地门禁

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

完整门禁包含 lint、格式、类型、62+ 项测试、五平台配置检查、Worker dry-run、
规则集 SHA-256、真实订阅 E2E、真实配置 sing-box 检查和依赖审计。

## Staging

```bash
pnpm wrangler login
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env staging
pnpm config:validate
pnpm config:build
# bundle 所在提交合并后，运行 Publish staging configuration 工作流并合并其 PR
pnpm deploy:staging
```

部署后检查 `/health`、有效订阅、无效 Subscription ID、响应缓存头，并在 iOS 与
macOS 官方客户端重新导入 staging 返回的配置。涉及 outbound 网络能力时，同时验证
TCP 和 UDP/WebRTC。确认 Cloudflare WAF 或 Rate Limiting 已限制失败枚举和异常频率。

旧 `IOS_ROUTING_MODE` 与 `MACOS_ROUTING_MODE` bindings 已删除；实际行为完全由 staging
manifest 指向的 bundle 决定。应确认 iOS 配置无
`route_exclude_address`、DNS 保留 AAAA、direct 使用
`network_strategy: hybrid`。

当前 macOS bundle 保持已验证的 `ipv4-compatible` 行为。若再次试验 FakeIP 双栈，必须
通过新的 staging profile/bundle 发布并重新完成实机验证，不得依赖 Worker binding。

## Production

```bash
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env production
pnpm deploy:production
```

发布前必须确认：

- staging 与 production 使用独立 Secret；
- invocation logs 和 tracing 保持关闭；
- 自定义域名、HTTPS、WAF/Rate Limiting 和回滚负责人已确定；
- `CHANGELOG.md`、版本号和 Git tag 一致；
- 未提交 `.dev.vars`、真实配置、Subscription ID 或节点凭据；
- 项目使用 MIT License，版权主体为 `JAX1024Dev`。

发布后记录 Cloudflare deployment version，并用不含 secret 的 request ID 验证错误日志。

## 最新发布记录

- 日期：2026-09-23。
- Bundle commit：`d1f33fcc7890c6dccc6707fac3b426aff01df1c8`。
- Channel manifest commit：`32af370`；staging 与 production 均指向同一不可变 bundle。
- Production Worker version：`7fb8071f-4a63-467e-bf97-aeec99200919`。
- 维护者明确批准本次跳过 staging 实机阶段直接上线 production；`pnpm check` 全通过
  （140 项测试、五平台 sing-box 1.14.0 配置检查和 Worker dry-run）。
- production 五个平台订阅均返回 HTTP 200，包含服务分类、Kraken/Krak 英国路由与非空
  英国节点组，响应保留 `private, no-store`。英国节点真实出口 IP 和应用级连通性尚待
  客户端实测；节点标签不构成地理位置证明。

### 上次发布（2026-09-15）

- 日期：2026-09-15
- Bundle commit：`f9449437faddb1bfd5efd6fbe731b6c8e0ec135b`
- Staging Worker version：`5794567c-266a-4f25-8c62-c8c867828e2c`
- Production Worker version：`c26aefde-67a6-4dc5-9e1a-fc6286e8917c`
- staging 与 production manifest 均通过 Git 对象和 SHA-256 一致性检查。
- 五个平台均返回 HTTP 200、`private, no-store`，production 与 staging 正文逐字节一致。
- production 实测响应约 0.89–2.74 秒；无效 Subscription ID 返回 HTTP 404。
- iOS、macOS、Android、Windows 通过本机 sing-box 1.14.0 检查；Linux 配置通过 CI 检查，
  本机 macOS 不执行 Linux `auto_redirect` 初始化验证。

## 配置发布（重构目标）

兼容既有 bundle schema 的 common、DNS、TUN、平台和路由变化不发布 Worker：

```bash
pnpm config:validate
pnpm config:build
pnpm config:publish:staging -- <40-character-bundle-commit>
pnpm config:channels:check
# 完成自动与实机验证后
pnpm config:promote:production
pnpm config:channels:check
```

日常操作优先使用 GitHub Actions 中的 `Publish staging configuration` 和
`Promote production configuration`。两者均创建 PR；由于 `GITHUB_TOKEN` 创建的 PR 不会
自动触发普通事件，工作流会显式 dispatch `CI` 到新分支。仓库必须允许 Actions 创建 PR，
并为 `configuration-production` 环境配置必需审批人。

发布要求：

- source fragment、profile、生成 bundle 和 SHA-256 可追溯到同一提交；
- 五个平台使用脱敏节点组装后通过 sing-box 1.14.0 `check`；
- staging manifest 只指向完整 commit SHA URL；
- production promotion 使用受保护环境并记录审批；
- 不重新构建 bundle，production 必须推广 staging 已验证的同一摘要；
- 回滚时只把 production manifest 指回上一个已知正常摘要。

以下变化仍必须部署 Worker：manifest/bundle schema、字段所有权、组合算法、节点 parser、
renderer、HTTP API、bindings 或安全策略。
