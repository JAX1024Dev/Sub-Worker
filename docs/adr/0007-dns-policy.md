# ADR-0007：采用分流加密 DNS

- 状态：已接受
- 日期：2026-09-08
- 修订：2026-09-13

## 背景

项目需要在保证国外域名解析稳定性的同时兼顾中国大陆访问延迟。代理节点使用域名时，还需要一个不依赖代理的 bootstrap 解析路径。

## 决策

- 中国域名使用直连 AliDNS DoH。
- 其他域名使用经 proxy selector 连接的 Cloudflare DoH。
- 域名形式的代理服务器使用 AliDNS DoH bootstrap。
- 普通查询不配置系统或明文 DNS fallback。
- 保留进程内 DNS 缓存，不持久化 DNS 缓存，不启用 optimistic cache。
- iOS 使用 `ipv4_only` 并拒绝 AAAA 查询，避免官方图形客户端的 Packet Tunnel
  将国内 IPv6 交给无可用 IPv6 路由的 direct 出站；其他平台保持 `prefer_ipv4`。
- iOS 路由中的 `resolve` action 同样使用 `ipv4_only`，防止未分类域名绕过该平台策略。
- 完整生成规格以 [DNS.md](../DNS.md) 为准。

## 后果

- 国内解析延迟较低，其他域名的解析与代理出口保持一致。
- 境外 DoH 或代理不可用时，国外域名解析失败而不会静默改变 resolver。
- AliDNS 和 Cloudflare 成为外部运行依赖。
- iOS 普通 DNS 查询不再向应用提供 IPv6 地址；应用直接访问 IPv6 字面量仍不在该策略
  的处理范围。需要恢复原生 IPv6 时，必须先验证 Packet Tunnel 的 direct IPv6 出口，
  并重新评估“IPv6 经代理”方案。
- 更换 provider 或 fallback 语义需要更新本 ADR。

## 被否决方案

- 所有查询使用国内 resolver：国外域名解析可能不稳定。
- 所有查询经代理：代理未建立时无法完成节点域名 bootstrap。
- 使用系统 DNS fallback：行为依赖平台且不可预测。
- MVP 使用 FakeIP：增加平台差异和测试范围。
