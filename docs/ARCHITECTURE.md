# 系统架构

## 1. 架构目标

系统采用无状态、分层和可替换 renderer 的架构。MVP 只实现 3x-ui 到 sing-box 1.14.0 的 VLESS + REALITY 转换，同时保留新增协议、平台、订阅源和 Mihomo 输出的边界。

## 2. 系统上下文

```text
sing-box 客户端
    │ GET /v1/sing-box/{clientType}/{subscriptionId}
    ▼
Cloudflare Worker
    │ HTTPS GET {THREE_X_UI_SUB_BASE_URL}/{subscriptionId}
    ▼
3x-ui Subscription Server
```

Worker 只转换配置，不承载代理流量，不访问 3x-ui 管理 API，也不持久化订阅。

## 3. 架构原则

- 边界输入全部验证，上游响应同样视为不可信数据。
- 上游格式、领域模型和目标格式相互隔离。
- 公共配置与平台差异分离。
- DNS 与路由是可单独生成、版本化和测试的配置片段。
- 使用显式依赖和 tag，不依赖数组顺序或隐式默认行为。
- MVP 不引入数据库、对象存储或跨请求状态。

## 4. 模块结构

```text
API Router
  └─ Request Validator
       └─ Subscription Application Service
            ├─ 3x-ui Source Adapter
            │    ├─ Safe URL Builder
            │    ├─ Upstream HTTP Client
            │    └─ Subscription Decoder
            ├─ Share Link Parser Registry
            │    └─ VLESS Parser
            ├─ CanonicalNode Validator
            ├─ Compatibility Filter
            └─ Sing-box Config Composer
                 ├─ Outbound Renderer
                 ├─ Common Config
                 ├─ DNS Generator
                 ├─ Rules Generator
                 └─ Platform Overlay
```

横切模块：

- `security`：输入限制、上游策略、重定向检查和脱敏。
- `observability`：request ID、结构化日志、结果分类和耗时。
- `errors`：领域错误到 HTTP 状态的稳定映射。

## 5. 模块边界

### API Router

- 只接受 GET。
- 解析 `clientType` 和 `subscriptionId`。
- 设置响应头并映射错误。
- 不解析节点，不构造上游 host，不生成配置字段。

### 3x-ui Source Adapter

- 从 Worker Secret 读取唯一 Base URL。
- 安全追加 Subscription ID。
- 强制 HTTPS、固定 host、超时、大小限制和重定向策略。
- 获取并解码 Base64 或明文原始订阅。
- 只返回订阅正文和白名单元数据，不暴露原始 `Response`。

### Parser Registry

- 每种 parser 只将一种分享链接转换为 `CanonicalNode`。
- MVP 注册 VLESS parser；Compatibility Filter 只接受 REALITY。
- parser 不生成 sing-box 字段。

### CanonicalNode Validator

- 校验连接必需字段。
- 规范化显式字段并应用已批准的安全默认值。
- 生成不含敏感值的 warning code。
- 单节点失败返回 ignored 结果，不抛弃其他节点。

### Config Composer

Composer 合并彼此独立的片段：

```text
common + outbounds + dns + rules + platform overlay
```

合并时检测 tag、顶层字段和平台选项冲突；任一必需依赖缺失时停止生成。

### Outbound Renderer

- 将 `CanonicalNode[]` 转换为 sing-box 1.14.0 outbounds。
- 生成 `direct`、`block`、`urltest` 和名为 `proxy` 的 selector。
- 域名形式的节点按 [DNS.md](./DNS.md) 设置 domain resolver。
- CanonicalNode 的 `network = tcp` 表示上游 transport，不映射为 sing-box outbound 的
  TCP-only `network` 限制。
- VLESS 节点不生成 `network`，允许 TCP 与 UDP，并显式使用 `packet_encoding = xudp`。
- 不生成 DNS、route 或 TUN 字段。

### DNS Generator

- 输出 `DnsFragment`。
- 唯一详细规范为 [DNS.md](./DNS.md)。
- 不直接修改 route rules 或节点凭据。

### Rules Generator

- 输出 `RoutingFragment`。
- 唯一详细规范为 [RULES.md](./RULES.md)。
- 不直接修改 DNS server 或节点 outbounds。

### Platform Overlay

| 平台    | 目标           | 负责内容                       |
| ------- | -------------- | ------------------------------ |
| iOS     | 官方图形客户端 | Apple 平台 TUN 选项            |
| macOS   | 官方图形客户端 | TUN 与系统路由集成             |
| Android | 官方图形客户端 | VpnService 相关选项            |
| Windows | sing-box core  | TUN、strict route、接口检测    |
| Linux   | sing-box core  | TUN、auto route、auto redirect |

Overlay 不能改变节点、DNS 或路由的业务语义。

## 6. 数据流

1. Router 创建 request ID 并验证路径参数。
2. Source Adapter 构造并请求固定上游 URL。
3. Decoder 在大小限制内识别 Base64 或明文链接列表。
4. Parser Registry 逐条生成 `CanonicalNode`。
5. Validator 和 Compatibility Filter 忽略无效或不兼容节点。
6. Outbound Renderer 生成节点及选择组。
7. DNS Generator 和 Rules Generator 生成独立片段。
8. Platform Overlay 提供平台字段。
9. Composer 合并片段并检查依赖冲突。
10. 输出通过结构校验后返回 JSON。

## 7. HTTP 接口

```text
GET /v1/sing-box/{clientType}/{subscriptionId}
```

`clientType`：`ios | macos | android | windows | linux`。

成功响应：

```text
200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

允许透传的 3x-ui 元数据头：

- `Subscription-Userinfo`
- `Profile-Update-Interval`
- `Profile-Title`
- `Support-Url`
- `Profile-Web-Page-Url`
- `Announce`

禁止透传 Cookie、认证头、上游 CORS 和缓存头。

错误结构：

```json
{
  "error": {
    "code": "NO_COMPATIBLE_NODES",
    "message": "No compatible nodes are available.",
    "requestId": "..."
  }
}
```

| 状态 | 条件                               |
| ---- | ---------------------------------- |
| 400  | 路径参数非法                       |
| 404  | 3x-ui 不存在或拒绝 Subscription ID |
| 422  | 没有兼容节点                       |
| 429  | 触发限速                           |
| 502  | 上游错误或内容异常                 |
| 504  | 上游超时                           |
| 500  | 未预期内部错误                     |

## 8. 核心数据结构

```text
ClientType = ios | macos | android | windows | linux

SubscriptionDocument {
  metadata: SubscriptionMetadata
  links: string[]
}

CanonicalNode {
  sourceId: string
  sourceIndex: number
  protocol: vless
  name: string
  server: string
  serverPort: number
  uuid: string
  network?: tcp | grpc | http | httpupgrade
  flow?: string
  reality: {
    publicKey: string
    shortId?: string
    serverName: string
    fingerprint?: string
  }
  transport?: CanonicalTransport
  warnings: WarningCode[]
}

ConversionSummary {
  total: number
  accepted: number
  ignored: number
  ignoredByReason: Record<WarningCode, number>
}
```

`sourceId` 在 MVP 中为固定内部值，为未来多上游保留。
`CanonicalNode.network` 描述分享链接的 transport；目标 renderer 不得将其直接解释为
允许代理的 IP 网络类型。

## 9. 依赖方向

```text
api → application → domain
                  ↘ source adapter
                  ↘ renderers → config fragments
platform/runtime → composition root only
```

- `domain` 不依赖 Cloudflare、3x-ui 或 sing-box JSON 类型。
- source adapter 不依赖 renderer。
- DNS 与 Rules Generator 通过明确片段契约协作，不相互调用。
- Worker bindings 只在 composition root 注入。

运行时依赖保持最小，不在 Worker 中运行 sing-box；sing-box 1.14.0 只用于本地和 CI 验证。

## 10. 扩展机制

- 新协议：新增 parser 和 outbound mapper。
- 新输出：新增 renderer，例如 MihomoRenderer。
- 新平台：新增 Platform Overlay。
- 多上游：将内部 `sourceId` 扩展为受控配置映射，仍不接受任意 URL。
- 新 DNS/路由策略：新增版本化 generator，不在现有策略中堆叠条件。

## 11. 决策记录

- [ADR-0001](./adr/0001-cloudflare-workers-stateless.md)：Cloudflare Workers 无状态架构。
- [ADR-0002](./adr/0002-canonical-node-renderers.md)：CanonicalNode 与 renderer 分层。
- [ADR-0003](./adr/0003-target-clients-and-version.md)：目标客户端和 sing-box 1.14.0。
- [ADR-0004](./adr/0004-subscription-auth-and-no-cache.md)：Subscription ID 鉴权和无缓存。
- [ADR-0005](./adr/0005-routing-policy.md)：国内直连、国外代理。
- [ADR-0006](./adr/0006-vless-reality-scope.md)：VLESS + REALITY 范围。
- [ADR-0007](./adr/0007-dns-policy.md)：分流加密 DNS。
