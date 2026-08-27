import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const types = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".map", "application/json; charset=utf-8"],
]);

function resolveRequestPath(urlPath) {
	const decoded = decodeURIComponent(urlPath.split("?", 1)[0]);
	const relative = normalize(decoded).replace(/^[/\\]+/, "");
	const candidate = resolve(
		root,
		relative || "examples/interoperability-lab/index.html",
	);
	return candidate.startsWith(`${root}/`) || candidate === root
		? candidate
		: null;
}

createServer((request, response) => {
	if (request.url === "/") {
		response.writeHead(302, { Location: "/examples/interoperability-lab/" });
		response.end();
		return;
	}

	let path = resolveRequestPath(request.url ?? "/");
	if (path && existsSync(path) && statSync(path).isDirectory()) {
		path = join(path, "index.html");
	}
	if (!path || !existsSync(path) || !statSync(path).isFile()) {
		response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Not found");
		return;
	}

	response.writeHead(200, {
		"Content-Type": types.get(extname(path)) ?? "application/octet-stream",
		"Cache-Control": "no-store",
	});
	createReadStream(path).pipe(response);
}).listen(port, "127.0.0.1", () => {
	console.log(
		`Indigo WebMCP lab: http://127.0.0.1:${port}/examples/interoperability-lab/`,
	);
});
