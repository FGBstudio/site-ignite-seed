// Resolve a `/public` asset against Vite's BASE_URL so the path works both in
// dev (`/`) and in production builds with a non-root base (e.g. GitHub Pages
// deployments under `/site-ignite-seed/`).
export const asset = (p: string): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
