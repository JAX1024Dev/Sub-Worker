# sing-box DNS 配置规格

DNS 片段位于 `example/sing-box/dns/`，由平台 profile 选择。本文描述客户端行为，不属于 Worker 的 [SECURITY.md](./SECURITY.md) 范围。路由服务分类见 [RULES.md](./RULES.md)。

## 解析器与分流

- `dns-cn`：阿里 DoH，IP `223.5.5.5:443`，TLS 名称 `dns.alidns.com`；不设置 detour。用于中国域名、Microsoft、节点服务器域名 bootstrap 与默认域名解析。
- `dns-global`：Cloudflare DoH，IP `1.1.1.1:443`，TLS 名称 `cloudflare-dns.com`；detour 为 `🚀 节点选择`。用于 Apple 与其他非中国域名。不得把 `dns-cn` detour 到空 `direct` outbound。
- `dns-tailscale`：绑定 `tailscale` endpoint，只接受 MagicDNS、tailnet split DNS 和搜索域，
  不把普通公网查询回退给 tailnet resolver。启用单标签设备名查询。
- macOS 可选 FakeIP 双栈片段含 `dns-fakeip`，用于应用 A/AAAA 查询；它不是远程 DNS 上游。

普通 split-DoH 规则先以 `preferred_by = dns-tailscale` 把 MagicDNS 与 tailnet DNS 路由交给
`dns-tailscale`。随后需要兼容的 IPv4-only profile 拒绝普通 AAAA；Apple → `dns-global`、
Microsoft → `dns-cn`、`geosite-cn` → `dns-cn`，其余 → `dns-global`。Microsoft 改选代理节点时
DNS 仍由 `dns-cn` 解析；服务组选择控制连接出口，不动态更改 DNS 上游。Apple 默认 direct，
但 DNS 仍走 `dns-global`；改选代理时也不改变 DNS 上游。这是当前配置层的明确限制，未来若要求 DNS 与组选择完全联动须另行设计。

macOS FakeIP 双栈先用 `dns-fakeip` 回答应用的 A/AAAA 请求，内部真实解析由 direct/route resolver 完成。macOS IPv4 兼容 profile 使用 `ipv4_only` 且拒绝 AAAA；其他已发布 profile 使用 `prefer_ipv4`。iOS 双栈保留 TUN 内 IPv4/IPv6 路由。各平台 `dns.timeout = 5s`、`disable_cache = false`、`optimistic = false`。

## 缓存与失败处理

`experimental.cache_file` 用于保存客户端 selector 选择与远程规则集，不代表 Worker 缓存订阅。DNS 查询仍使用 sing-box 运行时正常缓存，不启用未配置的系统 DNS/UDP 53 回退。任一 DoH 失败时可能导致相应域名无法解析；先用 staging 与实机验证再晋级 production。节点地址若为域名，节点 outbound 显式使用 `dns-cn` 作为 `domain_resolver`，避免代理 DNS bootstrap 循环。
Tailscale 未登录或不可用时，MagicDNS 查询失败且不会泄漏到公共 DoH；普通公网 DNS 仍按原策略工作。
