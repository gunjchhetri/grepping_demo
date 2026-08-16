import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(fileURLToPath(new URL("../frontend/", import.meta.url)));
const port = Number(process.env.FRONTEND_PORT ?? 5173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");

    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid URL");

    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(frontendRoot, relativePath);

  if (filePath !== frontendRoot && !filePath.startsWith(`${frontendRoot}${sep}`)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");

    return;
  }

  try {
    const file = await stat(filePath);

    if (!file.isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");

      return;
    }

    response.writeHead(200, {
      "content-length": file.size,
      "content-type": contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    });

    if (request.method === "HEAD") {
      response.end();

      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Frontend available at http://127.0.0.1:${port}`);
});
