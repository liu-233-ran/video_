// 代理请求鉴权模块 - 已移除鉴权，直接代理

async function addAuthToProxyUrl(url) {
    return url;
}

window.ProxyAuth = {
    addAuthToProxyUrl
};
