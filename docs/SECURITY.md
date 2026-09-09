# 服务安全规范

## 1. 范围

本文只定义订阅转换服务自身的安全要求：认证、敏感信息、输入验证、外部请求、资源限制、权限边界、响应和日志。

本文不评估用户启用代理后的隐私、DNS、流量特征、审查规避或客户端操作系统安全。DNS 配置属于 [DNS.md](./DNS.md)，路由配置属于 [RULES.md](./RULES.md)。

## 2. 信任边界

```text
不可信：客户端请求、路径参数、请求头
    │
    ▼
可信：Worker 代码、部署配置和 bindings
    │
    ▼
受控目标：唯一的 3x-ui HTTPS 主机
    │
    ▼
不可信数据：订阅正文、节点名称和节点参数
```

即使上游主机由管理员维护，其响应仍必须经过完整校验。

## 3. 认证与授权

- Subscription ID 是 bearer secret。
- 下游 ID 与请求 3x-ui 时使用的 ID 完全一致。
- Worker 不签发第二层 token，不维护用户数据库或 ID 映射。
- 每次请求实时访问 3x-ui，以其结果判断 ID 是否存在和可用。
- 3x-ui 不存在、禁用或拒绝该 ID 时不返回配置。

Subscription ID 位于 URL 路径，可能进入客户端记录、浏览器历史或基础设施访问日志。因此服务必须使用 HTTPS、限制日志字段并对失败请求限速。未来改用代理 token 属于鉴权模型变化，需要新 ADR。

## 4. 敏感信息

以下数据均视为敏感：

- `THREE_X_UI_SUB_BASE_URL`，包括随机订阅路径。
- Subscription ID。
- VLESS UUID 和完整分享链接。
- REALITY 参数。
- 生成的完整 sing-box 配置。

处理要求：

- 生产 Base URL 使用 Cloudflare Worker Secret。
- 本地只放入被 Git 忽略的 `.dev.vars`。
- CI secret 不提供给不受信任的 fork 构建。
- fixture 只使用不可用域名和虚假凭据。
- 不把真实订阅或配置上传为测试 artifact。
- 错误监控不附带请求路径、请求正文、上游正文或生成配置。

## 5. 请求验证

- 只允许 GET。
- `clientType` 严格匹配五个小写枚举。
- `subscriptionId` 必须是单个非空路径段。
- 拒绝 `/`、反斜杠、控制字符、无效 percent encoding、双重编码和超长值。
- URL 只解码一次。
- 不接受查询参数或请求头覆盖 Base URL、host、renderer 或目标版本。
- Subscription ID 的最终字符集和长度必须使用目标 3x-ui 版本 fixture 验证。

## 6. 上游响应验证

- 在流式读取期间执行正文大小限制，不能先无界读取再检查。
- 初始上限建议为 1 MiB、500 个节点；实现前用脱敏样本校准。
- Base64 必须严格校验，同时限制解码后大小。
- 限制行数、单行长度、节点名称和生成 JSON 大小。
- 只接受原始分享链接文本；HTML、非预期 JSON/YAML 和混合编码视为错误。
- 节点名称清除控制字符并稳定去重。
- 使用 JSON serializer 输出，禁止字符串拼接 JSON。

### VLESS + REALITY 验证

至少验证：

- UUID 格式。
- server 是合法域名或 IP 表示。
- port 在 1–65535。
- `security=reality`。
- REALITY public key 和 server name。
- short ID、fingerprint、flow 和 transport 位于兼容范围。

禁止：

- 缺失字段时降级为明文或普通 TLS。
- 自动设置 `tls.insecure`。
- 猜测 UUID、public key、port 或 server name。
- 将未知参数原样复制到输出。

## 7. 外部请求

### Base URL

- 只能来自部署 Secret。
- 协议必须为 HTTPS。
- 不得包含 username、password、fragment 或 Subscription ID。
- 固定允许的 scheme、hostname 和 port。
- 不允许 localhost、链路本地或私网目标。
- Subscription ID 作为编码后的单一路径段追加，不参与 host 解析。

### 重定向

- 上游 fetch 使用手动重定向。
- MVP 拒绝所有重定向。
- 未来允许重定向时，每一跳都必须重新执行 URL 策略，且不得跨 scheme、host 或 port。

### 请求头

- 设置明确的非 HTML `Accept`。
- 不转发客户端 Cookie、Authorization、Referer 或内部预览头。
- 不提供跳过上游证书验证的选项。

## 8. 资源与滥用控制

- 上游请求设置总超时。
- MVP 不自动重试，避免放大上游压力。
- 限制正文、解码结果、节点数量和生成结果大小。
- 使用 Cloudflare Rate Limiting 或 WAF 限制单 IP 请求和失败枚举。
- Worker 设置合理的 CPU 上限。
- 不在模块全局保存请求级可变状态。
- 所有异步操作必须 await、return 或交给 `ctx.waitUntil()`。

## 9. 缓存

- 不使用 Cache API、KV、D1、R2 或 Durable Objects 保存订阅。
- 成功和错误响应均设置 `Cache-Control: private, no-store`。
- 不复用跨请求的用户配置对象。
- 不允许 CDN 使用自定义规则缓存 API 响应。

这里的缓存约束只针对 Worker 的订阅和转换结果。客户端内部行为由各配置规格定义。

## 10. 权限边界

Worker 只需要：

- 接收公开 HTTPS GET。
- 读取运行所需 bindings。
- 请求唯一的 3x-ui HTTPS host。
- 写入经过脱敏的结构化日志。

Worker 不需要：

- 3x-ui 管理 API token。
- Cloudflare API token 的运行时访问。
- 数据库、对象存储或文件系统权限。
- 任意 TCP socket 或任意上游代理能力。

部署 token 只允许目标账号和 Worker 的必要部署/路由操作，不进入 Worker runtime。

## 11. 日志

允许记录：

- request ID。
- clientType。
- Subscription ID 的带服务端 pepper 的 HMAC 截断摘要，或完全不记录该标识。
- 上游状态类别。
- 节点总数、有效数、忽略数。
- 固定 warning/error code 和各阶段耗时。

禁止记录：

- 完整 URL、path 或 Base URL。
- Subscription ID 明文或可逆编码。
- 分享链接、UUID、REALITY 参数或生成配置。
- 请求头 dump、Cookie、Authorization。
- 未清洗异常对象。

生产环境必须配置采样和保留期；接入第三方日志平台前检查其自动采集字段。

由于 Subscription ID 位于 URL path，Cloudflare invocation logs 和自动 tracing 会采集
完整 URL，因此部署配置必须设置 `observability.logs.invocation_logs = false` 并禁用
`observability.traces`。允许保留 Worker 主动输出的脱敏结构化错误日志。

## 12. 响应

配置响应至少包含：

```text
Content-Type: application/json; charset=utf-8
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

- 不需要浏览器跨域访问时不添加宽泛 CORS。
- 下载文件名只由受控平台枚举生成。
- 只透传架构文档列出的订阅元数据头，并限制长度、清除控制字符。
- 错误只返回稳定 code、通用 message 和 request ID。
- 客户端响应不得包含内部堆栈或上游 URL。

## 13. 安全测试

- 路径穿越、双重编码、超长 ID 和控制字符。
- Base URL 用户信息、fragment、非 HTTPS 和受限地址。
- 同域、跨域和 HTTPS 降级重定向。
- 超大正文、非法 Base64、超长单行和大量节点。
- HTML、JSON、YAML 和混合编码误响应。
- 恶意节点名称导致日志、响应头或 JSON 注入。
- 缺失 REALITY 必需字段和未知 transport。
- 所有失败路径不记录或返回 secret。
- 所有 API 响应不可缓存。
- 速率限制和超时行为符合接口约定。

## 14. 事件处理

发现 Subscription ID 或 Base URL 泄露时：

1. 在 3x-ui 中轮换或禁用受影响的 Subscription ID。
2. 必要时修改 3x-ui 订阅路径并轮换 Worker Secret。
3. 检查并清理有权限的日志和 CI artifact。
4. 验证旧 ID 和旧 Base URL 不再可用。
5. 记录原因和防复发措施，不在事件记录中复制真实 secret。
