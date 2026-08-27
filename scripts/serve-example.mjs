import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const types = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".map", "application/json; charset=utf-8"],
]);

const securityHeaders = {
	"Cache-Control": "no-store",
	"Content-Security-Policy":
		"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'",
	"Permissions-Policy": "tools=(self)",
	"X-Content-Type-Options": "nosniff",
};

function resolveRequestPath(urlPath) {
	let decoded;
	try {
		decoded = decodeURIComponent(urlPath.split("?", 1)[0]);
	} catch {
		return null;
	}
	const candidate = resolve(root, decoded.replace(/^[/\\]+/, "") || "examples/interoperability-lab/index.html");
	const fromRoot = relative(root, candidate);
	if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) return candidate;
	return null;
}

export function createExampleServer() {
	return createServer((request, response) => {
		if (request.method !== "GET" && request.method !== "HEAD") {
			response.writeHead(405, { ...securityHeaders, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
			response.end("Method not allowed");
			return;
		}

		if (request.url === "/healthz") {
			const payload = JSON.stringify({ status: "ok", app: "indigo-webmcp", mode: "standalone" });
			response.writeHead(200, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8" });
			if (request.method === "GET") response.end(payload);
			else response.end();
			return;
		}

		if (request.url === "/") {
			response.writeHead(302, { ...securityHeaders, Location: "/examples/interoperability-lab/" });
			response.end();
			return;
		}

		let path = resolveRequestPath(request.url ?? "/");
		if (path && existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
		if (!path || !existsSync(path) || !statSync(path).isFile()) {
			response.writeHead(404, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" });
			response.end("Not found");
			return;
		}

		response.writeHead(200, {
			...securityHeaders,
			"Content-Type": types.get(extname(path)) ?? "application/octet-stream",
		});
		if (request.method === "HEAD") response.end();
		else createReadStream(path).pipe(response);
	});
}

export async function startExampleServer({ port = Number(process.env.PORT ?? 4173), host = "127.0.0.1" } = {}) {
	const server = createExampleServer();
	await new Promise((resolvePromise, rejectPromise) => {
		server.once("error", rejectPromise);
		server.listen(port, host, resolvePromise);
	});
	const address = server.address();
	const actualPort = typeof address === "object" && address ? address.port : port;
	return { server, url: `http://${host}:${actualPort}/examples/interoperability-lab/` };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
	startExampleServer()
		.then(({ url }) => console.log(`Indigo WebMCP lab: ${url}`))
		.catch((error) => {
			console.error(error);
			process.exitCode = 1;
		});
}
