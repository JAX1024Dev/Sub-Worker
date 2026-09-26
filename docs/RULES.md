# sing-box 路由与服务策略规格

本文件是 sing-box 1.14.0 路由片段（`example/sing-box/rules/`）的规范。DNS 详见 [DNS.md](./DNS.md)，发布流程详见 [CONFIGURATION.md](./CONFIGURATION.md)。

## 目标与策略组

中国域名/IP 直连；未匹配国内规则的流量由 `route.final = "🚀 节点选择"` 代理。全局组直接列出节点，默认第一个节点，不创建 `auto` 测速组。每个热门服务使用独立 `selector`，可在支持 selector 的客户端界面选择全局组、具体节点或直连。选择由 sing-box `experimental.cache_file` 在本地保存，不存储在 Worker；`cache_id` 按订阅 ID 和平台派生。普通唯一节点使用原名称作为 tag；仅重名或与保留 tag 冲突时追加节点身份摘要。节点改名、凭据变化或从重名变成唯一名称可能改变 tag，使该节点的本地选择失效。

| 组                                               | 默认                 | 规则集                                              |
| ------------------------------------------------ | -------------------- | --------------------------------------------------- |
| 🤖 AI                                            | 🚀 节点选择          | DustinWin `ai`                                      |
| ▶️ YouTube                                       | 🚀 节点选择          | DustinWin `youtube`                                 |
| 🎬 流媒体                                        | 🚀 节点选择          | DustinWin `media`                                   |
| 🔍 谷歌                                          | 🚀 节点选择          | MetaCubeX `google`                                  |
| ✈️ Telegram                                      | 🚀 节点选择          | MetaCubeX `telegram`                                |
| 🍎 苹果                                          | 🚀 节点选择          | MetaCubeX `apple`                                   |
| Ⓜ️ 微软                                          | direct               | MetaCubeX `microsoft`、`microsoft@cn`               |
| 🛑 广告拦截                                      | block                | DustinWin `ads`                                     |
| 🎥 Netflix / 📽️ Disney+ / 🎵 Spotify / 🎵 TikTok | 🚀 节点选择          | DustinWin 对应分类                                  |
| 💻 GitHub                                        | 🚀 节点选择          | MetaCubeX `github`                                  |
| 💷 Kraken/Krak                                   | 英国节点；无则 block | `kraken.com`、`krak.app`、`kraken.zendesk.com` 后缀 |

不再暴露单独的 `uk` 组。Kraken/Krak 组直接列出标签明确标识英国的节点，默认第一个匹配节点；没有英国节点时默认 `block`，不得静默使用其他地区。标签不保证真实出口地理位置。该组仅允许改选英国节点、全局 `🚀 节点选择` 或 `block`；不单独提供非英国节点或 `direct`。仅匹配明确域名及子域名，不用 `domain_keyword` 匹配任意含 `krak`/`kraken` 的域名，以免误分流无关站点。广告组允许用户关闭拦截，不能只用固定 block outbound。

## 规则优先级

1. `sniff` 和 `hijack-dns`。
2. 广告集；Kraken/Krak 域名。
3. AI、YouTube、Netflix、Disney+、Spotify、TikTok、通用流媒体。细分类必须先于通用分类。
4. Telegram、Apple、GitHub、Microsoft（含 `microsoft@cn`）、Google。GitHub 先于 Microsoft，解决上游两个规则集重叠时 GitHub 误入默认直连的微软组。服务规则必须先于中国通用规则。
5. `geosite-cn → direct`。
6. `resolve`；macOS IPv4 兼容片段使用 `ipv4_only`。解析后的私网 IP 和 `geoip-cn` 直连。
7. 余下所有流量进入 `🚀 节点选择`。

不再引入 `geosite-non-cn`：海外兜底直接由 `final` 决定。iOS 双栈与 macOS IPv4 兼容的 TUN/地址族差异由各自平台和 DNS 片段保留，不因服务策略组改变。避免按临时 App 端口/IP 添加规则。

## 规则集来源与更新

服务类使用 DustinWin `ruleset_geodata` 的 `sing-box-ruleset` 提交 `88d9447f48fe73c83af9d7817148975e01ea25a4`；Google/Telegram/Apple/Microsoft/GitHub 使用 MetaCubeX `meta-rules-dat` 提交 `d1363ad015e8bb0fdcb0eb08be518e161354c695`。国内域名/IP 沿用已验证的 SagerNet 固定提交。全部使用 pinned HTTPS `.srs` URL 和 `rules-via-proxy` HTTP client；不在 Worker 请求时访问浮动分支。

`update-service-rulesets.yml` 每日检查 DustinWin 最新提交及所需 SRS 文件，变动时更新 pin 和发布 bundle 并提出待审 PR；仓库已启用 Actions 创建 PR 权限。合并前运行 schema、单元测试、五平台 `sing-box check`，审查规则变化；production manifest 仍需单独晋级。MetaCubeX 和 SagerNet pin 手动评估更新。客户端的 `cache_file` 缓存远程规则集与 selector 状态；Worker 仍不缓存用户订阅。若远程规则集首次加载失败，客户端可能无法启动，应保留已验证的旧配置并在 staging 先验证。

Windows/Linux 使用 sing-box core 时没有本项目提供的图形界面；要切换 selector 需另配本机受保护的 sing-box 管理界面/API，不要把控制 API 暴露到公网。
