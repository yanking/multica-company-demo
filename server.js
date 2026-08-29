// 零依赖待办服务：内存存储 + JSON API + 静态页面。供 AI 软件公司流水线试点使用。
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// 创建应用状态与 HTTP 服务器；测试通过 createApp() 拿到可监听的 server
export function createApp() {
  const todos = [];
  let nextId = 1;

  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("invalid json"));
        }
      });
      req.on("error", reject);
    });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/api/todos" && req.method === "GET") {
        return json(res, 200, { todos });
      }
      if (url.pathname === "/api/todos" && req.method === "POST") {
        const body = await readBody(req);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return json(res, 400, { error: "title 不能为空" });
        const todo = { id: nextId++, title, done: false };
        todos.push(todo);
        return json(res, 201, todo);
      }
      const m = url.pathname.match(/^\/api\/todos\/(\d+)$/);
      if (m && req.method === "PATCH") {
        const todo = todos.find((t) => t.id === Number(m[1]));
        if (!todo) return json(res, 404, { error: "待办不存在" });
        const body = await readBody(req);
        if (typeof body.done === "boolean") todo.done = body.done;
        if (typeof body.title === "string" && body.title.trim()) todo.title = body.title.trim();
        return json(res, 200, todo);
      }
      if (url.pathname === "/" && req.method === "GET") {
        const html = await readFile(path.join(here, "web", "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }
      return json(res, 404, { error: "not found" });
    } catch (err) {
      return json(res, err.message === "invalid json" ? 400 : 500, { error: err.message });
    }
  });

  return server;
}

// 直接运行时监听端口；被 import 时不监听
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => console.log(`todo 服务已启动：http://localhost:${port}`));
}
