# 发布检查

## 版本范围

首个 MVP 版本为 `0.1.0`，目标运行时为 Cloudflare Workers，输出格式固定为
sing-box `1.14.0`。首期仅支持 VLESS Reality。

## 本地门禁

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

完整门禁包含 lint、格式、类型、62+ 项测试、五平台配置检查、Worker dry-run、
规则集 SHA-256、真实订阅 E2E、真实配置 sing-box 检查和依赖审计。

## Staging

```bash
pnpm wrangler login
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env staging
pnpm deploy:staging
```

部署后检查 `/health`、有效订阅、无效 Subscription ID、响应缓存头，并在 iOS 与
macOS 官方客户端重新导入 staging 返回的配置。涉及 outbound 网络能力时，同时验证
TCP 和 UDP/WebRTC。确认 Cloudflare WAF 或 Rate Limiting 已限制失败枚举和异常频率。

## Production

```bash
pnpm wrangler secret put THREE_X_UI_SUB_BASE_URL --env production
pnpm deploy:production
```

发布前必须确认：

- staging 与 production 使用独立 Secret；
- invocation logs 和 tracing 保持关闭；
- 自定义域名、HTTPS、WAF/Rate Limiting 和回滚负责人已确定；
- `CHANGELOG.md`、版本号和 Git tag 一致；
- 未提交 `.dev.vars`、真实配置、Subscription ID 或节点凭据；
- 项目使用 MIT License，版权主体为 `JAX1024Dev`。

发布后记录 Cloudflare deployment version，并用不含 secret 的 request ID 验证错误日志。
