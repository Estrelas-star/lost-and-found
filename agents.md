# agents.md

## 文档目的

本文说明本项目在开发过程中如何使用 AI 编程助手辅助完成分析、编码、调试和验证，并持续记录 AI 在近期迭代中承担的具体工作，方便后续协作、复盘与验收。

## 项目概况

- 项目名称：拾光 · 校园失物招领系统
- 项目类型：Vue 3 单页前端原型
- 构建工具：Vite
- 开发语言：TypeScript
- 状态管理：Pinia
- 路由：Vue Router，包含登录守卫与角色级访问控制（RBAC）
- UI 组件：Element Plus
- 页面交互：Vue 3 Composition API、`<script setup>`、响应式数据
- 样式方案：全局 `src/styles.css` + 组件 scoped 样式
- 当前数据：Pinia 内存 Mock 数据，刷新页面恢复初始
- 当前后端：尚未接入真实 API、数据库与真实认证；登录使用本地 Mock Token

## AI 辅助开发方式

### 1. 需求拆分

AI 将需求拆分为三个角色与一条业务主链：

- 普通学生：浏览、搜索、发布、管理自己的发布、提交认领申请、互动（点赞/收藏/评论）
- 失物招领管理员：审核发布信息、维护物品状态
- 系统管理员：查看数据总览、管理账号和公告
- 业务主链：发布信息 -> 待审核 -> 审核通过 -> 招领中 -> 认领申请 -> 已认领

### 2. 技术选型建议

根据角色权限、状态变化、筛选和统计等要求，选择 Vue 3（而非原生 HTML/JavaScript）；使用 TypeScript 约束角色、物品、认领申请、评论等领域数据；使用 Pinia 统一保存用户角色、认证状态、物品、公告、认领和评论；使用 Vue Router 管理登录页与角色路由；使用 Vite 提供开发服务器与生产构建。

### 3. TypeScript 重构

AI 将原有 JavaScript 入口、路由、store、导航配置和 Vite 配置迁移为 TypeScript，并围绕实际业务补齐类型：

- 在 `src/stores/app.ts` 定义 `Role`、`ItemType`、`ItemStatus`、`User`、`Item`、`Claim`、`Comment`。
- 为角色映射、路由角色列表和发布参数增加类型约束。
- 迁移为 `main.ts`、`AppRoot.vue`、`router.ts`、`navigation.ts`、`vite.config.ts`。
- 增加 `vue-tsc --noEmit` 并配套 `npm run type-check` 脚本。

### 4. 登录守卫与 RBAC

AI 基于「菜单隐藏不等于权限控制」的原则完成登录守卫与角色访问控制：

- `Login.vue` 保留账号密码非空校验，登录时写入本地 Mock Token 与角色，支持返回 `redirect`。
- `router.ts` 为路由增加 `requiresAuth`、`guestOnly`、`roles` 元信息。
- 未登录访问受保护路由跳转 `/login?redirect=...`；已登录访问 `/login` 跳转当前角色首页。
- 用 `Role` 类型与角色首页映射统一处理三种身份，拒绝越权访问并返回当前角色首页。
- `navigation.ts` 按角色提供菜单，保持菜单与路由权限一致。

### 5. 代码组织

按「状态层、配置层、页面层、组件层、样式层」组织：

- `src/stores/app.ts`：角色、认证、物品、公告、认领、评论与状态操作。
- `src/navigation.ts`：三角色菜单配置。
- `src/router.ts`：路由 + 元信息 + 守卫。
- `src/App.vue`：工作台容器，按角色与 `activeRoute` 渲染业务模块。
- `src/AppRoot.vue`：根组件，挂载 `RouterView`。
- `src/components/*`：`MetricCard`、`PublishForm`、`DetailDialog`、`AuditCenter`、`ManageItems`。
- `src/styles.css`：全局布局、配色、响应式与交互视觉。

## 6. 本阶段 AI 具体工作

随着项目迭代，AI 在以下方面承担了具体的实现与修复工作：

1. **图片上传美化与限制**：改写发布表单的上传为自定义预览区，支持 `el-image` 放大查看、删除与释放 Object URL；限制仅图片格式、最多 3 张，超限提示并实时校验。
2. **解决表单布局重叠**：调整发布页 el-row/el-col 栅格与表单项布局，修复多标签选择器与图片区域在换行/窄屏下的重叠问题。
3. **清理重复模块**：将审核中心、物品管理、发布表单、详情弹窗抽为独立组件（`AuditCenter.vue`、`ManageItems.vue`、`PublishForm.vue`、`DetailDialog.vue`），删除 `App.vue` 中冗余的重复模板。
4. **修复地点选择器**：将发布页地点从三级下拉改造为「校区 -> 建筑 -> 详细地址文本输入」，自动拼接「校区 · 建筑 · 详细地址」，并把详细地址的必填校验迁移到文本输入框，空时提示「请输入详细地址」。
5. **完善评论与认领弹窗**：实现详情弹窗内部滚动、评论区（发评论、楼中楼回复、取消回复、评论点赞）、申请认领弹窗（认领说明 + 材料图片上传）、举报弹窗。
6. **实现管理员表格**：实现失物招领管理员侧的审核中心与物品管理表格（缩略图、标签、状态、分页、搜索筛选），以及编辑、下架/上架、删除（二次确认）操作。

## 7. 调试与越权漏洞修复

处理过的问题：

1. `App.vue` 脚本解析错误：重查 `submitPost`、`claim` 等函数，补齐函数体、对象括号与字符串，并改为多行提升可读性。
2. Vite 将 `.vue` 当作普通 JS 解析：增加 `vite.config.ts` 注册 `@vitejs/plugin-vue`。
3. 工作台入口/直接输入地址可越权：将角色判断下沉到 Vue Router `beforeEach`，为每条业务路由声明 `roles`；工作台入口按角色跳唯一首页。
4. 地点选择器与图片上传细节：根据校验与交互反馈不断迭代，最终落地「建筑 + 详细地址」层级地址联动。

## 8. 验证方式

每次修改后优先验证：

```bash
npm run type-check
npm run build
```

类型检查通过说明 TS 与 Vue SFC 类型约束通过；生产构建通过说明模板、脚本、样式可被 Vite 正常解析。开发联调使用：

```bash
npm run dev
```

## 9. 后续 AI 协作约定

- 修改前先读取相关文件，遵循现有 Vue/Pinia/TS 风格。
- 优先修复根因，避免用隐藏错误的临时补丁。
- 修改范围保持最小，不随意重构无关代码。
- 新增功能同步更新 `README.md`、`spec.md`、`plan.md`。
- 涉及权限：同时检查菜单可见性、页面访问控制与数据操作权限。
- 涉及状态流转：明确允许的前置状态与目标状态。
- 完成修改后至少运行一次 `npm run build`。
- 权限修改后至少验证三种角色菜单、直接访问路由与登录重定向行为。

## 10. 当前限制

- 角色切换/登录为演示用途，不是真实鉴权。
- 数据在 Pinia 内存，无刷新持久化。
- 图片本地预览，未上传服务器。
- 管理员对认领申请的同意/拒绝/完成归还操作尚未接入。
- 数据大屏使用 CSS 占位图表，ECharts 尚未接入。
- 尚未拆分为 `Home.vue`/`Publish.vue`/`Posts.vue`/`Claims.vue` 等逐页路由组件（当前由 `App.vue` 承载），待后端联调时拆分。
- 移动端适配、Vercel 部署、Go 后端与真实 Token 为后续里程碑。