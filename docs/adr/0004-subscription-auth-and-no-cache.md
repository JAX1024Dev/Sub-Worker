# ADR-0004：Subscription ID 作为 bearer secret，MVP 不缓存

- 状态：已接受
- 日期：2026-09-08

## 背景

需求要求下游 Subscription ID 与 3x-ui Subscription ID 完全一致。项目不维护额外用户数据库。订阅包含 UUID 和连接参数，属于敏感内容。

## 决策

- Subscription ID 本身作为 bearer secret。
- Worker 通过实时访问 3x-ui 判断 ID 是否存在和可用。
- 不签发额外 token，不保存 ID 映射。
- 不缓存成功结果、失败结果或上游正文。
- 所有响应使用 `Cache-Control: private, no-store`。
- 日志不记录完整 ID 或完整请求路径。

## 后果

- 与现有 3x-ui 链接兼容，运维简单。
- URL 泄露等同订阅权限泄露，必须依赖 HTTPS、限速、日志脱敏和 3x-ui 端轮换。
- 每个请求都会访问上游，延迟和可用性受 3x-ui 影响。
- 未来引入代理 token 或缓存属于安全模型变化，必须新增 ADR。

## 被否决方案

- 第二个签名 token：更安全但需要签发、映射、轮换或额外用户操作，不符合 MVP。
- 公共 CDN 缓存：容易产生敏感内容泄露和撤销延迟。
- KV 保存转换结果：用户已明确禁止缓存，同时增加数据生命周期问题。
