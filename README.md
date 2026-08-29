# multica-company-demo

AI 软件公司流水线的试点项目：一个零依赖的 Node 待办应用（内存存储）。

## 运行
```bash
npm start        # http://localhost:3000
npm test         # node --test
```

## 接口
- `GET /api/todos` → `{ todos: [{ id, title, done }] }`
- `POST /api/todos` `{ title }` → 201 待办
- `PATCH /api/todos/:id` `{ done?, title? }` → 待办

## 约束
- 不引入第三方依赖；Node ≥22。
- 变更走 PR，CI 通过后由代码评审员合并。
