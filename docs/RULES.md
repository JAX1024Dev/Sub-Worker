# sing-box 路由规则规格

## 1. 目的与边界

本文是 sing-box 1.14.0 路由模块的唯一详细规格，可用于单独实现或生成路由配置。

本文负责：

- `route.rules` 的顺序和语义；
- `route.rule_set` 的依赖；
- `route.final` 和必要的 route 级选项；
- 远程规则集所需的 HTTP client 契约。

本文不负责 DNS server 定义、节点解析、outbound 字段或平台 TUN 字段。DNS 模块见 [DNS.md](./DNS.md)。

## 2. 生成目标

- schema：sing-box 1.14.0。
- 策略：国内直连，国外代理。
- FakeIP：不使用。
- 旧版 `geosite`、`geoip` 数据库字段：不使用。
- 旧版 rule `outbound` 字段：不使用；统一采用 `action: route`。

## 3. 输入契约

路由生成器接收以下逻辑依赖：

```text
directOutboundTag = "direct"
proxyOutboundTag  = "proxy"
cnDnsServerTag    = "dns-cn"
globalDnsServerTag = "dns-global"
ruleSetHttpClientTag = "rules-via-proxy"
```

要求：

- `direct` 必须指向 direct outbound。
- `proxy` 必须指向 selector；selector 默认选择 urltest 组。
- DNS server tag 必须由 DNS 模块提供。
- 规则集 HTTP client 必须通过 `proxy` 下载远程规则。

缺少任一依赖时，生成器必须失败，不得替换成“第一个 outbound”等隐式默认值。

## 4. 规则集

| tag              | 内容                 | 预期来源                               |
| ---------------- | -------------------- | -------------------------------------- |
| `geosite-cn`     | 中国大陆域名         | SagerNet `geosite-geolocation-cn.srs`  |
| `geosite-non-cn` | 明确的非中国大陆域名 | SagerNet `geosite-geolocation-!cn.srs` |
| `geoip-cn`       | 中国大陆 IP 网段     | SagerNet `geoip-cn.srs`                |

生成要求：

- 使用 remote binary rule-set。
- URL 固定到经过验证的 release 或 commit，不引用内容可变的未固定分支。
- 每个 rule-set 显式使用 `rules-via-proxy` HTTP client。
- 不使用 1.14.0 已废弃的 `download_detour`。
- MVP 不显式启用 `experimental.cache_file`；客户端启动时需要获取规则集。
- URL、固定版本和校验信息作为集中常量维护。

## 5. 规则顺序

规则必须保持以下顺序；后续规则不得改变前面已完成的 final action。

### R1：协议嗅探

```text
match: all eligible connections
action: sniff
```

目的：为 HTTP、TLS、QUIC 等连接恢复可用于域名规则匹配的目标信息。

### R2：DNS 劫持

```text
match: protocol = dns
action: hijack-dns
```

该规则的需求来自 DNS 模块，但由路由生成器输出。

### R3：已知私网目标直连

```text
match: ip_is_private = true
action: route → direct
```

处理请求进入路由阶段时已经是 IP 的私网、回环和链路本地目标。

### I1：iOS TUN 内公网 IPv6 代理保护

仅当 `clientType = ios` 时，在 R3 之后生成：

```text
match: ip_version = 6
action: route → proxy
```

iOS TUN 在接管流量前已通过显式 `route_exclude_address` 将中国 IPv6 交给系统原生
网络，因此进入本规则的公网 IPv6 属于未被中国 IPv6 CIDR 覆盖的流量，必须经 proxy，
避免 Packet Tunnel direct 出站返回 `no route to host`。该规则也保护应用预解析、缓存
或直接使用的 IPv6 字面量。

### R4：中国域名直连

```text
match: rule_set = geosite-cn
action: route → direct
```

### R5：非中国域名代理

```text
match: rule_set = geosite-non-cn
action: route → proxy
```

该规则必须先于 `geoip-cn`，避免国外域名因使用中国 CDN 地址而误直连。

### R6：解析未分类域名

```text
match: unconditional non-final rule
action: resolve
server: omitted
strategy: ipv4_only # 仅 iOS；其他平台省略
```

不指定 server，使域名目标进入 [DNS.md](./DNS.md) 定义的 DNS rules；IP 目标不需要解析。该 action 是 non-final，处理后继续匹配后续 IP 规则。
iOS 显式使用 `ipv4_only`，与 DNS 模块的 AAAA 拒绝策略形成纵深保护，避免未分类域名解析为不可直连的 IPv6。

### R7：解析后的私网目标直连

```text
match: ip_is_private = true
action: route → direct
```

防止未分类域名解析到私网地址后错误进入代理。

### R8：中国 IP 直连

```text
match: rule_set = geoip-cn
action: route → direct
```

主要处理直接访问中国 IP，以及未被域名规则覆盖但解析到中国地址的域名。

### Final：其他流量代理

```text
route.final = proxy
```

不得依赖 outbounds 数组顺序决定默认出口。

### 默认域名解析器

```text
route.default_domain_resolver = dns-cn
```

sing-box 1.14.0 要求域名拨号存在显式 resolver。该默认值服务直连域名和其他未单独
声明 resolver 的拨号；代理节点服务器域名仍由节点 outbound 显式指定 `dns-cn`。

## 6. 平台选项

- iOS、macOS、Windows、Linux core：`route.auto_detect_interface = true`，使出站连接绑定
  到真实的默认网络并避免 TUN 回环。sing-box 1.14.0 将 iOS 纳入 Darwin 平台，Apple
  官方客户端通过 NetworkExtension 的平台接口完成网络选择。
- iOS TUN：`route_exclude_address` 包含从固定 `geoip-cn` 规则集生成的中国 IPv6 CIDR，
  使其在进入 TUN 前由系统原生网络发送。不得使用 iOS 实机不生效的
  `route_exclude_address_set`。中国 IPv4 继续在 TUN 内由 R8 直连；其他平台不生成
  显式排除地址。
- Android 官方客户端：平台 Overlay 决定 `override_android_vpn`，MVP 默认 false。
- iOS：R6 使用 `ipv4_only`；其他平台保持默认解析策略。
- iOS：在 R3 与 R4 之间插入 I1，保护仍由 TUN 接管的公网 IPv6。
- 除已记录的 iOS 原生旁路和 I1 外，平台差异只能调整 route 级系统集成字段和 R6
  的解析策略。不得按应用动态端口或观测到的临时服务 IP 硬编码分流。

## 7. 输出契约

路由生成器输出：

```text
generateRules(clientType: ClientType) -> RoutingFragment {
  http_clients: HttpClient[]
  route: {
    rules: RouteRule[]
    rule_set: RuleSet[]
    final: "proxy"
    platformOptions?: object
  }
}
```

合并器必须检测 tag 冲突。路由生成器不得修改节点 outbounds 或 DNS server 内容。

## 8. 失败策略

以下情况停止生成完整配置：

- 依赖的 outbound 或 DNS tag 缺失。
- 规则集 URL 未固定版本或不符合 HTTPS 策略。
- 规则顺序被策略扩展破坏。
- 产生 sing-box 1.14.0 不支持或已移除的字段。

运行期规则集下载失败由 sing-box 报告，不回退到另一来源或静默变更路由语义。

## 9. 测试要求

- R1–R8 顺序快照测试。
- CN 域名 → direct。
- 非 CN 域名即使解析到 CN IP → proxy。
- 直接 CN IP → direct。
- 私网 IP 和解析到私网的域名 → direct。
- 未分类域名和非 CN IP → proxy。
- iOS R6 使用 `ipv4_only`，其他平台的 R6 不携带 `strategy`。
- iOS 生成 `auto_detect_interface = true`，显式中国 IPv6 `route_exclude_address` 与 I1。
- iOS 中国 IPv6 → TUN 原生旁路，中国 IPv4 → TUN 内 direct；仍进入 TUN 的公网 IPv6
  → proxy。
- 显式 IPv6 CIDR 必须与固定版本 `geoip-cn` 一致，并覆盖实机日志中确认的
  `2402:4e00:*`、`2402:840:*` 和 `2409:8c54:*` 地址。
- 其他平台中国 IPv4/IPv6 → direct，其他 IPv4/IPv6 → proxy。
- DNS 请求 → `hijack-dns`。
- 规则集均使用固定 URL 和显式 HTTP client。
- 五个平台输出通过 sing-box 1.14.0 `check`。

实机基线：官方 iOS 客户端在 IPv6 Wi-Fi 下必须能同时访问 YouTube、微信、抖音、
滴滴主应用及滴滴钱包。中国 IPv6 应在进入 TUN 前旁路，不能与同一会话的中国 IPv4
形成国内/境外双出口。

## 10. 扩展规则

- 广告拦截、应用分流和自定义域名规则应插入具名策略阶段，不能直接改变 final。
- 每次顺序变化都需要更新本文件、golden fixture 和 ADR。
- 未来支持本地或内嵌 rule-set 时，可替换来源实现，但 tag 和业务语义应保持稳定。

## 11. 参考

- [sing-box Route](https://sing-box.sagernet.org/configuration/route/)
- [sing-box Route Rule](https://sing-box.sagernet.org/configuration/route/rule/)
- [sing-box Rule Action](https://sing-box.sagernet.org/configuration/route/rule_action/)
- [sing-box Rule Set](https://sing-box.sagernet.org/configuration/rule-set/)
