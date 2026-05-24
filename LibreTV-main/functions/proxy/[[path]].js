// functions/proxy/[[path]].js
// 代理函数 - 拦截发往 /proxy/* 的请求

const MEDIA_FILE_EXTENSIONS = [
    '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.f4v', '.m4v', '.3gp', '.3g2', '.ts', '.mts', '.m2ts',
    '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.alac', '.aiff', '.opus',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg', '.avif', '.heic'
];
const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/'];

export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);

    const DEBUG_ENABLED = (env.DEBUG === 'true');
    const CACHE_TTL = parseInt(env.CACHE_TTL || '86400');
    // Cloudflare Pages Functions 免费版限制 10 秒，fetch 超时设为 8 秒留余量
    const FETCH_TIMEOUT = parseInt(env.FETCH_TIMEOUT || '8000');

    let USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    try {
        const agentsJson = env.USER_AGENTS_JSON;
        if (agentsJson) {
            const parsedAgents = JSON.parse(agentsJson);
            if (Array.isArray(parsedAgents) && parsedAgents.length > 0) {
                USER_AGENTS = parsedAgents;
            }
        }
    } catch (e) {
        logDebug(`解析 USER_AGENTS_JSON 失败: ${e.message}，使用默认值`);
    }

    function logDebug(message) {
        if (DEBUG_ENABLED) {
            console.log(`[Proxy Func] ${message}`);
        }
    }

    function getTargetUrlFromPath(pathname) {
        const encodedUrl = pathname.replace(/^\/proxy\//, '');
        if (!encodedUrl) return null;
        try {
            let decodedUrl = decodeURIComponent(encodedUrl);
            if (!decodedUrl.match(/^https?:\/\//i)) {
                if (encodedUrl.match(/^https?:\/\//i)) {
                    decodedUrl = encodedUrl;
                } else {
                    logDebug(`无效的目标URL: ${decodedUrl}`);
                    return null;
                }
            }
            return decodedUrl;
        } catch (e) {
            logDebug(`解码URL出错: ${encodedUrl} - ${e.message}`);
            return null;
        }
    }

    function createResponse(body, status = 200, headers = {}) {
        const responseHeaders = new Headers(headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        responseHeaders.set("Access-Control-Allow-Headers", "*");

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: responseHeaders });
        }

        return new Response(body, { status, headers: responseHeaders });
    }

    function createM3u8Response(content) {
        return createResponse(content, 200, {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": `public, max-age=${CACHE_TTL}`
        });
    }

    function getRandomUserAgent() {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    function getBaseUrl(urlStr) {
        try {
            const parsedUrl = new URL(urlStr);
            if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
                return `${parsedUrl.origin}/`;
            }
            const pathParts = parsedUrl.pathname.split('/');
            pathParts.pop();
            return `${parsedUrl.origin}${pathParts.join('/')}/`;
        } catch (e) {
            const lastSlashIndex = urlStr.lastIndexOf('/');
            return lastSlashIndex > urlStr.indexOf('://') + 2 ? urlStr.substring(0, lastSlashIndex + 1) : urlStr + '/';
        }
    }

    function resolveUrl(baseUrl, relativeUrl) {
        if (relativeUrl.match(/^https?:\/\//i)) {
            return relativeUrl;
        }
        try {
            return new URL(relativeUrl, baseUrl).toString();
        } catch (e) {
            if (relativeUrl.startsWith('/')) {
                const urlObj = new URL(baseUrl);
                return `${urlObj.origin}${relativeUrl}`;
            }
            return `${baseUrl.replace(/\/[^/]*$/, '/')}${relativeUrl}`;
        }
    }

    function rewriteUrlToProxy(targetUrl) {
        return `/proxy/${encodeURIComponent(targetUrl)}`;
    }

    // 带超时的 fetch
    async function fetchWithTimeout(targetUrl, headers, timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(targetUrl, {
                headers,
                redirect: 'follow',
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function isBinaryContent(contentType, url) {
        if (contentType) {
            if (MEDIA_CONTENT_TYPES.some(type => contentType.startsWith(type))) {
                return true;
            }
            if (contentType.includes('application/octet-stream')) {
                return true;
            }
        }
        const lowerUrl = url.split('?')[0].toLowerCase();
        return MEDIA_FILE_EXTENSIONS.some(ext => lowerUrl.endsWith(ext));
    }

    async function fetchContentWithType(targetUrl) {
        let referer = request.headers.get('Referer') || new URL(targetUrl).origin;
        if (targetUrl.includes('douban')) {
            referer = 'https://movie.douban.com/';
        }

        const headers = new Headers({
            'User-Agent': getRandomUserAgent(),
            'Accept': '*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': referer
        });

        try {
            logDebug(`开始请求: ${targetUrl} (超时: ${FETCH_TIMEOUT}ms)`);
            const response = await fetchWithTimeout(targetUrl, headers, FETCH_TIMEOUT);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                logDebug(`请求失败: ${response.status} ${response.statusText} - ${targetUrl}`);
                throw new Error(`HTTP error ${response.status}: ${response.statusText}. URL: ${targetUrl}. Body: ${errorBody.substring(0, 150)}`);
            }

            const contentType = response.headers.get('Content-Type') || '';

            if (isBinaryContent(contentType, targetUrl)) {
                logDebug(`二进制内容: ${targetUrl}, Content-Type: ${contentType}`);
                return { body: response.body, contentType, responseHeaders: response.headers, isBinary: true };
            }

            const content = await response.text();
            logDebug(`请求成功: ${targetUrl}, Content-Type: ${contentType}, 长度: ${content.length}`);
            return { content, contentType, responseHeaders: response.headers, isBinary: false };

        } catch (error) {
            if (error.name === 'AbortError') {
                logDebug(`请求超时: ${targetUrl} (${FETCH_TIMEOUT}ms)`);
                throw new Error(`请求超时 (${FETCH_TIMEOUT / 1000}秒): ${targetUrl}`);
            }
            logDebug(`请求失败: ${targetUrl}: ${error.message}`);
            throw new Error(`请求目标URL失败 ${targetUrl}: ${error.message}`);
        }
    }

    function isM3u8Content(content, contentType) {
        if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl') || contentType.includes('audio/mpegurl'))) {
            return true;
        }
        return content && typeof content === 'string' && content.trim().startsWith('#EXTM3U');
    }

    function processKeyLine(line, baseUrl) {
        return line.replace(/URI="([^"]+)"/, (match, uri) => {
            const absoluteUri = resolveUrl(baseUrl, uri);
            return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
        });
    }

    function processMapLine(line, baseUrl) {
         return line.replace(/URI="([^"]+)"/, (match, uri) => {
             const absoluteUri = resolveUrl(baseUrl, uri);
             return `URI="${rewriteUrlToProxy(absoluteUri)}"`;
         });
     }

    function processMediaPlaylist(url, content) {
        const baseUrl = getBaseUrl(url);
        const lines = content.split('\n');
        const output = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line && i === lines.length - 1) {
                output.push(line);
                continue;
            }
            if (!line) continue;

            if (line.startsWith('#EXT-X-KEY')) {
                output.push(processKeyLine(line, baseUrl));
                continue;
            }
            if (line.startsWith('#EXT-X-MAP')) {
                output.push(processMapLine(line, baseUrl));
                 continue;
            }
             if (line.startsWith('#EXTINF')) {
                 output.push(line);
                 continue;
             }
             if (!line.startsWith('#')) {
                 const absoluteUrl = resolveUrl(baseUrl, line);
                 output.push(rewriteUrlToProxy(absoluteUrl));
                 continue;
             }
             output.push(line);
        }
        return output.join('\n');
    }

    // Master Playlist: 不递归抓取，只改写 URL 让客户端逐层请求
    function processMasterPlaylistLight(url, content) {
        const baseUrl = getBaseUrl(url);
        const lines = content.split('\n');
        const output = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line && i === lines.length - 1) {
                output.push(line);
                continue;
            }
            if (!line) {
                output.push('');
                continue;
            }

            // 改写 KEY 标签中的 URI
            if (line.startsWith('#EXT-X-KEY')) {
                output.push(processKeyLine(line, baseUrl));
                continue;
            }
            // 改写 MAP 标签中的 URI
            if (line.startsWith('#EXT-X-MAP')) {
                output.push(processMapLine(line, baseUrl));
                continue;
            }
            // 非注释行 = 子列表 URL，改写为走代理
            if (!line.startsWith('#')) {
                const absoluteUrl = resolveUrl(baseUrl, line);
                output.push(rewriteUrlToProxy(absoluteUrl));
                continue;
            }
            output.push(line);
        }
        return output.join('\n');
    }

    // --- 主处理逻辑 ---
    try {
        const targetUrl = getTargetUrlFromPath(url.pathname);

        if (!targetUrl) {
            return createResponse("无效的代理请求。路径应为 /proxy/<经过编码的URL>", 400);
        }

        logDebug(`收到代理请求: ${targetUrl}`);

        const result = await fetchContentWithType(targetUrl);

        if (result.isBinary) {
            const binaryHeaders = new Headers(result.responseHeaders);
            binaryHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
            binaryHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(result.body, { status: 200, headers: binaryHeaders });
        }

        const { content, contentType, responseHeaders } = result;

        if (isM3u8Content(content, contentType)) {
            const isMaster = content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:');
            logDebug(`M3U8 内容 (${isMaster ? 'Master' : 'Media'} Playlist): ${targetUrl}`);

            if (isMaster) {
                // Master Playlist: 轻量处理，不递归抓取
                const processed = processMasterPlaylistLight(targetUrl, content);
                return createM3u8Response(processed);
            } else {
                // Media Playlist: 改写 .ts / .m3u8 等片段 URL
                const processed = processMediaPlaylist(targetUrl, content);
                return createM3u8Response(processed);
            }
        } else {
            const finalHeaders = new Headers(responseHeaders);
            finalHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
            finalHeaders.set("Access-Control-Allow-Origin", "*");
            finalHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
            finalHeaders.set("Access-Control-Allow-Headers", "*");
            return createResponse(content, 200, finalHeaders);
        }

    } catch (error) {
        logDebug(`代理处理错误: ${error.message} \n ${error.stack}`);

        // 区分超时和其他错误
        const isTimeout = error.message.includes('超时') || error.name === 'AbortError';
        const status = isTimeout ? 504 : 500;
        const userMsg = isTimeout
            ? `上游服务器响应超时，请稍后重试。目标: ${error.message.split(':').pop() || ''}`
            : `代理处理错误: ${error.message}`;

        return createResponse(userMsg, status);
    }
}

export async function onOptions(context) {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        },
    });
}
