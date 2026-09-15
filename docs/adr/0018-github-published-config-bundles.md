# ADR-0018：使用 GitHub 发布的不可变配置包

- 状态：已接受，实施中
- 日期：2026-09-15

## 背景

当前 TUN、DNS、路由和平台选项由 TypeScript 生成器硬编码。每次调整客户端配置都要修改
代码、重新构建并部署 Worker，配置内容也不够直观。计划将静态 sing-box 配置移到 GitHub，
Worker 保留节点转换和最终组合。

直接在运行时获取多个 `main` 分支文件会产生跨提交混用、请求扇出和非原子发布；错误提交
还会立即影响全部订阅。GitHub 因此成为新的生产配置控制面和信任边界。

## 决策

- 人工维护的 common、DNS、platform、route 和 outbound policy 片段放在 `example/`。
- 片段使用项目自有严格 schema，并为字段指定唯一 owner；不使用通用 deep merge。
- CI 为每个平台生成一个 bundle，以脱敏节点组装完整配置并通过 sing-box 1.14.0 检查。
- staging/production manifest 只引用带完整 commit SHA 的不可变 bundle，并记录 SHA-256。
- Worker 只配置受控 manifest URL，每次请求获取 manifest 和一个 bundle。
- 节点与最终订阅不缓存；首期不增加 KV、R2、D1 或 Durable Objects。
- manifest/bundle 无效或不可用时失败关闭，不静默使用代码内默认配置。
- production manifest 通过分支保护、必需 CI 和受保护发布环境变更。

## 后果

- 日常配置调整和回滚不再部署 Worker，且配置文件可直接审查。
- 请求新增两次公共 HTTPS 获取，延迟和可用性依赖 GitHub/CDN。
- 配置发布必须维护 schema、bundle 生成和 channel promotion 工具。
- GitHub 写权限能够影响客户端网络行为，仓库权限和发布审批成为安全关键控制。
- 修改组合协议、schema 或节点 renderer 仍属于代码变更，必须部署 Worker；“无需部署”只
  适用于兼容 schema 内的静态配置变化。

## 被否决方案

- Worker 分别读取多个浮动 raw 文件：不能保证原子性，并扩大请求扇出。
- 将完整静态配置继续硬编码在 TypeScript：无法解决主要维护成本。
- 允许请求参数指定任意 GitHub URL 或分支：形成 SSRF、配置注入和供应链风险。
- 首期使用 KV 保存 last-known-good：增加状态、发布路径和回滚语义，推迟到有数据证明需要。

## 详细规格

见 [CONFIGURATION.md](../CONFIGURATION.md)。
