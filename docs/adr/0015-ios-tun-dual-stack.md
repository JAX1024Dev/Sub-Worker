# ADR-0015：iOS 使用 TUN 双栈路由

- 状态：已接受
- 日期：2026-09-14

## 背景

ADR-0014 通过显式排除中国 IPv6，解决了 iOS Packet Tunnel 内 direct IPv6 返回
`no route to host` 及同一业务双出口的问题。该方案已在 production 实机验证，但中国
IPv6 不进入 TUN，无法与 IPv4 使用完全相同的规则链。

## 决策

- 新增部署变量 `IOS_ROUTING_MODE`，仅允许精确值 `tun-dual-stack` 启用实验；其他值均
  回退到 production 的 `native-bypass` 安全基线。
- staging 与 production 使用 `tun-dual-stack`；`native-bypass` 保留为快速回退模式。
- 双栈模式不生成 iOS `route_exclude_address`，保留 AAAA，并让域名解析使用
  `prefer_ipv4`。
- 双栈模式不提前把全部公网 IPv6 送往 proxy。中国域名/IP（IPv4 与 IPv6）按既有
  `geosite-cn`/`geoip-cn` 规则进入 direct，其余流量进入 proxy。
- direct outbound 设置 Apple 客户端支持的 `network_strategy: hybrid`，配合
  `route.auto_detect_interface` 试验 Packet Tunnel 内的 IPv6 外部接口拨号。

## 风险与回退

`hybrid` 可能并发尝试 Wi-Fi 与蜂窝网络，增加蜂窝数据使用；网络切换时也可能改变
实际出口。若出现业务双出口、耗电、流量或可达性回归，可将对应环境变量改回
`native-bypass`，恢复 ADR-0014 的显式中国 IPv6 旁路。

## 验证结果

2026-09-14，用户确认 staging 配置在官方 iOS 客户端工作正常。IPv6 Wi-Fi 下的中国
IPv4/IPv6 均进入 TUN 并按同一规则链分流，因此批准推广至 production，并由本 ADR
取代 ADR-0014 的 production 默认行为。

## 参考

- [sing-box Dial Fields](https://sing-box.sagernet.org/configuration/shared/dial/)
- [sing-box Route Rule](https://sing-box.sagernet.org/configuration/route/rule/)
