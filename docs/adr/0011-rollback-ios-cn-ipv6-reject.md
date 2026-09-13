# ADR-0011：撤销 iOS 中国 IPv6 快速拒绝

- 状态：已被 ADR-0013 取代
- 日期：2026-09-14

## 背景

ADR-0010 假设应用收到 TCP RST 或 ICMP unreachable 后会回退到 IPv4。iOS 实机日志
否定了该假设：新规则在约 10 秒内拒绝数百个抖音 IPv6 TLS 与 QUIC 连接，应用持续
重试 IPv6 而没有回退，导致抖音不可用；滴滴钱包同样异常。微信与 YouTube 仍正常，
说明节点、DNS 和基础代理链路没有整体故障。

## 决策

- 撤销 `ip_version = 6` 且命中中国规则集时的 `reject` 规则。
- 恢复 ADR-0008 的行为：iOS 私网 IPv6 直连，其余公网 IPv6 全部经 proxy。
- 保留 DNS AAAA 拒绝、`ipv4_only` 和 VLESS XUDP。
- 滴滴钱包问题作为独立问题继续诊断，不再假设应用必然支持 IPv4 回退。

## 后果

- 恢复抖音等依赖或强烈偏好 IPv6 的国内应用。
- 国内 IPv6 仍可能经境外代理，与国内 IPv4 形成不同出口；这是恢复可用性的已知代价。
- 后续如需中国 IPv6 直连，必须先解决 iOS Packet Tunnel direct 出站无 IPv6 路由问题，
  并完成实机回归测试。

## 验证要求

- 生成配置不包含中国 IPv6 `reject` 规则。
- iOS 公网 IPv6 仍命中 proxy。
- 回归抖音、微信、YouTube、WebRTC 与滴滴钱包。
