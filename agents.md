# agents.md

## 文档目的

本文说明本项目在开发过程中如何使用 AI 编程助手辅助完成分析、编码、调试和验证，并记录项目当前的技术约束，方便后续协作与验收。

## 项目概况

- 项目名称：拾光 · 校园失物招领系统
- 项目类型：Vue 3 单页前端原型
- 构建工具：Vite
- 开发语言：TypeScript
- 状态管理：Pinia
- 路由：Vue Router，包含登录守卫和角色级访问控制
- UI 组件：Element Plus
- 页面交互：Vue 3 Composition API、`<script setup>`、响应式数据
- 样式方案：独立 CSS 文件 `src/styles.css`
- 当前数据：Pinia 内存 Mock 数据，刷新页面后会恢复初始数据
- 当前后端：尚未接入真实 API、数据库和真实身份认证；当前登录使用本地 Mock Token

## AI 辅助开发方式

### 1. 需求拆分

AI 首先将作业要求拆分为三个角色和一条业务主链：

- 普通学生：浏览、搜索、发布、管理自己的发布、提交认领申请
- 失物招领管理员：审核发布信息、维护物品状态
- 系统管理员：查看数据总览、管理账号和公告
- 业务主链：发布信息 -> 待审核 -> 审核通过 -> 招领中 -> 认领申请 -> 已认领

### 2. 技术选型建议

根据角色权限、状态变化、筛选和统计等要求，选择 Vue 3 而不是原生 HTML/JavaScript；使用 TypeScript 约束角色、物品和认领申请等领域数据；使用 Pinia 统一保存用户角色、认证状态、物品列表、公告和认领申请；使用 Vue Router 管理登录页和角色路由；使用 Vite 提供开发服务器和生产构建能力。

### 3. TypeScript 迁移

AI 协助将原有 JavaScript 入口、路由、store、导航配置和 Vite 配置迁移为 TypeScript，并围绕实际业务补充类型：

- 在 `src/stores/app.ts` 中定义 `Role`、`ItemType`、`ItemStatus`、`User`、`Item` 和 `Claim`。
- 为角色用户映射、路由角色列表和发布参数增加类型约束。
- 将入口、路由和 Vite 配置迁移为 `main.ts`、`router.ts`、`vite.config.ts`，并增加 `vue-tsc --noEmit` 类型检查脚本。
- 使用 `npm run type-check` 和 `npm run build` 验证迁移结果。

### 4. 登录守卫与 RBAC

AI 根据“菜单隐藏不能等同于权限控制”的风险，协助完成了登录守卫和角色访问控制：

- 在 `src/views/Login.vue` 中保留账号、密码非空校验，调用 store 写入本地 Mock Token，并支持登录后回到 `redirect` 地址。
- 在 `src/router.ts` 中为路由增加 `requiresAuth`、`guestOnly` 和 `roles` 元信息。
- 对未登录访问受保护路由的情况跳转到 `/login?redirect=...`；已登录访问 `/login` 时跳转到当前角色首页。
- 用 `Role` 类型和角色首页映射统一处理 `student`、`itemAdmin`、`systemAdmin` 三种身份。
- 检查目标路由允许的角色，拒绝越权访问并返回当前角色首页。
- 在 `src/navigation.ts` 中按角色提供菜单，确保界面菜单和路由权限保持一致。

### 5. 代码生成与组织

AI 按照“状态层、配置层、页面层、组件层、样式层”组织代码：

- `src/stores/app.ts`：集中管理角色、认证状态、物品、公告、认领申请和状态操作
- `src/navigation.ts`：定义三种角色的菜单配置
- `src/router.ts`：定义页面路由、路由元信息和登录/RBAC 守卫
- `src/App.vue`：根据当前角色和页面状态渲染工作台、表单、列表、弹窗和管理页面
- `src/components/MetricCard.vue`：抽取统计指标卡片，减少重复模板
- `src/styles.css`：统一负责布局、颜色、响应式和交互视觉

### 6. 调试与越权漏洞修复

开发过程中曾出现两类问题，处理方式如下：

1. `App.vue` 脚本区域出现解析错误：重新检查 `submitPost` 和 `claim` 函数，补齐函数体、对象括号和字符串，并改为多行格式提高可读性。
2. Vite 将 `.vue` 文件当作普通 JavaScript 解析：增加 `vite.config.ts`，注册 `@vitejs/plugin-vue` 插件。
3. 工作台入口原先可能让用户通过切换状态或直接输入地址进入其他角色页面：将角色判断下沉到 Vue Router `beforeEach`，并为每条业务路由声明允许角色；同时让工作台入口按角色跳转到唯一首页，修复越权切换漏洞。

### 7. 验证方式

每次修改后优先进行以下验证：

```bash
npm run type-check
npm run build
```

类型检查成功说明 TypeScript 和 Vue SFC 的类型约束通过；生产构建成功说明 Vue SFC、模板、脚本和样式可以被 Vite 正常解析。开发联调使用：

```bash
npm run dev
```

## 后续 AI 协作约定

- 修改前先读取相关文件，遵循现有 Vue 和 Pinia 风格。
- 优先修复根因，避免用隐藏错误的临时补丁。
- 修改范围保持最小，不随意重构无关代码。
- 新增功能应同步更新 `spec.md` 和 `plan.md`。
- 涉及权限时，同时检查菜单可见性、页面访问控制和数据操作权限。
- 涉及状态流转时，明确列出允许的前置状态和目标状态。
- 完成修改后至少运行一次 `npm run build`。
- 权限修改后至少验证三种角色的菜单、直接访问路由和登录重定向行为。

## 当前限制

- 当前角色切换是演示用的前端切换，不是真实登录鉴权。
- 数据保存在 Pinia 内存中，不具备刷新持久化能力。
- 图片上传控件目前是界面占位，尚未上传到服务器。
- `vue-router` 已实现登录守卫和前端 RBAC；当前所有业务页面仍由 `App.vue` 承载，后续可继续拆分为独立页面组件。
- `element-plus`、`echarts` 已列入依赖，当前界面部分组件使用自定义 HTML/CSS，统计图仍使用轻量 CSS 柱状图演示，ECharts 大屏尚未接入。
