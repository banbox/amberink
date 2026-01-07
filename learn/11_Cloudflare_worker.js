/**
 * 针对 amberink.eth.limo 的加速代理脚本
 * 功能：代理请求、处理跨域、多级缓存优化
 */

const TARGET_DOMAIN = "amberink.eth.limo";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;

    // 1. 处理跨域预检 (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. 尝试从 Cloudflare 边缘缓存中获取
    if (request.method === "GET") {
      let cachedResponse = await cache.match(request);
      if (cachedResponse) {
        console.log("Cache Hit: " + url.pathname);
        return cachedResponse;
      }
    }

    // 3. 构造转发请求
    // 保持原始的路径 (pathname) 和查询参数 (search)
    const targetUrl = `https://${TARGET_DOMAIN}${url.pathname}${url.search}`;
    
    // 必须克隆请求头，并修改 Host，否则 eth.limo 无法识别请求来源
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", TARGET_DOMAIN);
    newHeaders.set("Referer", `https://${TARGET_DOMAIN}/`);

    try {
      // 发起对目标域名的请求
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        redirect: "follow",
      });

      // 4. 修改返回头，增加 CORS 和 缓存控制
      const modifiedHeaders = new Headers(response.headers);
      modifiedHeaders.set("Access-Control-Allow-Origin", "*");
      
      // 核心优化：根据文件类型设置缓存策略
      if (request.method === "GET" && response.ok) {
        const path = url.pathname.toLowerCase();
        
        // 如果是静态资源（js, css, 图片, 字体），设置长时间缓存（1小时到1天）
        if (path.match(/\.(js|css|png|jpg|jpeg|gif|woff2|svg|ico)$/)) {
          // s-maxage=86400 表示在 Cloudflare 边缘缓存 24 小时
          modifiedHeaders.set("Cache-Control", "public, s-maxage=86400, max-age=3600");
        } else {
          // HTML 页面或其它，缓存 1 分钟，保证更新及时
          modifiedHeaders.set("Cache-Control", "public, s-maxage=60, max-age=60");
        }
      }

      const finalResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedHeaders,
      });

      // 5. 异步存入缓存
      if (request.method === "GET" && response.ok) {
        ctx.waitUntil(cache.put(request, finalResponse.clone()));
      }

      return finalResponse;

    } catch (e) {
      return new Response(`Proxy Error: ${e.message}`, { status: 502 });
    }
  },
};