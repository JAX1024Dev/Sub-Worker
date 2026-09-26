# ADR 0020：独立可切换服务策略组

状态：已发布 production（2026-09-23）；维护者明确授权跳过 staging 实机验证。取代 ADR 0019 的固定服务出口决策；0019 保留为历史记录。

## 背景

ADR 0019 将多个服务固定到普通代理，Microsoft 海外域名也走代理，无法满足用户在 App 内针对每类服务选节点的要求。

## 决策

- bundle 的 `service_selectors` 声明稳定 tag、默认项和可选项；Worker 为每组展开实时节点。全局 `🚀 节点选择` 包含自动测速与全部节点，`route.final` 指向该组。
- Apple、AI、YouTube、媒体、Google、Telegram 等默认跟随全局；Microsoft 默认 direct；广告默认 block；Kraken/Krak 默认 UK 地区组，无 UK 节点则 block。服务规则优先于中国通用规则。
- 启用 sing-box `experimental.cache_file`，以 Subscription ID/平台的 SHA-256 摘要派生 `cache_id`；客户端本地保存 selector 选择与远程规则集，Worker 不保存选择或订阅。
- 服务集选用 DustinWin 固定提交；Apple/Microsoft/Google/Telegram/GitHub 选用 MetaCubeX 固定提交；中国基础集沿用已验证的 SagerNet 提交。每日检查 DustinWin 新提交，生成待审 PR；不自动晋级生产。
- 节点 tag 采用名称与节点身份稳定摘要，避免订阅顺序变化打断选择。节点改名或凭据变化会重置对应节点选择。

## 取舍与验证

更多远程规则集增加首次启动耗时与内存；广告误判或服务分类交叠可能影响访问，规则顺序和分组可通过 GitHub 配置片段审查。`cache_file` 属客户端本地状态；Windows/Linux core 若需交互，须自行配置受保护的本地 API/UI。发布前五平台通过 `sing-box 1.14.0 check`，发布后五平台 production 订阅均返回预期策略组和默认值；这不等于实机验证。仍须在 iOS/macOS 验证选择持久化、DNS、双栈、常用 App 与英国出口 IP。异常时回退 production manifest 与 Worker 版本；部署细节见 [RELEASE.md](../RELEASE.md)。
