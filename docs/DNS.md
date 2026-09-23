# sing-box DNS 配置规格

## 1. 目的与边界

本文是 sing-box 1.14.0 DNS 行为的唯一详细规格。重构后，具体 JSON 保存在
`example/sing-box/dns/`，由 profile 选择并发布到远程 bundle；Worker 只验证和组合，
不再通过 TypeScript 条件生成 DNS 字段。

本文负责：

- `dns.servers`、`dns.rules`、`dns.final` 和缓存行为；
- 代理节点域名的 bootstrap resolver 契约；
- TUN 的 DNS 接管要求；
- 对路由模块提出 `hijack-dns` 依赖。

路由顺序和 rule-set 定义见 [RULES.md](./RULES.md)。本文讨论的是生成配置的行为，不属于 Worker 服务安全规范。

## 2. 设计目标

- 中国大陆域名使用低延迟的国内加密 DNS。
- 其他域名使用经代理连接的境外加密 DNS。
- 不为普通查询配置 UDP/53、明文 TCP/53 或系统 DNS fallback。
- 避免 DNS resolver 自身的域名 bootstrap 环路。
- 默认不启用 FakeIP；macOS 实验双栈模式使用 FakeIP 保留域名与地址族回退能力。
- 固定使用 sing-box 1.14.0 的新 DNS server 格式。

## 3. 输入契约

```text
directOutboundTag = "direct"
proxyOutboundTag = "proxy"
cnDomainRuleSetTag = "geosite-cn"
cnDnsServerTag = "dns-cn"
globalDnsServerTag = "dns-global"
fakeIpDnsServerTag = "dns-fakeip"
```

profile 必须成组选择 DNS、平台和路由片段。例如 macOS FakeIP 双栈 profile 选择
`fakeip-dual-stack.json`，IPv4 兼容 profile 选择对应的 AAAA 拒绝片段。不得由 Worker
环境变量在运行时局部改写 DNS，以免产生不一致组合。

节点 renderer 仍需要 DNS 片段声明的 bootstrap resolver tag，用于为域名形式的代理节点
设置 `domain_resolver: dns-cn`。

## 4. DNS Servers

### 4.1 `dns-cn`

| 字段            | 值               |
| --------------- | ---------------- |
| type            | `https`          |
| tag             | `dns-cn`         |
| server          | `223.5.5.5`      |
| server_port     | `443`            |
| path            | `/dns-query`     |
| TLS server name | `dns.alidns.com` |
| detour          | 不设置           |

用途：

- 解析 `geosite-cn`、`apple-cn`、`microsoft-cn` 域名。
- 解析使用域名作为服务器地址的代理节点。

使用 IP 连接并显式设置 TLS server name，避免解析 DoH 服务自身。sing-box 1.12+
的新式 HTTPS DNS server 在未设置 detour 时使用自身 dialer，语义等同于空 direct
outbound；不得再把它 detour 到项目中的 `direct` outbound，否则 1.14.0 图形客户端
会以 “detour to an empty direct outbound makes no sense” 拒绝启动。

### 4.2 `dns-global`

| 字段            | 值                   |
| --------------- | -------------------- |
| type            | `https`              |
| tag             | `dns-global`         |
| server          | `1.1.1.1`            |
| server_port     | `443`                |
| path            | `/dns-query`         |
| TLS server name | `cloudflare-dns.com` |
| detour          | `proxy`              |

用途：解析不属于中国域名规则集的普通目标域名。

该 resolver 必须通过 proxy selector 连接。连接代理节点前需要的节点服务器域名只能由 `dns-cn` 解析，禁止让 `dns-global` 自身参与该 bootstrap。

### 4.3 `dns-fakeip`（仅 macOS 实验双栈）

| 字段        | 值              |
| ----------- | --------------- |
| type        | `fakeip`        |
| tag         | `dns-fakeip`    |
| inet4_range | `198.18.0.0/15` |
| inet6_range | `fc00::/18`     |

由 macOS `fakeip-dual-stack` profile 启用。它只回答客户端 A/AAAA 查询，
使应用建立的 IPv4/IPv6 连接都进入 TUN；sing-box 随后把 FakeIP 还原为原域名。内部的
direct 域名解析显式使用 `dns-cn`，不会再次命中 FakeIP 规则。

## 5. DNS Rules

按以下顺序生成：

### D0：Apple IPv4 兼容模式禁用 AAAA

当 profile 选择 macOS `ipv4-compatible` 或 iOS `native-bypass` DNS 策略时包含：

```text
match: query_type = AAAA
action: reject
no_drop: true
```

该规则让 iOS 的普通域名连接继续优先使用兼容性更稳定的 IPv4，缩小平台网络差异。
`no_drop: true` 确保高频 AAAA 查询始终立即收到拒绝，不因触发 reject 阈值而变为
静默丢包。应用预解析、缓存或直接获得的 IPv6 字面量不受该规则影响。iOS
`tun-dual-stack`、macOS `fakeip-dual-stack` 和其他平台不生成 D0。

### D0.5：macOS 双栈使用 FakeIP 回答地址查询

仅在 macOS `fakeip-dual-stack` DNS 片段中，在普通 DNS 分流前包含：

```text
match: query_type = A or AAAA
action: route
server: dns-fakeip
```

该规则不是代理出口规则。它保留域名到临时地址的映射，让 direct outbound 在物理 IPv6
不可用时仍能用同一域名解析并尝试 IPv4，而不是被一个已确定的 IPv6 字面地址锁死。

### D1：中国服务域名

```text
match: rule_set = apple-cn, then microsoft-cn, then geosite-cn
action: route
server: dns-cn
```

普通 split-DoH profile 按上述顺序配置；FakeIP 双栈 profile 的 D0.5 已提前回答客户端
A/AAAA 查询，内部真实解析由 direct 出站使用 `dns-cn`。

### D2：默认

```text
match: all remaining queries
action: route
server: dns-global
```

不得使用 sing-box 1.14.0 已废弃的 DNS rule `outbound` 字段或 action 内的 legacy `strategy`。

## 6. 全局 DNS 选项

```text
dns.final = dns-global
dns.strategy = ipv4_only   # macOS ipv4-compatible 与 iOS native-bypass
dns.strategy = prefer_ipv4 # macOS FakeIP/iOS TUN 双栈与其他平台
dns.disable_cache = false
dns.optimistic = false
dns.timeout = 5s
```

说明：

- macOS `ipv4-compatible` 和 iOS `native-bypass` 使用 `ipv4_only` 并配合 D0 拒绝 AAAA，
  降低普通域名连接的 IPv6 兼容风险；这是保守的平台兼容策略，不是 DNS 泄漏策略，也不
  覆盖 IPv6 字面量。
- macOS `fakeip-dual-stack`、iOS `tun-dual-stack` 与其他平台使用 `prefer_ipv4`；
  macOS 对客户端 A/AAAA 返回 FakeIP，真实地址族由 direct 重新解析和选择。
- 保留 sing-box 进程内的正常 DNS 缓存以降低延迟；“Worker 不缓存订阅”不等于禁用客户端 DNS 缓存。
- 不启用 optimistic cache，避免返回已过期记录。
- 不通过 `experimental.cache_file` 持久化 DNS 缓存。
- 任一 DoH 失败时解析失败，不降级到未配置的明文或系统 resolver。

## 7. 代理节点 Bootstrap

- 代理服务器是 IP：不需要 domain resolver。
- 代理服务器是域名：对应 VLESS outbound 显式设置 `domain_resolver: dns-cn`。
- `route.default_domain_resolver` 设置为 `dns-cn`，满足 sing-box 1.14.0 对未显式指定
  resolver 的直连拨号要求；它主要服务已由路由规则判定为直连的域名。
- `dns-cn` 使用 IP 连接，因此不会递归依赖其他 DNS。
- bootstrap 只服务代理服务器地址解析，不作为普通查询的默认路径。

此规则是节点 renderer 与 DNS 模块之间的接口契约。节点 renderer 未正确设置 domain resolver 时，完整配置校验必须失败。

## 8. TUN 与路由集成

- 支持的平台使用 sing-box 1.14.0 TUN `dns_mode: hijack`。
- 未显式提供 `dns_address` 时，允许 sing-box 从 TUN 地址派生 DNS 地址。
- 若平台 Overlay 显式提供 `dns_address`，路由模块仍必须输出 `protocol: dns` + `action: hijack-dns`。
- [RULES.md](./RULES.md) 的 R2 始终输出显式 `hijack-dns`，保持五个平台行为一致。

## 9. 规则集下载关系

DNS 的 D1 依赖 `geosite-cn`、`apple-cn` 和 `microsoft-cn`。这些规则集由路由模块声明，
并通过 proxy HTTP client 下载。

启动依赖顺序为：

```text
dns-cn 可直接连接
    → 解析代理节点服务器域名
    → 建立 proxy outbound
    → 下载 geosite/geoip rule-set
    → 完整 DNS 与路由规则可用
```

## 10. 远程片段契约

```text
DnsFragment {
  schema_version: 1
  dns: SingBoxDnsConfig
  requires: {
    domainResolverForDomainNodes: "dns-cn"
    dnsMode: "hijack"
    explicitHijackDnsRule: true
  }
}
```

该片段是 [CONFIGURATION.md](./CONFIGURATION.md) 定义的 bundle 组成之一。它不得包含
节点凭据、route rules 或平台 TUN 地址。发布工具必须验证 `requires` 均由其他片段满足；
Worker Composer 不得猜测缺失依赖。

## 11. 失败策略

以下情况停止生成完整配置：

- direct、proxy 或 `geosite-cn` tag 缺失。
- DoH server 使用域名但没有 domain resolver，可能形成 bootstrap 环路。
- `dns-global` 没有明确走 proxy。
- 普通 DNS 存在系统、UDP/53 或明文 TCP/53 fallback。
- 域名节点没有 `domain_resolver: dns-cn`。
- 使用 sing-box 1.14.0 已移除或废弃且本项目禁止的字段。

## 12. 测试要求

- CN 域名查询 → `dns-cn`。
- 非 CN 和未分类域名查询 → `dns-global`。
- macOS `ipv4-compatible` 与 iOS `native-bypass` 拒绝 AAAA 且使用 `ipv4_only`；
  macOS `fakeip-dual-stack`、iOS `tun-dual-stack` 和其他平台不拒绝 AAAA 并使用
  `prefer_ipv4`。
- macOS `fakeip-dual-stack` 的 A/AAAA 规则优先指向唯一的 `dns-fakeip` server，且
  `dns-cn`、`dns-global` 仍用于 sing-box 内部真实解析。
- `dns-cn` 不设置 detour、使用内置 direct dialer；`dns-global` → proxy。
- 两个 DoH endpoint 均使用 IP 连接和正确 TLS server name。
- 域名形式的代理节点使用 `dns-cn` bootstrap。
- 没有明文或系统 DNS fallback。
- 默认配置没有 FakeIP；macOS 实验模式之外不得生成 FakeIP。所有模式均不使用持久化
  DNS cache 或 optimistic cache。
- 五个平台及 macOS 双栈试验 fixture 包含正确的 TUN/route DNS 集成。
- 完整输出通过 sing-box 1.14.0 `check`。

## 13. 变更规则

更换 DNS provider、fallback 语义、缓存策略、FakeIP 策略或 bootstrap 方法时，必须
更新源片段、本文、golden fixture 和 DNS ADR，并先发布到 staging channel。兼容现有
schema 的数值或规则调整不需要部署 Worker；片段 schema 变化仍需要代码发布。

## 14. 参考

- [sing-box DNS](https://sing-box.sagernet.org/configuration/dns/)
- [sing-box DNS over HTTPS](https://sing-box.sagernet.org/configuration/dns/server/https/)
- [sing-box FakeIP DNS server](https://sing-box.sagernet.org/configuration/dns/server/fakeip/)
- [sing-box DNS Rule](https://sing-box.sagernet.org/configuration/dns/rule/)
- [sing-box DNS Rule Action](https://sing-box.sagernet.org/configuration/dns/rule_action/)
- [sing-box TUN](https://sing-box.sagernet.org/configuration/inbound/tun/)
