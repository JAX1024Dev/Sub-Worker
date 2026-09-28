# ADR-0022：客户端本地 Tailscale endpoint

- 状态：已接受
- 日期：2026-09-28

## 背景

订阅客户端需要在保留现有 VLESS 代理、国内直连和服务策略的同时访问 tailnet peer，以及经
批准的 subnet route。项目是无状态订阅转换服务，不适合持有或分发 Tailscale 设备身份。
sing-box 1.14.0 已原生支持 Tailscale endpoint、MagicDNS server 和 `preferred_by` 路由。

## 决策

- 所有平台配置包含 tag 为 `tailscale` 的 Tailscale endpoint，使用客户端本地持久状态并
  开启 `accept_routes`。
- bundle 不包含 `auth_key`；用户通过 sing-box 客户端交互登录，Tailscale 自动分配设备 IP。
- `dns-tailscale` 只处理 MagicDNS、tailnet split DNS 和搜索域，不接管普通公网 DNS。
- 路由以 `preferred_by = tailscale` 匹配 peer IP、MagicDNS 名称和批准的 subnet route，
  优先级高于 `sniff`、服务规则和通用私网直连。
- 客户端不发布 subnet route、不充当 exit node，也不开启 Tailscale SSH 或 Taildrop。
- Worker 运行时继续接受不含 endpoints 的旧 schema 1 bundle，以支持分阶段发布；新源配置
  构建必须包含 endpoint。

## 后果

- Tailscale 登录、设备 IP、ACL/grant 与 subnet route 审批由 tailnet 管理，不进入 Worker。
- 订阅刷新和 Worker 部署不会重置 Tailscale 身份，但客户端状态目录被清除后需要重新登录。
- Tailscale 不可用时 tailnet 目标和 MagicDNS 失败；公网 DNS 与现有代理路径保持原语义。
- 五个平台需要验证首次登录、重启、订阅刷新、网络切换、MagicDNS 和 subnet route。

## 被否决方案

- 在公开 bundle 中分发 auth key：会把 tailnet 加入权限暴露给所有订阅获取者和 GitHub。
- 硬编码 `100.64.0.0/10` 路由：无法表达 MagicDNS 和动态批准的 subnet route，并可能误接管
  其他使用 CGNAT 地址的网络。
- 运行独立 Tailscale 客户端再把全部 `100.64.0.0/10` 直连：五平台 VPN/TUN 共存行为不一致，
  无法由本项目统一验证。
