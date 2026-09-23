# ADR 0019：服务分类与英国节点组

状态：历史决策；固定服务出口已被 [ADR 0020](./0020-selectable-service-policies.md) 取代。本文记录此前上线方案。

## 背景

国内直连/国外代理的二分法无法表达 Apple、Microsoft 等服务的精细策略；Kraken/Krak
需要默认经英国节点。静态规则位于 GitHub 配置包，实时订阅节点仍由 Worker 组装。

## 决策

- 仅挑选所需的 MetaCubeX sing-box `.srs` 分类，固定完整 Git 提交；保留现有中国域名/IP
  基座。Apple/Microsoft 中国规则先直连，其余选定境外服务经普通代理。
- DustinWin 的分类和 blackmatrix7 的细粒度目录是后续扩展候选；首版不混合多个新规则源，
  也不引用浮动 release/branch URL，以降低供应链变更和首次启动开销。
- Kraken/Krak 仅匹配明确域名后缀 `kraken.com`、`krak.app`，优先级高于通用规则。
- bundle 声明 `uk` 地区 selector；Worker 用保守的节点名称标记筛选英国节点。无匹配
  时 selector 指向 `block`，禁止静默回退到 `proxy`。
- 不从请求参数选择任意规则 URL，不运行在线地理定位探测，也不自动导入全部第三方规则。

## 后果与验证

节点名与真实出口可能不一致，因此管理员必须验证英国出口 IP；应用使用的第三方域名需按
日志补齐。增加远程规则集会影响首次启动时间和内存。五平台配置必须先通过自动检查；
本次按维护者明确授权直接上线 production，实机连通性与英国出口 IP 仍需发布后验证。
生产 channel 不随代码变更自动更新。
