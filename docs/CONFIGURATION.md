# 远程配置与组合规格

## 1. 目的

本文定义重构后的 sing-box 静态配置来源、发布格式、运行时获取和确定性组合规则。
DNS 行为见 [DNS.md](./DNS.md)，路由语义见 [RULES.md](./RULES.md)。

目标是让 TUN、DNS、路由和平台差异以 JSON 文件清晰呈现。日常配置修改通过 GitHub
发布，不要求重新部署 Cloudflare Worker；Worker 代码只负责安全获取、验证和组合。

## 2. 可行性结论

该方案适合当前项目，但不能让 Worker 直接拼接多个浮动分支上的原始文件。否则一次请求
可能读到不同提交的片段，并且每增加一个片段都会增加延迟和外部依赖。

采用以下两层结构：

1. `example/` 保存可读、可审查的独立源片段。
2. GitHub Actions 验证源片段并为每个平台生成一个不可变 bundle。
3. staging/production 各有一个小型 channel manifest，指向 bundle 的完整 commit SHA
   URL 和 SHA-256。
4. Worker 每次只获取一个 manifest 和一个 bundle，再与实时节点组合。

配置源保持模块化，运行时只有两次固定 GitHub 请求，并且同一请求不会混用不同版本。

## 3. 目标目录

```text
example/
└── sing-box/
    ├── schema/
    │   ├── manifest.schema.json
    │   ├── bundle.schema.json
    │   └── profile.schema.json
    ├── common/
    │   └── base.json
    ├── dns/
    │   ├── split-doh.json
    │   ├── split-doh-ipv4-only.json
    │   └── fakeip-dual-stack.json
    ├── platforms/
    │   ├── ios.json
    │   ├── macos.json
    │   ├── android.json
    │   ├── windows.json
    │   └── linux.json
    ├── rules/
    │   ├── cn-direct.json
    │   └── cn-direct-ipv4-only.json
    ├── outbounds/
    │   ├── default.json
    │   └── hybrid.json
    ├── profiles/
    │   ├── ios.json
    │   ├── macos.json
    │   ├── android.json
    │   ├── windows.json
    │   └── linux.json
    ├── channels/
    │   ├── staging.json
    │   └── production.json
    └── published/
        └── *.bundle.json
```

`common/`、`dns/`、`platforms/`、`rules/`、`outbounds/` 是人工维护的源文件。
`published/` 只由 `pnpm config:build` 生成，不得直接编辑。`profiles/*.json` 只声明每个
平台选择哪些源片段。源文件经过 schema、引用和语义检查，确定性构建后与平台字段及
服务组不变量对照。staging/production manifest 均已发布，引用真实不可变 bundle。

Remote Config Source 验证 manifest 与 bundle URL，按流读取并
限长，拒绝重定向、BOM、重复 JSON 键和未知字段，校验 SHA-256、目标平台、sing-box 版本
及跨片段引用。该模块已接入 staging 和 production 订阅请求链路。

确定性 Composer 只读取每个 owner 的固定字段，并在 outbound 插槽中
加入实时节点和 selector tag 数组，不执行通用 deep merge。节点 tag 会避开
bundle 中全部已声明 tag，输入 bundle 与节点保持不变。离线 `config:diff` 已使用该真实
Composer 对比五个平台的平台字段与服务组不变量。运行时不再回退到旧 Generator。

## 4. Channel Manifest

Worker 只配置一个非敏感变量 `SING_BOX_CONFIG_MANIFEST_URL`。staging 与 production
使用不同 URL，不再通过 Worker 变量选择 TUN 或 DNS 细节。

```json
{
  "schema_version": 1,
  "channel": "production",
  "profiles": {
    "macos": {
      "bundle_url": "https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/<40-char-commit>/example/sing-box/published/macos.bundle.json",
      "sha256": "<64-char-lowercase-hex>"
    }
  }
}
```

约束：

- manifest URL 的 origin、owner、repo 和路径前缀在部署配置中固定。
- `bundle_url` 必须使用 HTTPS、同一 owner/repo、40 位 commit SHA 和批准的路径。
- clientType 只能用于查找 manifest 中的固定键，不得直接拼接任意 URL。
- manifest 最大 64 KiB，bundle 最大 512 KiB；超限立即失败。
- Worker 使用 Web Crypto 校验 bundle SHA-256。

SHA-256 用于检测传输损坏和版本混用，不等同于防止 GitHub 仓库权限被攻破。production
分支保护、CODEOWNERS、必需 CI 和受保护发布环境属于必要的供应链控制。

## 5. Bundle 与字段所有权

Bundle 是项目自有 schema，不是假装可以独立运行的 sing-box 配置：

```json
{
  "schema_version": 1,
  "target": { "format": "sing-box", "version": "1.14.0", "client_type": "macos" },
  "fragments": {
    "common": {},
    "dns": {},
    "platform": {},
    "route": {},
    "outbound_policy": {}
  }
}
```

| 组成              | 唯一负责内容                                               |
| ----------------- | ---------------------------------------------------------- |
| `common`          | `$schema`、`log` 等无平台差异的顶层字段                    |
| `dns`             | 完整 `dns` 对象                                            |
| `platform`        | `inbounds` 与 allowlist 中的 route 平台选项                |
| `route`           | `http_clients`、`route.rules`、rule-set、final 和 resolver |
| `outbound_policy` | selector 参数、固定 tag、节点默认值与英国节点匹配策略      |
| Worker            | 由 `CanonicalNode[]` 生成的节点及动态 outbound tag 数组    |

禁止通用 deep merge。每个顶层字段只有一个 owner；平台 route 选项只允许通过显式
allowlist 合入。数组只能由对应 owner 完整提供，或由 Composer 在已定义的插槽生成。
未知字段、重复 tag、保留 tag 被节点占用、版本不匹配或引用缺失都必须失败关闭。

Kraken/Krak 服务 selector 使用 `uk_node` 选项。Worker 依据 3x-ui 节点标签中的
`🇬🇧`、`英国`、`英國`、独立的 `UK`/`GB`、`United Kingdom` 或 `London` 直接加入英国节点；没有匹配节点时默认 `block`。不再生成单独 UK 组或 `auto` 组。标签是管理员声明，不是出口 IP 的
地理位置证明；production 只有 Kraken/Krak 组内的英国候选节点，真实出口 IP 仍须实机核对。

`service_selectors` 定义独立可切换服务组及默认选项；Worker 展开每组的实时节点列表，
并在重名或保留 tag 冲突时以节点身份摘要消歧。`common.experimental.cache_file.enabled` 由源片段开启，
Worker 为每个 Subscription ID/平台派生独立 `cache_id`，不将 ID 明文放入配置。
选择由客户端本地持久化，不进入 Worker 存储。详见 [RULES.md](./RULES.md)。

## 6. 请求数据流

```text
客户端请求
  → 校验 clientType 与 Subscription ID
  → 3x-ui 获取订阅（同时完成 ID 授权）
  → 解析和过滤 CanonicalNode[]
  → 获取 channel manifest
  → 选择 clientType profile
  → 获取并校验不可变 bundle
  → 严格解析各片段
  → 渲染节点并确定性组合
  → 结构校验
  → 返回 no-store JSON
```

Subscription ID、节点、请求头和 3x-ui URL绝不发送给 GitHub。GitHub 获取失败、摘要
不匹配或 bundle 无效时返回稳定的 `CONFIG_SOURCE_*` 错误，不回退到代码内旧配置，也不
返回部分配置。

## 7. 缓存与更新语义

- 用户订阅、节点和最终配置继续完全不缓存。
- 客户端本地 `cache_file` 仅保存 selector 选择与远程规则集；与 Worker 不缓存订阅是不同边界。
- 第一阶段不使用 Cache API、KV 或内存全局缓存保存远程 bundle。
- immutable bundle 可由 GitHub CDN 正常缓存；manifest 请求要求重新验证。
- GitHub 更新的生效时间取决于其 CDN，不承诺强一致或秒级生效。
- 若可靠性测试证明有必要，可单独设计“公开静态 bundle 的短时缓存/last-known-good”；
  这不允许扩展为缓存用户订阅，并且需要新 ADR。

## 8. 发布与回滚

1. 修改源片段或 profile；若修改组合语义或 schema，先升级 Worker 并保持旧 bundle 兼容。
2. CI 校验项目 schema、字段所有权和所有引用。
3. 使用脱敏 fixture 节点生成五个平台完整配置。
4. 固定 sing-box 1.14.0 执行 `check`。
5. 生成 bundle 和 SHA-256，先更新 staging manifest。
6. 完成实机测试后，通过受保护工作流更新 production manifest。

纯配置回滚只需让 channel manifest 重新指向上一个已验证 commit 的 bundle；若 Worker
代码本身有问题，还须回滚 Worker 版本。2026-09-23 选择组发布经维护者明确授权跳过
staging 实机阶段，先部署向后兼容 Worker、再更新 production manifest；这不是默认流程。

## 9. 已确定决策

- 配置与 Worker 代码使用当前公开仓库 `JAX1024Dev/Sub-Worker`；`example/` 中不得包含
  节点或订阅 secret。
- 常规 production promotion 必须经过 `configuration-production` 受保护环境人工审批和 PR；
  明确授权的例外须在 ADR 与发布记录中注明，并做线上配置冒烟验证。
- 第一阶段接受 GitHub 故障时失败关闭，不引入 KV 或运行时 fallback。
- 首期依赖分支保护、CODEOWNERS、固定 action commit 和受保护环境；manifest 签名列为增强项。
