# 项目说明

## 项目定位

本项目是部署在 Cloudflare Workers 上的无状态订阅转换服务。它使用请求中的 3x-ui Subscription ID 实时获取原始节点，将兼容的 VLESS + REALITY 节点转换为适用于 sing-box 1.14.0 的完整配置。

项目只负责配置获取、转换和组装，不承载代理流量，也不管理 3x-ui 用户。

## 项目背景

3x-ui 可以提供分享链接、Xray JSON 和 Mihomo 等订阅形式，但缺少面向 sing-box 的平台化配置。sing-box 用户通常仍需手工完成节点转换、基础入站、节点选择、DNS 和路由配置。本项目将这些步骤统一为一个可订阅的 HTTP 接口。

## 使用者

- 维护单个 3x-ui 实例的管理员。
- 使用官方 sing-box iOS、macOS、Android 图形客户端的用户。
- 在 Windows、Linux 上使用 sing-box core 的用户。

## 工作流程

1. 管理员在部署时配置唯一的 3x-ui HTTPS 订阅 Base URL。
2. 客户端请求 `GET /v1/sing-box/{clientType}/{subscriptionId}`。
3. Worker 使用同一个 Subscription ID 实时请求 3x-ui。
4. Worker 解码订阅并解析 VLESS + REALITY 节点。
5. 单个无效或不兼容节点被忽略；没有可用节点时返回错误。
6. Worker 组装 sing-box 1.14.0 配置并返回 JSON。

## 功能范围

### 订阅源

- 只支持一个部署时配置的 HTTPS Base URL。
- Base URL 不包含 Subscription ID，并以 `/` 结尾。
- 不允许客户端覆盖上游协议、主机、端口或路径。
- 支持 3x-ui 原始订阅的 Base64 和明文分享链接列表。
- 3x-ui 不存在或拒绝 Subscription ID 时不生成配置。
- 白名单透传流量、有效期、刷新间隔等订阅元数据头。

### 输出目标

| `clientType` | 目标                             |
| ------------ | -------------------------------- |
| `ios`        | 官方 sing-box iOS 图形客户端     |
| `macos`      | 官方 sing-box macOS 图形客户端   |
| `android`    | 官方 sing-box Android 图形客户端 |
| `windows`    | sing-box core                    |
| `linux`      | sing-box core                    |

输出 schema 固定为 sing-box 1.14.0，不跟随预发布版本或浮动的 `latest`。

### 节点兼容范围

MVP 只接受：

- `vless://` 分享链接；
- 明确启用 REALITY；
- 地址、端口、UUID、REALITY public key、server name 等必需字段完整；
- 能够无歧义映射到 sing-box 1.14.0。

首个必须验收的组合是 VLESS + REALITY + TCP，可包含 `xtls-rprx-vision`。其他 transport 只有通过输入 fixture、配置检查和真实连通性测试后才能加入兼容矩阵。

不得猜测连接必需字段，不得自动启用 `tls.insecure`。

### 配置组成

- 公共日志和入站配置。
- VLESS + REALITY 节点 outbounds。
- 手动 `selector` 和自动 `urltest`，默认使用自动选择组。
- 按平台应用的 TUN Overlay。
- [DNS 生成规格](./DNS.md)。
- [路由规则生成规格](./RULES.md)。

## 非功能要求

### 正确性

- 五个平台均有 golden fixture。
- 所有生成结果通过 JSON 结构校验和 sing-box 1.14.0 `check`。
- 单节点失败不影响兼容节点；零个兼容节点返回 422。

### 安全

- Base URL、Subscription ID、节点链接和生成配置按敏感信息处理。
- 只允许固定 HTTPS 上游，并限制重定向、响应大小和处理时间。
- Worker 不缓存成功或失败结果，响应使用 `Cache-Control: private, no-store`。
- 日志不记录完整 URL、Subscription ID 或节点凭据。
- 详细要求见 [SECURITY.md](./SECURITY.md)。

### 可靠性与维护性

- 服务无状态，每个请求实时访问一次 3x-ui。
- 获取、解析、中间模型和目标 renderer 相互隔离。
- 平台差异使用 Overlay，不复制完整模板。
- 公开行为变更必须更新对应规格和 ADR。

## MVP

- 单个 Cloudflare Worker。
- 单个固定的 3x-ui HTTPS Base URL。
- `GET /v1/sing-box/{clientType}/{subscriptionId}`。
- 五个已确认的客户端目标。
- sing-box 1.14.0。
- VLESS + REALITY + TCP/XTLS Vision 基线。
- 独立定义的 DNS 与国内外路由策略。
- 不缓存订阅或转换结果。
- 输入限制、上游安全、日志脱敏和速率限制。
- 单元测试、集成测试、配置检查和 staging 验证。

## 后续范围

- 扩展 VLESS + REALITY transport。
- 支持 VMess、Trojan、Shadowsocks、Hysteria2 等协议。
- 新增 Mihomo renderer。
- 支持多个受控 3x-ui 来源。
- 路由、DNS 和节点选择策略版本化与可配置化。
- 在重新评估安全模型后支持短时缓存或代理 token。
- 管理界面、节点健康检查和更细粒度监控。

## 不做

- 不登录或操作 3x-ui 管理 API。
- 不修改用户、入站、流量或有效期。
- 不提供代理转发服务。
- 不接受任意上游 URL。
- 不存储用户订阅内容。
- 不提供注册、支付或计费。
- 不承诺兼容第三方 sing-box GUI。
- MVP 不输出 Mihomo、Clash 或 Xray 配置。

## API 验收结果

| 场景                       | 结果                                 |
| -------------------------- | ------------------------------------ |
| 有效 ID 且至少一个兼容节点 | 200，返回可通过 sing-box 检查的 JSON |
| 请求参数非法               | 400                                  |
| 3x-ui 不存在或拒绝该 ID    | 404                                  |
| 订阅中没有兼容节点         | 422                                  |
| 上游错误或内容异常         | 502                                  |
| 上游超时                   | 504                                  |
| 触发限速                   | 429                                  |

## 文档职责

- [ARCHITECTURE.md](./ARCHITECTURE.md)：系统结构与模块契约。
- [RULES.md](./RULES.md)：可独立实现的 sing-box 路由生成规格。
- [DNS.md](./DNS.md)：可独立实现的 sing-box DNS 生成规格。
- [SECURITY.md](./SECURITY.md)：Worker 服务自身的安全要求。
- [DEVELOPMENT.md](./DEVELOPMENT.md)：开发、验证和部署流程。
- `adr/`：已接受决策及其理由，不重复实现细节。
