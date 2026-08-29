// 接口测试：node --test（无第三方依赖）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.js";

let server;
let base;

before(async () => {
  server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("空列表", async () => {
  const res = await fetch(`${base}/api/todos`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { todos: [] });
});

test("新增后可列出，并可标记完成", async () => {
  const created = await fetch(`${base}/api/todos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "写试点需求" }),
  });
  assert.equal(created.status, 201);
  const todo = await created.json();
  assert.equal(todo.title, "写试点需求");
  assert.equal(todo.done, false);

  const patched = await fetch(`${base}/api/todos/${todo.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ done: true }),
  });
  assert.equal((await patched.json()).done, true);

  const list = await (await fetch(`${base}/api/todos`)).json();
  assert.equal(list.todos.length, 1);
});

test("空标题返回 400", async () => {
  const res = await fetch(`${base}/api/todos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "  " }),
  });
  assert.equal(res.status, 400);
});

// ---- 以下为 MAC-31 新增：标签与按标签筛选 ----
// 新增用例各自起一个独立实例，避免与上面共享 server 的状态互相干扰。

// 起一个干净的服务实例跑 fn，结束后关闭
async function withApp(fn) {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, resolve));
  const url = `http://127.0.0.1:${app.address().port}`;
  try {
    await fn(url);
  } finally {
    app.close();
  }
}

const post = (url, body) =>
  fetch(`${url}/api/todos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const patch = (url, id, body) =>
  fetch(`${url}/api/todos/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const list = async (url, query = "") => (await fetch(`${url}/api/todos${query}`)).json();

// 1) 带标签创建（AC1）
test("带标签创建：返回 201 且响应含规范化后的 tags", async () => {
  await withApp(async (url) => {
    const res = await post(url, { title: "写周报", tags: ["工作", "紧急"] });
    assert.equal(res.status, 201);
    const todo = await res.json();
    assert.deepEqual(todo.tags, ["工作", "紧急"]);
    assert.equal(todo.title, "写周报");
    assert.equal(todo.done, false);
    assert.equal(typeof todo.id, "number");

    const { todos } = await list(url);
    assert.deepEqual(todos[0].tags, ["工作", "紧急"]);
  });
});

// 2) 编辑标签：整体替换与清空（AC4、AC5）
test("编辑标签：整体替换而非追加", async () => {
  await withApp(async (url) => {
    const todo = await (await post(url, { title: "买菜", tags: ["生活"] })).json();
    const res = await patch(url, todo.id, { tags: ["家务", "周末"] });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).tags, ["家务", "周末"]);
  });
});

test("编辑标签：传空数组即清空", async () => {
  await withApp(async (url) => {
    const todo = await (await post(url, { title: "买菜", tags: ["生活"] })).json();
    const res = await patch(url, todo.id, { tags: [] });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).tags, []);

    const { todos } = await list(url);
    assert.deepEqual(todos[0].tags, []);
  });
});

// 3) 按标签筛选：命中与不命中（AC8、AC9、AC11）
test("按标签筛选：命中且大小写不敏感", async () => {
  await withApp(async (url) => {
    await post(url, { title: "A", tags: ["Work"] });
    await post(url, { title: "B", tags: ["生活"] });

    const hit = await list(url, "?tag=work");
    assert.equal(hit.todos.length, 1);
    assert.equal(hit.todos[0].title, "A");

    const hitUpper = await list(url, "?tag=WORK");
    assert.equal(hitUpper.todos.length, 1);
    assert.equal(hitUpper.todos[0].title, "A");
  });
});

test("按标签筛选：零命中返回 200 与空列表", async () => {
  await withApp(async (url) => {
    await post(url, { title: "A", tags: ["工作"] });
    const res = await fetch(`${url}/api/todos?tag=不存在的标签`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { todos: [] });
  });
});

test("按标签筛选：不传或空值返回全量且顺序不变，同名参数只取第一个", async () => {
  await withApp(async (url) => {
    await post(url, { title: "A", tags: ["工作"] });
    await post(url, { title: "B", tags: ["生活"] });
    await post(url, { title: "C" });

    const order = ["A", "B", "C"];
    assert.deepEqual((await list(url)).todos.map((t) => t.title), order);
    assert.deepEqual((await list(url, "?tag=")).todos.map((t) => t.title), order);
    assert.deepEqual((await list(url, "?tag=%20%20")).todos.map((t) => t.title), order);

    const first = await list(url, "?tag=工作&tag=生活");
    assert.deepEqual(first.todos.map((t) => t.title), ["A"]);
  });
});

// 4) 不传标签的向后兼容（AC3、AC12、AC13）
test("向后兼容：不传 tags 创建得到空数组，字段与改动前一致", async () => {
  await withApp(async (url) => {
    const res = await post(url, { title: "老客户端建的" });
    assert.equal(res.status, 201);
    const todo = await res.json();
    assert.deepEqual(Object.keys(todo).sort(), ["done", "id", "tags", "title"]);
    assert.equal(todo.id, 1);
    assert.equal(todo.title, "老客户端建的");
    assert.equal(todo.done, false);
    assert.deepEqual(todo.tags, []);
  });
});

test("向后兼容：只传 done 时标签保持不变", async () => {
  await withApp(async (url) => {
    const todo = await (await post(url, { title: "写周报", tags: ["工作"] })).json();
    const patched = await (await patch(url, todo.id, { done: true })).json();
    assert.equal(patched.done, true);
    assert.deepEqual(patched.tags, ["工作"]);

    const renamed = await (await patch(url, todo.id, { title: "写月报" })).json();
    assert.equal(renamed.title, "写月报");
    assert.deepEqual(renamed.tags, ["工作"]);
  });
});

// 5) 标签规范化：trim / 丢空 / 大小写去重（AC15）
test("标签规范化：去空白、丢弃空项、大小写不敏感去重并保留首次写法", async () => {
  await withApp(async (url) => {
    const todo = await (
      await post(url, { title: "规范化", tags: [" 工作 ", "", "  ", "Work", "work", "生活"] })
    ).json();
    assert.deepEqual(todo.tags, ["工作", "Work", "生活"]);
  });
});

test("标签规范化：数量上限在去重之后判定", async () => {
  await withApp(async (url) => {
    const res = await post(url, { title: "重复标签", tags: Array(12).fill("同一个") });
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).tags, ["同一个"]);
  });
});

// 6) 非法标签 400，且 400 后数据未被修改（AC16）
test("非法标签：各类输入返回 400 与约定文案", async () => {
  await withApp(async (url) => {
    const cases = [
      [{ title: "t", tags: "工作" }, "tags 必须是字符串数组"],
      [{ title: "t", tags: null }, "tags 必须是字符串数组"],
      [{ title: "t", tags: ["工作", 1] }, "tags 的每一项必须是字符串"],
      [{ title: "t", tags: ["a,b"] }, "标签不能包含英文逗号"],
      [{ title: "t", tags: ["一".repeat(21)] }, `标签「${"一".repeat(21)}」超过 20 个字符`],
      [
        { title: "t", tags: Array.from({ length: 11 }, (_, i) => `标签${i}`) },
        "标签最多 10 个，当前 11 个",
      ],
    ];
    for (const [body, error] of cases) {
      const res = await post(url, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(await res.json(), { error });
    }
    // 长度按码点计：20 个字符合法，emoji 也按码点算一个
    assert.equal((await post(url, { title: "t", tags: ["一".repeat(20)] })).status, 201);
    assert.equal((await post(url, { title: "t", tags: ["🎉".repeat(20)] })).status, 201);
    // title 校验仍先于 tags 校验（AC14）
    const both = await post(url, { title: "  ", tags: "工作" });
    assert.equal(both.status, 400);
    assert.deepEqual(await both.json(), { error: "title 不能为空" });
  });
});

test("非法标签：PATCH 返回 400 时 done / title / tags 一个都没被改", async () => {
  await withApp(async (url) => {
    const todo = await (await post(url, { title: "原标题", tags: ["工作"] })).json();
    const res = await patch(url, todo.id, { done: true, title: "新标题", tags: "工作" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "tags 必须是字符串数组" });

    const { todos } = await list(url);
    assert.deepEqual(todos[0], { id: todo.id, title: "原标题", done: false, tags: ["工作"] });
  });
});

// ---- 以下为 MAC-28 补充：测试工程师按 AC 追加的用例 ----

// TC3 补（AC4）：整体替换标签时，id / title / done 必须不变，且列表侧同步
test("编辑标签：整体替换时 id / title / done 不变且列表同步", async () => {
  await withApp(async (url) => {
    const todo = await (await post(url, { title: "买菜", tags: ["工作"] })).json();
    const res = await patch(url, todo.id, { tags: ["生活", "购物"] });
    assert.equal(res.status, 200);
    const patched = await res.json();
    assert.deepEqual(patched, { id: todo.id, title: "买菜", done: false, tags: ["生活", "购物"] });
    assert.ok(!patched.tags.includes("工作"));

    const { todos } = await list(url);
    assert.deepEqual(todos, [{ id: todo.id, title: "买菜", done: false, tags: ["生活", "购物"] }]);
  });
});

// TC8（AC12）：老客户端全流程「创建 → 列出 → 标记完成」，原有三字段的名称/类型/取值不变
test("向后兼容：老客户端创建 → 列出 → 标记完成 全流程字段一致", async () => {
  await withApp(async (url) => {
    const created = await (await post(url, { title: "老客户端" })).json();
    assert.equal(typeof created.id, "number");
    assert.equal(typeof created.title, "string");
    assert.equal(typeof created.done, "boolean");
    assert.equal(created.id, 1);
    assert.equal(created.title, "老客户端");
    assert.equal(created.done, false);

    const { todos } = await list(url);
    assert.equal(todos.length, 1);
    assert.deepEqual(Object.keys(todos[0]).sort(), ["done", "id", "tags", "title"]);
    assert.equal(todos[0].id, created.id);
    assert.equal(todos[0].title, "老客户端");
    assert.equal(todos[0].done, false);

    const res = await patch(url, created.id, { done: true });
    assert.equal(res.status, 200);
    const done = await res.json();
    assert.equal(done.id, created.id);
    assert.equal(done.title, "老客户端");
    assert.equal(done.done, true);
  });
});

// TC12 补（AC16）：POST 非法 tags 返回 400 后，列表中不得产生该待办、id 不被消耗
test("非法标签：POST 400 后列表中不产生该待办", async () => {
  await withApp(async (url) => {
    const bad = [
      { title: "脏数据", tags: "工作" },
      { title: "脏数据", tags: null },
      { title: "脏数据", tags: ["工作", 1] },
      { title: "脏数据", tags: ["a,b"] },
      { title: "脏数据", tags: ["一".repeat(21)] },
      { title: "脏数据", tags: Array.from({ length: 11 }, (_, i) => `标签${i}`) },
    ];
    for (const body of bad) {
      assert.equal((await post(url, body)).status, 400, JSON.stringify(body));
      assert.deepEqual((await list(url)).todos, [], JSON.stringify(body));
    }
    // 前面的 400 不应消耗自增 id
    const ok = await (await post(url, { title: "正常" })).json();
    assert.equal(ok.id, 1);
  });
});

// TC14（AC16 / 契约三态表）：PATCH tags 为 null 是 400，不是「清空」
test("非法标签：PATCH tags 为 null 返回 400 且待办未被修改", async () => {
  await withApp(async (url) => {
    const todo = await (await post(url, { title: "写周报", tags: ["工作"] })).json();
    const res = await patch(url, todo.id, { tags: null });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "tags 必须是字符串数组" });

    const { todos } = await list(url);
    assert.deepEqual(todos[0], { id: todo.id, title: "写周报", done: false, tags: ["工作"] });
  });
});
