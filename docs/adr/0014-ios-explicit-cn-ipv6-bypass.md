# ADR-0014：iOS 使用显式中国 IPv6 原生旁路

- 状态：已被 ADR-0015 取代，保留为回退方案
- 日期：2026-09-14

## 背景

ADR-0013 使用 `route_exclude_address_set = ["geoip-cn"]` 尝试在 iOS TUN 接管前旁路
中国 IP。IPv6 Wi-Fi 实机日志显示该字段没有生效：滴滴的中国 IPv4 在 TUN 内走
direct，而 `2402:4e00:*`、`2402:840:*` 和 `2409:8c54:*` 等中国 IPv6
仍进入 TUN 并由 I1 送往 USA，钱包会话继续形成双出口。

使用 sing-box 1.14.0 对项目固定的 `geoip-cn.srs` 执行匹配，确认上述 IPv6 均存在于
规则集中。该行为与 sing-box 上游 issue #3191 报告一致：iOS 图形客户端中
`route_exclude_address_set` 未生效，而显式 `route_exclude_address` 可用。

## 决策

- 从固定版本 `geoip-cn.srs` 生成全部中国 IPv6 CIDR。
- iOS TUN 使用显式 `route_exclude_address`；不再生成 `route_exclude_address_set`。
- 中国 IPv6 在进入 TUN 前由系统原生网络发送；中国 IPv4 保持 TUN 内 direct。
- 保留 I1，使仍进入 TUN 的非中国公网 IPv6 经 proxy。
- 提供确定性的生成和一致性检查命令，规则集 revision 或校验和变化时必须重新生成。
- 不按滴滴域名、动态端口或临时服务 IP 维护例外。

## 后果

- 滴滴的 IPv4 与 IPv6 均使用国内网络出口，避免钱包会话被拆分到国内和美国。
- 抖音等使用中国 IPv6 的应用获得相同的原生旁路行为。
- iOS 配置体积和系统路由数量增加；仅嵌入 IPv6 CIDR，以降低该成本。
- 非中国 IPv6 继续经代理，保持当前国外服务行为。
- 固定规则集升级需运行 `pnpm rules:generate:ios-routes` 并提交生成结果。

## 验证要求

- `pnpm rules:check:ios-routes` 验证生成内容与固定规则集完全一致。
- iOS 配置包含显式中国 IPv6 CIDR，且不包含 `route_exclude_address_set`。
- 配置通过 sing-box 1.14.0 `check`。
- 在 IPv6 Wi-Fi 下回归滴滴钱包、抖音、微信、YouTube 和 WebRTC。

## 实机验证结果

2026-09-14 使用官方 sing-box iOS 客户端和 IPv6 Wi-Fi 验证通过：YouTube、微信、
抖音、滴滴主应用及滴滴钱包可同时正常访问。该结果确认问题并非节点 UDP 能力或滴滴
固定端口，而是原方案没有在 iOS 上应用规则集生成的系统排除路由，导致同一滴滴会话
的中国 IPv4 直连、中国 IPv6 经 USA 代理。显式中国 IPv6 CIDR 旁路消除了该双出口，
同时保留非中国 IPv6 的代理保护。

## 参考

- [sing-box issue #3191](https://github.com/SagerNet/sing-box/issues/3191)
- [sing-box Apple 客户端功能](https://github.com/SagerNet/sing-box/blob/testing/docs/clients/apple/features.md)
