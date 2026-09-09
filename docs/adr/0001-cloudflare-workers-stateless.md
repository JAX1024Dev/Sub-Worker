# ADR-0001：采用 Cloudflare Workers 无状态架构

- 状态：已接受
- 日期：2026-09-08

## 背景

服务只需接收订阅请求、访问一个 3x-ui HTTPS 订阅端点并转换小型文本配置。MVP 不需要用户数据库、任务队列或持久化内容。

## 决策

使用 TypeScript ES Modules Cloudflare Worker 实现单一无状态服务。MVP 不引入 KV、D1、R2、Durable Objects 或独立源站。

每个请求完整执行一次获取、解析、转换和响应流程。Base URL 通过 Worker Secret 提供。

## 后果

优点：

- 部署简单，全球入口可用。
- 无数据库迁移和状态一致性问题。
- 不保存敏感订阅内容。
- 后续仍可通过 bindings 引入必要的 Cloudflare 服务。

代价：

- 每次请求都依赖 3x-ui 可用性和响应时间。
- 暂时无法跨请求复用转换结果。
- 必须严格限制上游响应大小和请求频率。

## 被否决方案

- Pages + 独立 API：没有静态前端需求，增加部署面。
- 独立 VPS 服务：引入持续运维，与既定 Cloudflare 部署目标冲突。
- MVP 使用 KV 缓存：可能返回过期或跨用户泄露的订阅，且用户已明确不要缓存。
