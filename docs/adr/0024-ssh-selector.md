# ADR 0024：SSH 协议独立策略组

状态：staging 已发布，待客户端连通性验证（2026-10-01）。

## 决策

为 sing-box 嗅探出的 TCP `ssh` 协议增加 `🔐 SSH` selector。默认 `direct`，可选全局节点选择和具体实时节点。路由规则置于 DNS 劫持之后、服务域名与中国通用规则之前；Tailscale 的 `preferred_by` 规则保持最高优先级。不按端口 22 分流，避免将其他协议误判为 SSH，也支持非标准端口的 SSH。

## 边界与发布

嗅探失败或超时的连接由后续规则处理；SSH 组只决定连接出口，不联动 DNS。远程 bundle 需要新增严格限定的 `protocol: ssh` 路由规则类型，因此先部署接受新旧 bundle 的 Worker，再发布 staging bundle。五平台配置必须通过 sing-box 1.14.0 检查，并在 staging 验证生成配置；真实 SSH 连通性另需客户端测试。
