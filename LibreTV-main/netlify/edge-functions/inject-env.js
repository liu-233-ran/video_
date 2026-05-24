// Netlify Edge Function - 不需要注入环境变量
export default async (request, context) => {
  return;
};

export const config = {
  path: ["/*"]
};
