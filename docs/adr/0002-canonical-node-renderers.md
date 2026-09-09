# ADR-0002：使用 CanonicalNode 和 renderer 分层

- 状态：已接受
- 日期：2026-09-08

## 背景

3x-ui 分享链接、sing-box 配置和未来的 Mihomo 配置具有不同数据结构。如果 parser 直接生成 sing-box JSON，新增协议或输出格式会导致组合式重复和强耦合。

## 决策

采用三阶段模型：

```text
Source share link → CanonicalNode → Target renderer
```

- Source Adapter 只负责获取和解码订阅。
- 每种协议 parser 只生成规范化节点。
- Compatibility Filter 决定某个 target/version 是否支持节点。
- Renderer 负责目标格式、版本和平台 Overlay。

## 后果

- 新增 Mihomo 时可以复用获取、解析和校验。
- 新增协议时只需添加 parser 和目标 mapper。
- 中间模型需要谨慎版本化，不能简单复制任一目标产品字段。
- 某些目标专属字段可能需要受控 extension，而不能污染公共字段。

## 被否决方案

- 直接字符串替换分享链接：无法可靠处理 TLS、REALITY 和 transport 语义。
- parser 直接输出 sing-box outbound：未来 Mihomo 会重复全部 parser。
- 使用 3x-ui Xray JSON 作为中间模型：它带有 Xray 专属语义，不是稳定的跨目标领域模型。
