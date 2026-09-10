import { extname, join, normalize, resolve } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface StaticServer {
  url: string;
  port: number;
  stop: () => void;
}

/** Minimal static file server for the built site (used by the shot script). */
export function startStaticServer(directory: string, port = 4174): StaticServer {
  const root = resolve(directory);
  const server = Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      const filePath = join(root, safePath);
      if (!filePath.startsWith(root)) return new Response("Forbidden", { status: 403 });
      const file = Bun.file(filePath);
      if (file.size === 0) return new Response("Not found", { status: 404 });
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
