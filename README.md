# 拾光 · 校园失物招领系统

基于 Vue 3 + Vite + Pinia + Vue Router + Element Plus + ECharts 依赖配置的校园失物招领前端原型。

## 启动

```bash
npm install
npm run dev
```

## 演示角色

左侧用户卡片可切换三种角色：

- 普通学生：发现物品、筛选搜索、发布信息、管理个人发布、提交认领申请
- 失物招领管理员：审核发布信息、管理物品状态
- 系统管理员：查看数据总览、账号管理、公告管理

当前版本使用 Pinia 内存 Mock 数据演示完整交互闭环。后续接入后端时，可在 `src/stores/app.js` 的 actions 中替换为 Axios 请求。
