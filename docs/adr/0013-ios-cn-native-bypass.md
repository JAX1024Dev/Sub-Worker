# ADR-0013：iOS 中国 IP 使用 TUN 原生旁路

- 状态：已被 ADR-0014 取代
- 日期：2026-09-14

## 背景

ADR-0012 为 iOS 启用 `route.auto_detect_interface`，并让中国 IPv6 进入 direct。
实机日志确认接口选择生效，出站被绑定到 Wi-Fi `en0`，但抖音的中国 IPv6 TCP 和
QUIC 连接仍立即返回 `no route to host`。自动接口选择只能决定使用哪个接口，不能
修复 iOS Packet Tunnel 的 direct IPv6 路由。

恢复全部公网 IPv6 经境外代理可以恢复抖音，却会让滴滴钱包同时使用国内直连 IPv4
与境外代理 IPv6，可能触发会话一致性或支付风控。

## 决策

- iOS TUN 设置 `route_exclude_address_set = ["geoip-cn"]`。
- 中国 IPv4/IPv6 在进入 sing-box TUN 前由 iOS 系统原生网络发送。
- 恢复 iOS TUN 内的公网 IPv6 → proxy 保护规则。
- 保留 `route.auto_detect_interface`、DNS AAAA 拒绝、`ipv4_only` 和 VLESS XUDP。
- 不按应用、动态端口或当前观测到的临时 IP 地址维护例外。

## 后果

- 抖音和滴滴的中国 IPv4/IPv6 不再经过有问题的 direct outbound，也不会被拆分到
  国内直连与境外代理出口。
- 非中国公网 IPv6 仍经代理，不依赖 iOS direct IPv6。
- iOS 上命中 `geoip-cn` 的连接不再出现在 sing-box 连接日志中。
- IP 层旁路先于域名路由；国外域名若连接中国 CDN IP，也会在 iOS 上原生旁路。这是
  为移动端可用性接受的平台差异。
- iOS 启动继续依赖固定版本的 `geoip-cn` 远程规则集。

## 验证要求

- iOS 配置包含 `route_exclude_address_set = ["geoip-cn"]` 和公网 IPv6 代理规则。
- 配置通过 sing-box 1.14.0 `check`。
- 在 IPv6 Wi-Fi 下，抖音和滴滴中国 IPv6 不再产生 direct `no route to host`。
- 回归滴滴钱包、抖音、微信、YouTube 和 WebRTC。

## 被否决方案

- 继续中国 IPv6 direct：实机确认即使绑定 `en0` 仍无路由。
- 拒绝中国 IPv6：抖音不会可靠回退 IPv4。
- 全部中国 IPv6 经境外代理：会造成滴滴钱包会话双出口。
