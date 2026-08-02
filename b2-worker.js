/**
 * Backblaze B2 → Cloudflare Worker 代理
 * 完整 AWS V4 签名，无外部依赖
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
  let kDate = await hmacSha256("AWS4" + secretAccessKey, dateStamp);
  let kRegion = await hmacSha256(kDate, region);
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

      // 根路径返回 404
      if (url.pathname === "/" || url.pathname === "") {
        return new Response("Not Found", { status: 404 });
      }

      // 提取对象路径（去掉开头的 /）
      const objectPath = url.pathname.slice(1);
      if (!objectPath) {
        return new Response("Not Found", { status: 404 });
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
