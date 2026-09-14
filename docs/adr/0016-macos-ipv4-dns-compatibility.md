# ADR-0016：macOS 使用 IPv4 DNS 兼容策略

- 状态：已接受
- 日期：2026-09-14

## 背景

production macOS 日志显示，规则能够正确将 `docs.bigmodel.cn` 等中国域名送往 direct，
但 DNS 同时返回 A 与 AAAA 后，应用反复选择 `2409:*` 中国 IPv6。sing-box 已将 direct
拨号绑定到物理接口 `en0`，该接口仍对 TCP 与 QUIC 报 `no route to host`；同一响应中的
IPv4 地址可用。因此问题是当前物理网络缺少可达 IPv6 路由，而非规则集误判。

## 决策

- macOS DNS 首先拒绝 AAAA，并设置 `dns.strategy = ipv4_only`。
- macOS R6 resolve 显式使用 `strategy = ipv4_only`，防止未分类域名重新引入 IPv6。
- 不硬编码故障域名、CDN 地址或端口；国外域名仍经 proxy，中国域名/IP 仍走 direct。
- iOS 的 TUN 双栈行为不受影响。

## 后果

这避免应用在 IPv4-only Wi-Fi 上选中不可达 IPv6，修复部分中国站点持续加载失败。代价
是 macOS 当前不使用目标站点 IPv6；未来若需要恢复双栈，应先实现并实测物理接口 IPv6
可达性或可靠的地址族回退，而不是仅把 DNS 改回 `prefer_ipv4`。

## 验证要求

- macOS fixture 必须拒绝 AAAA，DNS 与 R6 均为 `ipv4_only`。
- 完整配置通过 sing-box 1.14.0 `check`。
- production 更新后回归中国站点、国外代理、UDP/QUIC 与 WebRTC。
