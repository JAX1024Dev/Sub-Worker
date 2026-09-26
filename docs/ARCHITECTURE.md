# 系统架构

## 1. 架构目标

系统采用 Cloudflare Worker 作为无状态数据面，3x-ui 作为节点与订阅授权来源，GitHub
作为静态配置控制面。TUN、DNS、路由和平台差异已从 Worker 运行逻辑移入配置包，让
兼容 schema 内的配置变化无需部署 Worker，同时保留严格验证、可测试发布和快速回滚。

当前 production 请求先验证 3x-ui 订阅并解析实时节点，再获取经摘要校验的 GitHub
bundle 并组装配置。旧 Generator 仅用于历史 fixture 对照，不是运行时 fallback。API、
Subscription ID 鉴权、VLESS REALITY 节点语义和 no-store 响应保持不变。

## 2. 系统上下文

```text
sing-box client
  │ GET /v1/sing-box/{clientType}/{subscriptionId}
  ▼
Cloudflare Worker
  ├─ HTTPS → 3x-ui：验证 ID 并获取实时节点
  └─ HTTPS → GitHub：获取 channel manifest 与不可变 profile bundle
                         ▲
                         │ GitHub Actions 校验并发布
                  example/ 静态配置片段
```

Worker 不承载代理流量，不访问 3x-ui 管理 API，不持久化订阅，也不允许请求方选择配置
仓库或 URL。

## 3. 架构原则

- 动态节点和静态客户端策略分离。
- GitHub 中的源片段可读，运行时 bundle 原子且内容不可变。
- 所有外部内容均不可信，必须限时、限长、严格解析并校验。
- 配置组合使用字段所有权和显式插槽，不使用通用 deep merge。
- 无效配置失败关闭，不静默回退到代码内模板或部分配置。
- staging 与 production 使用不同 channel manifest。
- 用户订阅与最终配置始终不缓存。

## 4. 运行时模块

```text
API Router
  └─ Generate Subscription
      ├─ 3x-ui Source Adapter
      │   ├─ Safe URL Builder
      │   ├─ Bounded Fetch
      │   └─ Subscription Decoder
      ├─ Parser Registry
      │   └─ VLESS REALITY Parser
      ├─ CanonicalNode Validator
      ├─ Remote Config Source
      │   ├─ Manifest Client
      │   ├─ Bundle Client
      │   ├─ URL Policy
      │   ├─ SHA-256 Verifier
      │   └─ Fragment Validator
      └─ Sing-box Composer
          ├─ Node Outbound Renderer
          ├─ Outbound Policy Instantiator
          └─ Deterministic Fragment Merger
```

### API Router

- 只接受 GET，解析固定 clientType 和 Subscription ID。
- 不接收配置 URL、仓库、branch、ref、版本或 merge 参数。
- 返回 no-store JSON，并把领域错误映射为稳定 HTTP 状态。

### 3x-ui Source Adapter

- 从 Secret 读取唯一 HTTPS Base URL。
- 请求成功同时证明 Subscription ID 当前有效。
- 限制重定向、时间、正文、行数和节点数。
- 只返回白名单元数据及不可信订阅正文。

### Parser 与 CanonicalNode

- parser 只负责把分享链接转换为 `CanonicalNode`。
- 单节点无效时记录脱敏 warning 并忽略；零个兼容节点返回 422。
- 节点 renderer 不读取 GitHub，也不生成 DNS、route 或 TUN。

### Remote Config Source

- 已接入 production Worker 请求路径；失败时不会回退到旧 Generator。
- 从部署变量读取唯一 `SING_BOX_CONFIG_MANIFEST_URL`。
- manifest 中只按已验证的 clientType 选择 profile。
- bundle URL 必须属于批准的 GitHub owner/repo/path，且使用完整 commit SHA。
- 使用 Web Crypto 校验 SHA-256，并验证 schema、目标平台和 sing-box 版本。
- GitHub 状态、超时、超限、URL、摘要和 schema 错误统一失败关闭。
- JSON 严格拒绝无效 UTF-8、BOM、重复键和未知字段。

### Sing-box Composer

确定性 Composer 已进入 Worker 请求路径，同时由平台字段回归、服务组不变量和单元测试覆盖。

Composer 接收：

```text
CanonicalNode[] + VerifiedProfileBundle
```

组合顺序是：

```text
common
  + dns
  + platform inbounds/allowlisted options
  + route
  + rendered node outbounds/outbound policy
  → complete sing-box config
```

每个字段只有一个 owner。数组不自动拼接，平台只能提供明确允许的 route 字段。
Composer 必须检测重复 tag、保留 tag 占用、引用缺失、版本不匹配和未消费字段。
节点 outbound 和 selector 的动态 tag 数组是唯一运行时插槽；唯一名称直接作为节点 tag，
重名或保留 tag 冲突时才附加节点身份摘要，再用序号消歧。旧 bundle 的 `urltest` 和 UK 组
仍可解析，供发布迁移期间兼容；新 bundle 不生成这两组。
Composer 不修改输入 bundle 或节点。应用层按 Subscription ID 和平台派生 `cache_id`，
不把 bearer secret 明文放入输出配置。

详细契约见 [CONFIGURATION.md](./CONFIGURATION.md)。

## 5. GitHub 配置控制面

人工配置保存在 `example/sing-box/`：

- `common/`：跨平台基础配置。
- `dns/`：DNS 策略片段。
- `platforms/`：iOS、macOS、Android、Windows、Linux 特殊配置。
- `rules/`：路由规则和远程 rule-set。
- `outbounds/`：节点默认值、selector、direct 和 block 策略。
- `profiles/`：每个平台选择哪些片段。
- `channels/`：staging/production 指针。
- `published/`：CI 生成的不可变 bundle。

已完成 schema、源片段、五平台 bundle 构建与平台字段回归检查。CI 负责 fixture 组装、
sing-box 1.14.0 `check`、摘要生成和 channel promotion；DustinWin 更新检查设计为只创建待审
PR，不自动修改 production manifest。仓库已启用 Actions 创建 PR 权限；默认发布流程仍要求审查与环境审批。2026-09-23
选择组发布是维护者明确批准的直发例外。GitHub 是生产控制面，branch protection、
最小写权限和审计记录仍须维护。

## 6. 请求数据流

1. Router 创建 request ID 并验证路径。
2. Source Adapter 请求 3x-ui；不存在或禁用的 ID 立即停止。
3. Decoder、Parser 和 Validator 生成 `CanonicalNode[]`。
4. Remote Config Source 获取 channel manifest。
5. 根据 clientType 获取一个不可变 bundle，并校验 URL、大小、SHA-256 和 schema。
6. Node Renderer 根据远程 outbound policy 生成节点与动态 tag 数组。
7. Composer 按字段所有权合并所有片段并执行结构/引用检查。
8. Worker 返回完整 JSON；任何阶段失败都不返回部分结果。

选择在 ID 验证后再请求 GitHub，避免无效 ID 枚举放大外部配置请求。代价是增加串行延迟；
首期以安全和可观测性优先，实测后再决定是否并行。

## 7. HTTP 接口

```text
GET /v1/sing-box/{clientType}/{subscriptionId}
```

`clientType`：`ios | macos | android | windows | linux`。

成功响应保持：

```text
200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

新增内部错误类别：

| code                        | HTTP | 条件                           |
| --------------------------- | ---- | ------------------------------ |
| `CONFIG_SOURCE_UNAVAILABLE` | 502  | GitHub 错误或超时              |
| `CONFIG_SOURCE_INVALID`     | 502  | URL、大小、JSON 或 schema 无效 |
| `CONFIG_INTEGRITY_FAILED`   | 502  | SHA-256 不匹配                 |
| `CONFIG_PROFILE_NOT_FOUND`  | 502  | manifest 缺少目标平台          |
| `CONFIG_COMPOSITION_FAILED` | 502  | tag、引用或字段所有权冲突      |

外部响应只返回通用 message 和 request ID，不公开 GitHub 路径、摘要或内部错误。

## 8. 核心数据结构

```text
ClientType = ios | macos | android | windows | linux

CanonicalNode {
  protocol: vless
  name: string
  server: string
  serverPort: number
  uuid: string
  network?: tcp | grpc | http | httpupgrade
  flow?: string
  reality: RealityOptions
  warnings: WarningCode[]
}

ConfigChannelManifest {
  schemaVersion: 1
  channel: staging | production
  profiles: Record<ClientType, BundlePointer>
}

BundlePointer {
  bundleUrl: string
  sha256: string
}

VerifiedProfileBundle {
  schemaVersion: 1
  target: { format: sing-box; version: 1.14.0; clientType: ClientType }
  fragments: { common; dns; platform; route; outboundPolicy }
}
```

外部 JSON 先解析为 `unknown`，通过运行时 validator 后才能成为上述类型。

## 9. 缓存与状态

- 3x-ui 订阅、CanonicalNode、最终配置和错误响应不缓存。
- sing-box 客户端本地 `cache_file` 可保存服务 selector 选择与远程规则集；Worker 不读写该状态。
- 首期不使用 Cache API、KV、R2、D1 或 Durable Objects。
- bundle 的 URL 内容不可变，可由 GitHub CDN 缓存；manifest 是唯一可变指针。
- GitHub 故障时首期失败关闭，不使用跨请求模块全局变量保存 last-known-good。
- 未来若增加公开 bundle 缓存，必须与用户数据缓存严格隔离并新增 ADR。

## 10. 依赖方向与扩展

```text
api → application → domain
                  ↘ source/three-x-ui
                  ↘ source/remote-config
                  ↘ renderer/composer
```

- `domain` 不依赖 Cloudflare、3x-ui、GitHub 或 sing-box JSON。
- 两个 source adapter 互不依赖。
- Remote Config Source 不接触 Subscription ID 或节点凭据。
- 新平台通过新增 profile 和 platform fragment 实现；若 schema 已覆盖，无需部署 Worker。
- 新协议或新输出格式需要 parser/renderer 代码和新 bundle schema，必须部署 Worker。
- schema_version 不兼容变化必须并行支持迁移窗口，不能原地改变语义。

## 11. 当前发布状态与回滚

截至 2026-09-26，staging 与 production manifest 均指向 bundle 提交
`852233cac5d9781781b7194f53dd7e0fb9692442`。该版移除 `auto` 和独立 UK 组，
Kraken/Krak 仅提供英国标签节点、全局节点选择与 block；无英国节点时默认 block。
五平台静态配置与线上响应已核对，官方客户端对最新策略的实机回归仍需单独记录。

配置异常时把 production manifest 指回前一已知正常 bundle；若 Worker schema 或组合
代码本身异常，再回滚 Worker 部署版本。Worker 与配置变更同发时，应先部署能兼容旧
bundle 的 Worker，再切换 manifest，避免旧 Worker 读取新 schema。迁移期 Generator
仅保留为测试参照，不参与运行时回退。

具体版本与验证边界见 [RELEASE.md](./RELEASE.md)。

## 12. 决策记录

- [ADR-0001](./adr/0001-cloudflare-workers-stateless.md)：Cloudflare Workers 无状态架构。
- [ADR-0002](./adr/0002-canonical-node-renderers.md)：CanonicalNode 与 renderer 分层。
- [ADR-0003](./adr/0003-target-clients-and-version.md)：目标客户端和 sing-box 1.14.0。
- [ADR-0004](./adr/0004-subscription-auth-and-no-cache.md)：Subscription ID 鉴权和无缓存。
- [ADR-0005](./adr/0005-routing-policy.md)：国内直连、国外代理。
- [ADR-0006](./adr/0006-vless-reality-scope.md)：VLESS + REALITY 范围。
- [ADR-0007](./adr/0007-dns-policy.md)：分流加密 DNS。
- [ADR-0015](./adr/0015-ios-tun-dual-stack.md)：iOS TUN 双栈路由。
- [ADR-0016](./adr/0016-macos-ipv4-dns-compatibility.md)：macOS IPv4 DNS 兼容策略。
- [ADR-0017](./adr/0017-macos-dual-stack-experiment.md)：macOS FakeIP 双栈试验。
- [ADR-0018](./adr/0018-github-published-config-bundles.md)：GitHub 不可变配置包。
- [ADR-0020](./adr/0020-selectable-service-policies.md)：独立可切换服务策略组。
- [ADR-0021](./adr/0021-simplified-selectors-and-kraken-routing.md)：简化选择组与 Kraken 限定策略。
