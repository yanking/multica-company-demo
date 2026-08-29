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
