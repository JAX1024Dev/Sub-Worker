# ADR-0009：VLESS UDP 使用 XUDP

- 状态：已接受
- 日期：2026-09-13

## 背景

3x-ui VLESS 分享链接中的 `type=tcp` 描述客户端到代理服务器的 transport。sing-box
VLESS outbound 中的 `network=tcp` 则限制该 outbound 只能代理 TCP。直接复制该字段
会禁用 UDP，使 WebRTC、STUN/TURN 和 QUIC 在路由到 proxy 时失败。

实机日志已经确认 proxy selector 返回 `UDP is not supported by outbound`，且同一节点
在支持 UDP 的客户端中工作正常，因此服务器能力不构成阻塞。

## 决策

- CanonicalNode 继续保存订阅 transport，用于兼容性判断和未来 renderer 扩展。
- sing-box VLESS outbound 不生成 `network=tcp`，从而启用默认的 TCP 与 UDP 网络能力。
- 显式生成 `packet_encoding=xudp`，与 Xray/VLESS UDP 能力对齐。
- 所有目标平台采用相同的 VLESS UDP 输出语义。

## 后果

- WebRTC、STUN/TURN、QUIC 和其他 UDP 流量可以经 VLESS proxy 转发。
- TCP transport 本身保持不变。
- 生成配置仍需通过 sing-box 1.14.0 检查；真实 UDP 连通性由 staging 与客户端实测验证。

## 验证

- staging 与 production 的 iOS、macOS 生成配置均通过 sing-box 1.14.0 检查。
- 2026-09-13 在官方 iOS 与 macOS 客户端完成实机验收，本次 UDP/WebRTC 场景工作正常。

## 被否决方案

- 将 UDP 强制直连：会绕过既有分流并可能泄漏真实网络地址。
- 保留 `network=tcp` 并仅拦截 QUIC：仍无法支持 WebRTC 等 UDP 应用。
- 根据平台单独启用 UDP：该能力属于节点 outbound，而不是平台 Overlay。
