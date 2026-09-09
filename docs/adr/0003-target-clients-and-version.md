# ADR-0003：固定目标客户端和 sing-box 1.14.0

- 状态：已接受
- 日期：2026-09-08

## 背景

sing-box 的 DNS、路由和 TUN schema 在多个版本间发生迁移。操作系统名称也不足以代表客户端行为，图形客户端可能注入平台配置，而 core 需要直接承担系统集成。

## 决策

MVP 固定目标版本为最新稳定版 sing-box 1.14.0，不跟随预发布版本或 `latest` 浮动标签。

平台目标：

- iOS、macOS、Android：官方 sing-box 图形客户端。
- Windows、Linux：sing-box core。

每个平台有独立 Overlay 和 golden fixture。生成配置必须由 sing-box 1.14.0 `check` 验证。

## 后果

- 可以使用 1.14.0 的当前 schema，而无需生成大量兼容分支。
- 用户使用其他版本或第三方 GUI 时不保证兼容。
- 升级目标版本需要新增 ADR、迁移审查和五个平台回归测试。

## 被否决方案

- 永远输出“通用 sing-box JSON”：不存在稳定的跨版本完整 schema。
- 根据 User-Agent 猜测版本：标识不可靠，且增加隐式行为。
- 立即支持多个 core 版本：超出 MVP 范围并显著增加测试矩阵。

## 参考

- [sing-box 官方 Releases](https://github.com/SagerNet/sing-box/releases)
- [sing-box 版本迁移说明](https://sing-box.sagernet.org/migration/)
