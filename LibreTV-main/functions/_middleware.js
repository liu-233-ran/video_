export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();

  // 为代理请求添加超时友好头
  const url = new URL(request.url);
  if (url.pathname.startsWith('/proxy/')) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Proxy-Timeout', '8');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }

  return response;
}
