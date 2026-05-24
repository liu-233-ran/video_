// Vercel Middleware - 无环境变量需要注入
export default async function middleware(request) {
  const response = await fetch(request);
  return response;
}

export const config = {
  matcher: ['/', '/((?!api|_next/static|_vercel|favicon.ico).*)'],
};
