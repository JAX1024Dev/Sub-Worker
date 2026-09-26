# ADR 0021：简化节点选择与 Kraken 路由

状态：已发布 staging 与 production（2026-09-26）；Kraken 可选项收紧 bundle 为
`852233cac5d9781781b7194f53dd7e0fb9692442`。

## 决策

- 新 bundle 不生成 `auto` 测速组或独立 `uk` 地区组。全局 selector 默认第一个订阅节点。
- Kraken/Krak selector 直接列出英国标签节点，默认第一个；没有英国节点时默认 `block`，不回退其他地区。可选项仅为英国节点、全局 `🚀 节点选择` 和 `block`，不单独列出非英国节点或 `direct`。
- Kraken 路由只匹配 `kraken.com`、`krak.app`、`kraken.zendesk.com` 及其子域名。不用包含 `krak` 的任意域名关键词规则，避免误伤。
- GitHub 规则排在 Microsoft 前，处理上游规则集的域名重叠。
- 唯一节点名不再带摘要后缀；重名或保留 tag 冲突时才追加稳定摘要。

## 兼容与代价

Worker 仍接受旧 bundle 的 `auto`、`uk` 声明，以允许先部署兼容 Worker、再晋级新 bundle。
节点 tag 变化会使部分已有 `cache_file` 选择需要在客户端重新选一次。英国身份仅由上游节点名称判断，需实机核验出口 IP。配置变更先在 staging 验证，再更新 production manifest。

## 发布验证

Bundle 提交为 `34ceb50a5483d8bee7681eea73aeaa5c247cdef9`。staging Worker 版本为
`5145dc93-28ad-4f8a-a74b-301677ff0866`，production Worker 版本为
`e5426657-bc1a-40ed-9630-7460732f536b`。`pnpm check`、远程规则集校验和五平台
staging HTTP 结构检查均通过；后者不替代 iOS/macOS 实机连通性测试。
Kraken 选项收紧后，五平台 staging HTTP 响应均验证仅包含两个英国节点、全局节点选择
和 block；production 使用同一 bundle，仍须实机核验英国出口 IP。
