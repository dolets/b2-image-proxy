# B2 Image Proxy (Cloudflare Worker)

通过 Cloudflare Worker 反向代理 Backblaze B2 私有桶，支持 AWS V4 签名、子目录、缓存。

## 架构

```
用户 → https://cdn.xxx.com/2026/xxx.png
         ↓
    Cloudflare Worker（签名代理）
         ↓
    Backblaze B2 私有桶（easyimage-backup）
```

## 部署方式

### 方式一：关联 GitHub 自动部署（推荐）

1. 在 Cloudflare Dashboard → Workers & Pages → 创建 Worker
2. 选择「连接到 Git 仓库」→ 选择 `dolets/b2-image-proxy` → 分支 `main`
3. Root directory 留空（`.`）
4. Build command：`npx wrangler deploy`
5. 在 Settings → Variables 中添加两个 Secret：
   - `B2_APPLICATION_KEY_ID`
   - `B2_APPLICATION_KEY`
6. 保存后，每次 `git push` 到 `main` 会自动部署

### 方式二：Cloudflare 网页端手动部署

1. 复制 `b2-worker.js` 全部内容
2. 粘贴到 Cloudflare Dashboard → Worker → 编辑代码
3. 保存并部署
4. Settings → Variables 添加两个 Secret（同上）
5. 再次部署使变量生效

## 配置说明

所有配置项在 `b2-worker.js` 顶部：

| 配置项 | 值 | 说明 |
|---|---|---|
| `B2_ENDPOINT` | `https://s3.us-east-005.backblazeb2.com` | B2 S3 Endpoint |
| `BUCKET_NAME` | `easyimage-backup` | B2 存储桶名称 |
| `B2_REGION` | `us-east-005` | B2 区域 |

密钥通过 Cloudflare Dashboard → Settings → Variables 配置（Secret 类型）：
- `B2_APPLICATION_KEY_ID`
- `B2_APPLICATION_KEY`

## 使用方法

```
https://你的workers.dev/2026/example.png
```

或绑定自定义域名后：

```
https://cdn.xxx.com/2026/example.png
```

## 健康检查

访问 `/_health` 查看运行状态：

```json
{
  "status": "ok",
  "bucket": "easyimage-backup",
  "endpoint": "https://s3.us-east-005.backblazeb2.com",
  "timestamp": "2026-08-02T..."
}
```

## 注意事项

- B2 桶保持 **Private**
- 文件名避免包含括号 `()`、空格、中文等特殊字符
- 根路径 `/` 返回 404
- 密钥只存在 Cloudflare Secret 中，不进代码、不进 git
- `wrangler.toml` 的 `name` 必须和 Dashboard Worker 名字一致

## License

MIT
