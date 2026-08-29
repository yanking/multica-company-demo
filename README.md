# multica-company-demo

AI 软件公司流水线的试点项目：一个零依赖的 Node 待办应用（内存存储）。

## 运行
```bash
npm start        # http://localhost:3000
npm test         # node --test
```

## 接口
- `GET /api/todos[?tag=<标签>]` → `{ todos: [{ id, title, done, tags: string[] }] }`。`tag` 可选，按单个标签精确筛选（大小写不敏感）；不传或传空值返回全量；零命中返回 `{ todos: [] }`（200，非错误）。
- `POST /api/todos` `{ title, tags?: string[] }` → 201 待办。`tags` 缺省视为 `[]`。
- `PATCH /api/todos/:id` `{ done?, title?, tags?: string[] }` → 待办。`tags` 三态：字段缺省＝不改动已有标签；传 `[]`＝清空；传数组＝整体替换（不是合并）。

标签规则：每个待办可有多个标签，元素为字符串；服务端会自动去首尾空白、丢弃空白项、按大小写不敏感去重（保留首次出现的原样写法）；单个标签 1–20 个字符（按码点计）；最多 10 个（去重后计数）；标签内不能包含英文逗号；不满足以上任一规则时接口返回 `400 { error }`。

## 约束
- 不引入第三方依赖；Node ≥22。
- 变更走 PR，CI 通过后由代码评审员合并。

## 预发环境（staging）
- 托管：运行时主机本机（ip-172-31-27-66），`systemd --user` 服务 `multica-company-demo-staging`，固定检出目录 `~/apps/multica-company-demo`，端口 3100。
- 部署最新主干：`bash deploy/staging.sh`；回滚：`bash deploy/staging.sh <commit-sha>`（幂等，可反复执行）。
- 健康检查：`curl -fsS http://127.0.0.1:3100/api/todos`；日志：`journalctl --user -u multica-company-demo-staging -n 50`；停止：`systemctl --user stop multica-company-demo-staging`。
- 流水线约定：S6「部署预发与发布说明」由运维发布智能体在合并后执行上面的部署命令并贴出健康检查输出；不部署生产。
