// 零依赖待办服务：内存存储 + JSON API + 静态页面。供 AI 软件公司流水线试点使用。
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// 唯一的标签比较键（契约 MAC-27）。写入去重与筛选匹配共用这一个定义，两处不得各写各的。
const tagKey = (s) => s.trim().toLowerCase();

// 规范化 + 校验标签数组。成功返回 { tags }，失败返回 { error }，调用方据此返回 400。
// 校验顺序固定：类型 → trim → 丢空 → 逗号 → 长度 → 去重 → 数量（契约 MAC-27）。
function normalizeTags(input) {
  if (!Array.isArray(input)) return { error: "tags 必须是字符串数组" };
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    if (typeof raw !== "string") return { error: "tags 的每一项必须是字符串" };
    const t = raw.trim();
    if (!t) continue; // 空白项静默丢弃
    if (t.includes(",")) return { error: "标签不能包含英文逗号" }; // 逗号是页面的分隔符
    if ([...t].length > 20) return { error: `标签「${t}」超过 20 个字符` }; // 按码点计，不用 .length
    const k = tagKey(t);
    if (seen.has(k)) continue; // 大小写不敏感去重，保留首次出现的原样写法
    seen.add(k);
    out.push(t);
  }
  // 数量上限在去重之后判定：重复 12 次的同一个标签是合法的 1 个标签
  if (out.length > 10) return { error: `标签最多 10 个，当前 ${out.length} 个` };
  return { tags: out };
}

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
        // 同名参数多次出现时 searchParams.get 取第一个；空串（含 ?tag= 与全空白）视为未筛选
        const raw = url.searchParams.get("tag");
        const key = raw === null ? "" : tagKey(raw);
        if (!key) return json(res, 200, { todos });
        return json(res, 200, { todos: todos.filter((t) => t.tags.some((x) => tagKey(x) === key)) });
      }
      if (url.pathname === "/api/todos" && req.method === "POST") {
        const body = await readBody(req);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return json(res, 400, { error: "title 不能为空" });
        // tags 缺省视为 []；校验顺序在 title 之后，保证既有的空标题 400 行为不变
        const normalized = normalizeTags(body.tags === undefined ? [] : body.tags);
        if (normalized.error) return json(res, 400, { error: normalized.error });
        const todo = { id: nextId++, title, done: false, tags: normalized.tags };
        todos.push(todo);
        return json(res, 201, todo);
      }
      const m = url.pathname.match(/^\/api\/todos\/(\d+)$/);
      if (m && req.method === "PATCH") {
        const todo = todos.find((t) => t.id === Number(m[1]));
        if (!todo) return json(res, 404, { error: "待办不存在" });
        const body = await readBody(req);
        // 先校验后写入：tags 非法时返回 400，done / title / tags 一个都不能被改
        let nextTags;
        if (body.tags !== undefined) {
          const n = normalizeTags(body.tags);
          if (n.error) return json(res, 400, { error: n.error });
          nextTags = n.tags;
        }
        if (typeof body.done === "boolean") todo.done = body.done;
        if (typeof body.title === "string" && body.title.trim()) todo.title = body.title.trim();
        // tags 三态：缺省 = 不改动，[] = 清空，[...] = 整体替换
        if (nextTags !== undefined) todo.tags = nextTags;
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
