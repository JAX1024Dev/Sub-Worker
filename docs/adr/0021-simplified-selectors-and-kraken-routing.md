# ADR 0021：简化节点选择与 Kraken 路由

状态：已实现，待 staging 验证与发布。

## 决策

- 新 bundle 不生成 `auto` 测速组或独立 `uk` 地区组。全局 selector 默认第一个订阅节点。
- Kraken/Krak selector 直接列出英国标签节点，默认第一个；没有英国节点时默认 `block`，不回退其他地区。用户仍能手动选择其他节点、全局组、直连或 block。
- Kraken 路由只匹配 `kraken.com`、`krak.app`、`kraken.zendesk.com` 及其子域名。不用包含 `krak` 的任意域名关键词规则，避免误伤。
- GitHub 规则排在 Microsoft 前，处理上游规则集的域名重叠。
- 唯一节点名不再带摘要后缀；重名或保留 tag 冲突时才追加稳定摘要。

## 兼容与代价

Worker 仍接受旧 bundle 的 `auto`、`uk` 声明，以允许先部署兼容 Worker、再晋级新 bundle。
节点 tag 变化会使部分已有 `cache_file` 选择需要在客户端重新选一次。英国身份仅由上游节点名称判断，需实机核验出口 IP。配置变更先在 staging 验证，再更新 production manifest。
