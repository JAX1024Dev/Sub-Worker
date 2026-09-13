# sing-box DNS 配置规格

## 1. 目的与边界

本文是 sing-box 1.14.0 DNS 模块的唯一详细规格，可用于单独实现或生成 DNS 配置。

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
- 不启用 FakeIP。
- 固定使用 sing-box 1.14.0 的新 DNS server 格式。

## 3. 输入契约

```text
directOutboundTag = "direct"
proxyOutboundTag = "proxy"
cnDomainRuleSetTag = "geosite-cn"
cnDnsServerTag = "dns-cn"
globalDnsServerTag = "dns-global"
```

生成器还需要所有代理节点的服务器地址，用于为域名形式的节点设置 `domain_resolver: dns-cn`。
生成器必须接收 `clientType`，用于应用受控的平台 DNS 策略。

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

- 解析 `geosite-cn` 域名。
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

## 5. DNS Rules

按以下顺序生成：

### D0：iOS 禁用 AAAA

仅当 `clientType = ios` 时首先生成：

```text
match: query_type = AAAA
action: reject
no_drop: true
```

该规则避免 iOS 应用获得 Packet Tunnel 直连出口无法使用的 IPv6 地址。`no_drop: true`
确保高频 AAAA 查询始终立即收到拒绝，不因触发 reject 阈值而变为静默丢包。其他平台不生成 D0。

### D1：中国域名

```text
match: rule_set = geosite-cn
action: route
server: dns-cn
```

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
dns.strategy = ipv4_only   # iOS
dns.strategy = prefer_ipv4 # 其他平台
dns.disable_cache = false
dns.optimistic = false
dns.timeout = 5s
```

说明：

- iOS 使用 `ipv4_only`，并配合 D0 拒绝 AAAA，避免应用选择无法通过 Packet Tunnel
  直连的 IPv6 地址；这是平台兼容策略，不是 DNS 泄漏策略。
- 其他平台使用 `prefer_ipv4`，优先 IPv4 但保留 IPv6。
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

DNS 的 D1 依赖 `geosite-cn`。该规则集由路由模块声明，并通过 proxy HTTP client 下载。

启动依赖顺序为：

```text
dns-cn 可直接连接
    → 解析代理节点服务器域名
    → 建立 proxy outbound
    → 下载 geosite/geoip rule-set
    → 完整 DNS 与路由规则可用
```

## 10. 输出契约

```text
generateDns(clientType: ClientType) -> DnsFragment {
  dns: DnsConfig
  outboundRequirements: {
    domainResolverForDomainNodes: "dns-cn"
  }
  tunRequirements: {
    dnsMode: "hijack"
  }
  routeRequirements: {
    explicitHijackDnsRule: true
  }
}
```

DNS 生成器不得直接修改 route rules、节点凭据或平台 TUN 地址。

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
- iOS 拒绝 AAAA 且使用 `ipv4_only`；其他平台不拒绝 AAAA 并使用 `prefer_ipv4`。
- `dns-cn` 不设置 detour、使用内置 direct dialer；`dns-global` → proxy。
- 两个 DoH endpoint 均使用 IP 连接和正确 TLS server name。
- 域名形式的代理节点使用 `dns-cn` bootstrap。
- 没有明文或系统 DNS fallback。
- 没有 FakeIP、持久化 DNS cache 或 optimistic cache。
- 五个平台包含正确的 TUN/route DNS 集成。
- 完整输出通过 sing-box 1.14.0 `check`。

## 13. 变更规则

更换 DNS provider、fallback 语义、缓存策略、FakeIP 策略或 bootstrap 方法时，必须更新本文、golden fixture 和 DNS ADR。

## 14. 参考

- [sing-box DNS](https://sing-box.sagernet.org/configuration/dns/)
- [sing-box DNS over HTTPS](https://sing-box.sagernet.org/configuration/dns/server/https/)
- [sing-box DNS Rule](https://sing-box.sagernet.org/configuration/dns/rule/)
- [sing-box DNS Rule Action](https://sing-box.sagernet.org/configuration/dns/rule_action/)
- [sing-box TUN](https://sing-box.sagernet.org/configuration/inbound/tun/)
