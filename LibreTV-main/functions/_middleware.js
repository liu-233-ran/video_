export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();
  return response;
}
