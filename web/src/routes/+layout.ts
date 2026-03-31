// SPA mode — no SSR, prerender static shells so client router knows all routes.
// Dynamic routes (e.g. bots/[id]) override with prerender = false in their own +page.ts.
export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';
