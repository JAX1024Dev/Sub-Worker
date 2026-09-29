# ADR 0023：Apple 策略组默认直连

状态：待 staging 验证（2026-09-29）。更新 ADR 0020 中 Apple 默认跟随全局的决策；其余服务策略不变。

## 决策

五个平台的 Apple selector 默认 `direct`，可选项依次为 `direct`、全局节点选择和实时节点。Apple 规则集仍优先于中国通用规则。客户端已经保存的 Apple selector 选择由本地 `cache_file` 保留，配置默认值只作用于没有本地选择的客户端。

## 影响与验证

Apple DNS 规则仍使用经全局节点选择 detour 的 `dns-global`；选择直连不会联动 DNS 出口。先构建并验证五平台 bundle，发布 staging manifest 后检查线上生成配置和客户端实际连通性，再考虑 production 晋级。
