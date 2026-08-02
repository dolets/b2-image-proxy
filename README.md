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

### 方式一：Cloudflare 网页端（推荐）

1. 登录 Cloudflare Dashboard → Workers & Pages
2. 创建新 Worker，命名为 `b2-image-proxy`
3. 将 `b2-worker.js` 内容粘贴到编辑器，覆盖默认代码
4. 点击 **Save and Deploy**
5. 进入 **Settings → Variables**
6. 添加以下两个 Secret（密钥）：

   | 变量名 | 类型 | 说明 |
   |---|---|---|
   | `B2_APPLICATION_KEY_ID` | Secret | B2 的 Key ID |
   | `B2_APPLICATION_KEY` | Secret | B2 的 Application Key |

7. 再次点击 **Deploy**，使变量生效

### 方式二：关联 GitHub 仓库

1. Cloudflare Dashboard → Worker → Settings → Build
2. 连接 GitHub 仓库 `dolets/b2-image-proxy`
3. 分支 `main`，部署命令 `npx wrangler deploy`
4. 确保 `wrangler.toml` 中 `name` 与 Worker 名称一致
5. 在 Dashboard 的 Variables 中添加两个 Secret
6. push 到 `main` 后自动部署

## 配置说明

所有配置项均在 `b2-worker.js` 顶部：

| 配置项 | 说明 |
|---|---|
| `B2_ENDPOINT` | B2 S3 Endpoint |
| `BUCKET_NAME` | B2 存储桶名称 |
| `B2_REGION` | B2 区域 |

## 使用方法

部署完成后，直接访问 Worker 地址：

```
https://b2-image-proxy.你的子域名.workers.dev/2026/example.png
```

或绑定自定义域名后：

```
https://cdn.xxx.com/2026/example.png
```

## 健康检查

访问 `/_health` 可查看运行状态：

```json
{
  "status": "ok"
}
```

## 根路径主页

访问 `/` 会显示一个粉色主页，说明这是一个 Backblaze B2 存储桶的只读访问网关。

## 注意事项

- B2 桶需保持 **Private**（私有），Worker 负责签名鉴权
- 文件名避免包含括号 `()`、空格等特殊字符
- 根路径 `/` 返回粉色主页，不是 404
- 密钥只存在 Cloudflare Secret 中，不进代码、不进 git
