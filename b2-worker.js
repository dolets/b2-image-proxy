/**
 * Backblaze B2 → Cloudflare Worker 代理
 * 完整 AWS V4 签名，无外部依赖
 * 根路径返回粉色主页
 */

// ============================================================
// 配置区（按需修改）
// ============================================================
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET_NAME = "easyimage-backup";
const B2_REGION   = "us-east-005";

// ============================================================
// 工具函数
// ============================================================

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data) {
  const encoder = new TextEncoder();
  const buf = typeof data === "string" ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(hash));
}

async function hmacSha256(key, data) {
  const encoder = new TextEncoder();
  const keyBuf = typeof key === "string" ? encoder.encode(key) : key;
  const dataBuf = typeof data === "string" ? encoder.encode(data) : data;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBuf);
  return new Uint8Array(sig);
}

// ============================================================
// AWS V4 签名
// ============================================================

async function signRequest(urlStr, method, accessKeyId, secretAccessKey, region, service) {
  const url = new URL(urlStr);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);

  // 规范请求
  const canonicalUri = url.pathname;
  const canonicalQuery = url.searchParams.toString();
  const payloadHash = "UNSIGNED-PAYLOAD";

  const signedHeadersList = ["host", "x-amz-content-sha256", "x-amz-date"];
  const signedHeadersStr = signedHeadersList.join(";");

  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash
  ].join("\n");

  // 待签字符串
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);

  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join("\n");

  // 派生签名密钥
  let kDate    = await hmacSha256("AWS4" + secretAccessKey, dateStamp);
  let kRegion  = await hmacSha256(kDate, region);
  let kService = await hmacSha256(kRegion, service);
  let kSigning = await hmacSha256(kService, "aws4_request");

  // 计算签名
  const signatureBytes = await hmacSha256(kSigning, stringToSign);
  const signature = bytesToHex(signatureBytes);

  // 组装 Authorization 头
  const authorization = [
    `${algorithm} Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeadersStr}`,
    `Signature=${signature}`
  ].join(", ");

  // 返回签名后的请求头
  return {
    "host": url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "Authorization": authorization
  };
}

// ============================================================
// 根路径粉色主页 HTML
// ============================================================

function buildHomePage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Backblaze B2 Cloud Storage — Read Only</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #fce4ec 0%, #f8bbd0 30%, #f48fb1 60%, #f06292 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    overflow: hidden;
  }
  .container {
    text-align: center;
    padding: 60px 40px;
    max-width: 640px;
  }
  .flame {
    font-size: 72px;
    margin-bottom: 24px;
    filter: drop-shadow(0 4px 12px rgba(226,30,41,0.3));
    animation: flicker 2s ease-in-out infinite alternate;
  }
  @keyframes flicker {
    0%   { transform: scale(1)    rotate(-2deg); opacity: 1; }
    50%  { transform: scale(1.05) rotate(1deg);  opacity: 0.92; }
    100% { transform: scale(1)    rotate(-1deg); opacity: 1; }
  }
  h1 {
    font-size: 28px;
    font-weight: 700;
    color: #2d2d2d;
    margin-bottom: 12px;
    letter-spacing: -0.5px;
  }
  .badge {
    display: inline-block;
    background: #E21E29;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 14px;
    border-radius: 20px;
    margin-bottom: 20px;
    letter-spacing: 0.5px;
  }
  .desc {
    font-size: 16px;
    color: #555;
    line-height: 1.8;
    margin-bottom: 32px;
  }
  .desc code {
    background: rgba(255,255,255,0.7);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 14px;
    color: #E21E29;
  }
  .links {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .links a {
    display: inline-block;
    padding: 10px 22px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }
  .links a.primary {
    background: #E21E29;
    color: #fff;
    box-shadow: 0 2px 8px rgba(226,30,41,0.35);
  }
  .links a.primary:hover {
    background: #c41822;
    transform: translateY(-1px);
  }
  .links a.secondary {
    background: rgba(255,255,255,0.8);
    color: #E21E29;
    border: 1px solid rgba(226,30,41,0.3);
  }
  .links a.secondary:hover {
    background: #fff;
  }
  .footer {
    margin-top: 40px;
    font-size: 12px;
    color: #999;
  }
  .footer a {
    color: #E21E29;
    text-decoration: none;
  }
  .pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #4caf50;
    border-radius: 50%;
    margin-right: 6px;
    animation: pulse 1.5s ease-in-out infinite;
    vertical-align: middle;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1;   transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(1.3); }
  }
</style>
</head>
<body>
<div class="container">
  <div class="flame">&#128293;</div>
  <div class="badge">READ ONLY</div>
  <h1>Backblaze B2 Cloud Storage</h1>
  <p class="desc">
    <span class="pulse"></span>服务运行正常<br>
    这是一个 <code>Backblaze B2</code> 存储桶的 <strong>只读访问网关</strong><br>
    通过 Cloudflare Workers 提供安全、高速的 S3 兼容对象存储代理
  </p>
  <div class="links">
    <a class="primary" href="/_health">健康检查</a>
    <a class="secondary" href="https://www.backblaze.com/b2" target="_blank" rel="noopener">了解 B2 &#8594;</a>
  </div>
  <div class="footer">
    Powered by Cloudflare Workers &middot; Backblaze B2 S3 Compatible API<br>
    <a href="https://backblaze.com" target="_blank" rel="noopener">backblaze.com</a>
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// 主入口
// ============================================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // 健康检查
      if (url.pathname === "/_health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 根路径返回粉色主页
      if (url.pathname === "/" || url.pathname === "") {
        return new Response(buildHomePage(), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }

      // 提取对象路径（去掉开头的 /）
      const objectPath = url.pathname.slice(1);
      if (!objectPath) {
        return new Response(buildHomePage(), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }

      // 构造 B2 的 S3 兼容 URL
      const b2Url = `${B2_ENDPOINT}/${BUCKET_NAME}/${objectPath}`;

      // 读取密钥
      const accessKeyId = env.B2_APPLICATION_KEY_ID;
      const secretKey = env.B2_APPLICATION_KEY;

      if (!accessKeyId || !secretKey) {
        return new Response("Missing B2 credentials", { status: 500 });
      }

      // 生成签名头
      const signedHeaders = await signRequest(
        b2Url,
        request.method,
        accessKeyId,
        secretKey,
        B2_REGION,
        "s3"
      );

      // 发起签名请求到 B2
      const response = await fetch(b2Url, {
        method: request.method,
        headers: signedHeaders,
        cf: {
          cacheTtl: 86400,
          cacheEverything: true
        }
      });

      // 添加安全头
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("X-Content-Type-Options", "nosniff");
      newResponse.headers.set("Referrer-Policy", "no-referrer-when-downgrade");

      return newResponse;

    } catch (err) {
      return new Response(`Worker Error: ${err.message}\n${err.stack}`, {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }
};
