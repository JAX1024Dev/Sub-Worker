# ADR-0017：macOS 双栈路由试验

- 状态：已接受（仅 staging 试验）
- 日期：2026-09-14

## 背景

ADR-0016 解决了 macOS 在 IPv4-only 物理网络上选中不可达 AAAA 的问题，但也让普通域名
不能使用目标站点 IPv6。该决策要求恢复双栈前先验证物理接口 IPv6 可达性或可靠的地址族
回退，不能只把 DNS strategy 改回 `prefer_ipv4`。

第一轮试验仅恢复 AAAA 并为 direct 设置 `network_strategy: hybrid`。实测表明，当应用
已经选择一个 AAAA 地址并以 IPv6 字面量进入 TUN 时，direct 只知道这个 IPv6 目标；若
物理接口没有可用 IPv6，`hybrid` 只能选择接口，不能凭空恢复同域名的 IPv4 候选。因此
仅恢复 AAAA 不是可靠的双栈方案。

## 决策

- 新增非敏感部署变量 `MACOS_ROUTING_MODE`，仅精确值 `fakeip-dual-stack` 启用试验；其他值均
  回退到默认 `ipv4-compatible`。
- staging 设置 `MACOS_ROUTING_MODE = fakeip-dual-stack`；production 固定为
  `ipv4-compatible`，Wrangler 环境变量不互相继承。
- macOS `fakeip-dual-stack` 不生成 D0 AAAA 拒绝，增加同时覆盖 A/AAAA 的
  `dns-fakeip`。应用获得的 FakeIPv4/FakeIPv6 都由默认路由送入 TUN，sing-box 在路由前
  恢复原域名。
- 中国域名恢复后命中 `geosite-cn` → direct；direct 通过 `dns-cn` 重新取得真实 A/AAAA
  候选。非中国域名恢复后命中 `geosite-non-cn` → proxy。
- direct 显式使用 `network_strategy: hybrid`，并与 `route.auto_detect_interface = true`
  组合；域名解析负责地址族候选，network strategy 负责 Apple 物理网络选择。
- 不启用持久化 cache file。若客户端重载后出现 `missing fakeip record`，应先刷新系统
  DNS/重启客户端并记录；确认需要跨重载保持映射前不扩大持久化状态。
- 不新增上游、协议、sing-box 版本或域名例外；iOS TUN 双栈和 macOS 默认策略保持不变。
- 在实机验证通过并记录新的决策前，不得把 macOS `fakeip-dual-stack` 推广到 production。

## 后果

- staging macOS 配置可测试应用从 FakeIPv4/FakeIPv6 进入同一 TUN 后，国内 direct 与
  国外 proxy 是否保持一致，并验证 direct 在物理 IPv6 不可用时回退 IPv4。
- FakeIP 改变客户端可见的 DNS 答案并增加内存映射状态，UDP/QUIC、WebRTC、应用内网页
  和订阅热更新都必须实测。
- 原始 IP 字面量没有域名可恢复，仍不能跨地址族回退；按既有 geoip/final 规则处理。
- 回滚时将 staging 变量改为 `ipv4-compatible` 并重新部署，无需改动订阅解析或节点渲染。

## 验证要求

- 单元测试覆盖默认 macOS IPv4 兼容策略、staging FakeIP 双栈策略、环境变量传递、
  FakeIP 规则顺序和 direct `network_strategy`。
- macOS 双栈 golden fixture 必须通过 sing-box 1.14.0 `check`。
- 部署 staging 后先静态检查配置：`dns-fakeip` 同时配置 IPv4/IPv6 地址池、A/AAAA
  查询先命中 FakeIP、DNS `prefer_ipv4`、R6 无 `ipv4_only`、direct
  `network_strategy: hybrid`、路由顺序不变。
- 官方 macOS 客户端实机测试至少覆盖：IPv4 与 IPv6 外部访问、中国站点、非中国站点、
  IPv6 字面量、TCP、UDP/QUIC 与 WebRTC；记录失败地址族、接口和是否发生 IPv4 回退。
- 测试输出不得包含 Subscription ID、完整请求路径、节点链接或完整生成配置。

## 实机测试结果

2026-09-14 在官方 macOS 客户端导入 staging 配置后，静态策略与 sing-box 1.14.0
`check` 通过。当前 Wi-Fi 的 `en0` 只有链路本地 IPv6 地址，没有全局 IPv6 地址；默认
IPv4 与 IPv6 路由均指向 sing-box TUN。

测试结果：

- 非中国 IPv4 TCP 通过。
- 非中国 IPv6 TCP 通过，说明 proxy 侧 IPv6 可用。
- 中国 IPv4 TCP 通过。
- 系统 UDP/networkQuality 通过。
- 强制 IPv6 访问 `docs.bigmodel.cn`、`www.baidu.com` 与 `www.taobao.com` 均在 TLS
  握手前被重置；这与物理网络缺少可用 IPv6 路由相符。
- 不强制地址族时，上述三个中国站点均选择 IPv4 并访问成功。该结果证明当前网络上
  普通域名访问可用，但不能证明所有应用的 IPv6 失败回退语义。
- WebRTC 尚待在实机浏览器中手动记录。

结论：第一轮“真实 AAAA + hybrid”不能可靠处理物理 IPv6 缺失。后续 staging 改用
FakeIP 双栈方案，必须重新执行以上实机测试；production 继续使用 ADR-0016 的 IPv4
兼容策略，直至测试通过并形成推广决策。

## 参考

- [ADR-0015：iOS 使用 TUN 双栈路由](./0015-ios-tun-dual-stack.md)
- [ADR-0016：macOS 使用 IPv4 DNS 兼容策略](./0016-macos-ipv4-dns-compatibility.md)
- [sing-box Dial Fields](https://sing-box.sagernet.org/configuration/shared/dial/)
- [sing-box FakeIP DNS server](https://sing-box.sagernet.org/configuration/dns/server/fakeip/)
