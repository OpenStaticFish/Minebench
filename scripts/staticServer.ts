import { extname, join, normalize, resolve } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export interface StaticServer {
  url: string;
  port: number;
  stop: () => void;
}

/**
 * Tiny static file server used for `bun run shots:serve` and the automated
 * screenshot script. Serves the Vite `dist/` output with correct MIME types.
 */
export function startStaticServer(directory: string, port = 4173): StaticServer {
  const root = resolve(directory);
  const server = Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      const filePath = join(root, safePath);
      if (!filePath.startsWith(root)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (file.size === 0) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(file, {
        headers: { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" },
      });
    },
  });
  return {
    url: `http://localhost:${server.port}`,
    port: server.port ?? port,
    stop: () => server.stop(true),
  };
}

if (import.meta.main) {
  const directory = process.argv[2] ?? "dist";
  const port = Number(process.env.PORT ?? 4173);
  const server = startStaticServer(directory, port);
  console.log(`Cubewild static server running at ${server.url} (serving ${resolve(directory)})`);
}
