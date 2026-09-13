# ADR-0010：iOS 中国 IPv6 快速回退到 IPv4

- 状态：已被 ADR-0011 取代
- 日期：2026-09-14

## 背景

ADR-0008 将 iOS 的全部公网 IPv6 经代理转发，解决了 Packet Tunnel direct 出站的
IPv6 `no route to host`。后续实机日志显示，滴滴等国内服务会同时建立国内直连 IPv4
和经境外代理的中国 IPv6 连接。虽然两类连接均无传输错误，但不同出口地址、地域和
时延可能破坏支付类页面的会话一致性或风险控制。

## 决策

- 保留 DNS AAAA 拒绝和 `ipv4_only`。
- iOS 私网 IPv6 继续直连。
- 在通用公网 IPv6 代理规则之前，匹配 `ip_version = 6` 且命中 `geosite-cn` 或
  `geoip-cn` 的连接，并以 `method = default` 拒绝。
- 设置 `no_drop = true`，始终向 TCP 返回 RST、向 UDP 返回 ICMP port unreachable，
  促使具备 IPv4 地址的应用快速回退，而不是等待静默丢包超时。
- 其他公网 IPv6 仍经代理；其他平台不受影响。

## 后果

- 国内应用尽量保持单一的国内 IPv4 直连出口。
- 已缓存或直接使用中国 IPv6 的应用也能触发快速失败与 IPv4 回退。
- 不具备 IPv4 回退能力的中国 IPv6-only 服务将在 iOS 上不可用；需要通过实机测试
  持续评估。
- 远程 `geosite-cn` 与 `geoip-cn` 规则集仍是启动和匹配依赖。

## 验证要求

- 生成配置通过 sing-box 1.14.0 `check`。
- iOS 回归滴滴钱包、微信、抖音、YouTube 和 WebRTC。
- 日志应显示中国 IPv6 命中 `reject`，对应国内服务随后通过 IPv4 direct 建立连接。

## 被否决方案

- 中国 IPv6 继续经境外代理：可能产生双出口和地域不一致。
- 中国 IPv6 direct：已在目标 iOS 网络环境复现无可用路由。
- 拒绝全部公网 IPv6：会不必要地影响境外 IPv6 目标。
