# ADR-0012：iOS direct 出站启用自动接口选择

- 状态：已被 ADR-0013 取代
- 日期：2026-09-14

## 背景

ADR-0011 恢复了 iOS 公网 IPv6 全部经代理的策略。实机日志随后确认，滴滴会同时连接
国内 IPv4 与 IPv6 网关：IPv4 命中 `geoip-cn` 后 direct，IPv6 则经境外 proxy。
两类连接均传输成功，但同一钱包会话出现不同出口地域，可能触发支付服务的会话一致性
或风险控制。网关端口会变化，不能依赖端口分流。

此前中国 IPv6 direct 出现 `no route to host` 时，iOS 配置没有启用
`route.auto_detect_interface`。sing-box 1.14.0 源码将 iOS 纳入 Darwin 平台，并由
Apple 图形客户端的 NetworkExtension 平台接口选择真实网络。

## 决策

- iOS 生成 `route.auto_detect_interface = true`。
- 删除 iOS“全部公网 IPv6 → proxy”规则，不再让地址族覆盖地域规则。
- 中国域名和中国 IPv4/IPv6 继续按 `geosite-cn`、`geoip-cn` 走 direct；其他流量由
  `route.final = proxy` 处理。
- 保留 iOS DNS AAAA 拒绝和 `ipv4_only`，避免同时扩大普通 DNS 的行为变化。
- 不按滴滴动态端口或当前观测到的临时 IP 地址硬编码规则。

## 后果

- 国内服务的 IPv4、IPv6 使用设备本地网络出口，避免同一会话被拆分到国内直连与
  境外代理。
- iOS direct 和 proxy 的套接字都通过平台网络接口选择，降低 Packet Tunnel 回环和
  无路由风险。
- 未经 DNS 获得的非中国 IPv6 仍按 final 规则走 proxy。
- 该策略依赖 Apple 官方客户端对 sing-box 1.14.0 平台接口的实现，需要实机验证。

## 验证要求

- iOS 配置包含 `route.auto_detect_interface = true`，且不包含全局 `ip_version = 6`
  代理规则。
- 在 IPv6 Wi-Fi 下，滴滴中国 IPv6 网关命中 direct，且无 `no route to host`。
- 回归滴滴钱包、抖音、微信、YouTube 和 WebRTC。

## 被否决方案

- 按端口分流：滴滴网关端口已确认会变化。
- 固定滴滴 IP/CIDR：服务地址可能变化，且可能误匹配共享云地址。
- 将滴滴 IPv4 也送往 USA：虽然可统一出口，但可能因境外出口触发更严格的支付风控。
