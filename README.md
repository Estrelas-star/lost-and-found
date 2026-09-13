# 拾光 · 校园失物招领系统

拾光是一个面向校园场景的失物招领前端原型，覆盖物品发现、信息发布、认领申请、审核管理和公告管理等核心流程。项目使用 Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus 构建，当前通过 Pinia 内存 Mock 数据演示业务闭环。

## 技术栈

- Vue 3、`<script setup>` 和 Composition API
- Vite
- TypeScript
- Pinia
- Vue Router
- Element Plus
- ECharts（已加入依赖，后续用于数据大屏）

## 启动项目

环境要求：Node.js 18+，npm 9+。

```bash
# 进入项目目录
cd lost-and-found

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器打开终端输出的本地地址即可。其他常用命令：

```bash
# TypeScript 类型检查
npm run type-check

# 生产构建
npm run build

# 预览生产构建结果
npm run preview
```

## 演示角色

登录页支持选择以下三种演示身份。当前登录仅校验账号和密码非空，并写入本地 Mock Token，不连接真实后端。

| 角色 | 可见菜单 | 主要能力 |
| --- | --- | --- |
| 普通学生 | 发现物品、发布信息、我的发布、我的认领 | 搜索物品、发布失物或招领信息、提交认领申请、查看个人记录 |
| 失物招领管理员 | 审核中心、物品管理 | 审核发布信息、查看并维护物品状态 |
| 系统管理员 | 数据总览、账号管理、公告管理 | 查看统计数据、管理账号和系统公告 |

登录后只能进入当前角色允许的工作台路由；直接访问其他角色路由会被路由守卫拦截并返回当前角色首页。

## 当前边界

当前版本的数据保存在 Pinia 内存中，刷新页面后恢复初始 Mock 数据。真实版本还需要接入 Go 后端、Token/JWT 校验、数据库、图片存储和后端权限校验。
