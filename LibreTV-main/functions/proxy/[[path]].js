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
    const MAX_RECURSION = parseInt(env.MAX_RECURSION || '5');

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

    async function fetchContentWithType(targetUrl) {
        // Douban 图片需要 movie.douban.com Referer，否则返回 418
        let referer = request.headers.get('Referer') || new URL(targetUrl).origin;
        if (targetUrl.includes('doubanio.com')) {
            referer = 'https://movie.douban.com/';
        }

        const headers = new Headers({
            'User-Agent': getRandomUserAgent(),
            'Accept': '*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': referer
        });

        try {
            logDebug(`开始请求: ${targetUrl}`);
            const response = await fetch(targetUrl, { headers, redirect: 'follow' });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                logDebug(`请求失败: ${response.status} ${response.statusText} - ${targetUrl}`);
                throw new Error(`HTTP error ${response.status}: ${response.statusText}. URL: ${targetUrl}. Body: ${errorBody.substring(0, 150)}`);
            }

            const content = await response.text();
            const contentType = response.headers.get('Content-Type') || '';
            logDebug(`请求成功: ${targetUrl}, Content-Type: ${contentType}, 长度: ${content.length}`);
            return { content, contentType, responseHeaders: response.headers };

        } catch (error) {
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

     async function processM3u8Content(targetUrl, content, recursionDepth = 0) {
         if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
             return await processMasterPlaylist(targetUrl, content, recursionDepth);
         }
         return processMediaPlaylist(targetUrl, content);
     }

    async function processMasterPlaylist(url, content, recursionDepth) {
        if (recursionDepth > MAX_RECURSION) {
            throw new Error(`递归层数过多 (${MAX_RECURSION}): ${url}`);
        }

        const baseUrl = getBaseUrl(url);
        const lines = content.split('\n');
        let highestBandwidth = -1;
        let bestVariantUrl = '';

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                const currentBandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;

                 let variantUriLine = '';
                 for (let j = i + 1; j < lines.length; j++) {
                     const line = lines[j].trim();
                     if (line && !line.startsWith('#')) {
                         variantUriLine = line;
                         i = j;
                         break;
                     }
                 }

                 if (variantUriLine && currentBandwidth >= highestBandwidth) {
                     highestBandwidth = currentBandwidth;
                     bestVariantUrl = resolveUrl(baseUrl, variantUriLine);
                 }
            }
        }

         if (!bestVariantUrl) {
             for (let i = 0; i < lines.length; i++) {
                 const line = lines[i].trim();
                 if (line && !line.startsWith('#') && (line.endsWith('.m3u8') || line.includes('.m3u8?'))) {
                    bestVariantUrl = resolveUrl(baseUrl, line);
                     break;
                 }
             }
         }

        if (!bestVariantUrl) {
            return processMediaPlaylist(url, content);
        }

        logDebug(`选择的子列表 (带宽: ${highestBandwidth}): ${bestVariantUrl}`);
        const { content: variantContent, contentType: variantContentType } = await fetchContentWithType(bestVariantUrl);

        if (!isM3u8Content(variantContent, variantContentType)) {
             return processMediaPlaylist(bestVariantUrl, variantContent);
        }

        const processedVariant = await processM3u8Content(bestVariantUrl, variantContent, recursionDepth + 1);

        // 尝试 KV 缓存
        const cacheKey = `m3u8_processed:${bestVariantUrl}`;
        try {
            const kvNamespace = env.LIBRETV_PROXY_KV;
            if (kvNamespace) {
                waitUntil(kvNamespace.put(cacheKey, processedVariant, { expirationTtl: CACHE_TTL }));
            }
        } catch (e) {
            // KV 不可用，跳过缓存
        }

        return processedVariant;
    }

    // --- 主处理逻辑 ---
    try {
        const targetUrl = getTargetUrlFromPath(url.pathname);

        if (!targetUrl) {
            return createResponse("无效的代理请求。路径应为 /proxy/<经过编码的URL>", 400);
        }

        logDebug(`收到代理请求: ${targetUrl}`);

        const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl);

        if (isM3u8Content(content, contentType)) {
            logDebug(`M3U8 内容，开始处理: ${targetUrl}`);
            const processedM3u8 = await processM3u8Content(targetUrl, content, 0);
            return createM3u8Response(processedM3u8);
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
        return createResponse(`代理处理错误: ${error.message}`, 500);
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
