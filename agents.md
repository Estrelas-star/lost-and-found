# agents.md

## 文档目的

本文说明本项目在开发过程中如何使用 AI 编程助手辅助完成分析、编码、调试和验证，并持续记录 AI 在近期迭代中承担的具体工作，方便后续协作、复盘与验收。

## 项目概况

- 项目名称：拾光 · 校园失物招领系统
- 项目类型：Vue 3 单页前端（已与 Go 后端真实 API 联调）
- 构建工具：Vite（`/api`、`/uploads` 代理到 `http://111.229.234.32:8080`）
- 开发语言：TypeScript
- 状态管理：Pinia
- 路由：Vue Router，包含登录守卫与角色级访问控制（RBAC）
- UI 组件：Element Plus
- 页面交互：Vue 3 Composition API、`<script setup>`、响应式数据
- 样式方案：全局 `src/styles.css` + 组件 scoped 样式
- 鉴权：登录返回 JWT（存 `localStorage`，24h 过期，后端 6h 续期经响应头静默更新）；会话失效统一派发 `auth:expired` 事件登出
- 当前数据：物品、评论、通知、公告、统计、账号等业务数据全部来自真实后端接口；系统初始仅预置 `sysadmin / 123456`，普通学生由注册产生，管理员由系统管理员分配角色
- 当前后端：Go 后端（`http://111.229.234.32:8080`）已联调，前端通过 `src/api/*` 封装全部业务接口

## AI 辅助开发方式

### 1. 需求拆分

AI 将需求拆分为三个角色与一条业务主链：

- 普通学生：浏览、搜索、发布、管理自己的发布、提交认领、互动（评论/点赞/收藏）
- 失物招领管理员：帖子与举报审核、维护物品状态
- 系统管理员：查看数据总览、管理账号（角色/禁用/积分）和公告
- 业务主链：注册 → 发布信息（创建即发布）→ 寻找中/招领中 → 认领/我捡到了 → 已认领 → 发布者确认 → 已关闭

### 2. 技术选型建议

根据角色权限、状态变化、筛选和统计等要求，选择 Vue 3（而非原生 HTML/JavaScript）；使用 TypeScript 约束角色、物品、认领、评论等领域数据；使用 Pinia 统一保存用户角色、认证状态与业务状态；使用 Vue Router 管理登录页与角色路由；使用 Vite 提供开发服务器与生产构建并配置后端代理。

### 3. TypeScript 重构

AI 将原有 JavaScript 入口、路由、store、导航配置和 Vite 配置迁移为 TypeScript，并围绕实际业务补齐类型：

- 在 `src/stores/app.ts` 定义 `Role`、`ItemType`、`ItemStatus`、`User`、`Item`、`Claim`、`Comment`。
- 在 `src/api/` 定义后端契约类型：`UserResponse`、`CreateUserRequest`、`ItemDTO`、`CommentDTO`、`NotificationItem`、`AnnouncementItem`、统计响应等。
- 迁移为 `main.ts`、`AppRoot.vue`、`router.ts`、`navigation.ts`、`vite.config.ts`。
- 增加 `vue-tsc --noEmit` 并配套 `npm run type-check` 脚本。

### 4. 登录守卫与 RBAC

AI 基于「菜单隐藏不等于权限控制」的原则完成登录守卫与角色访问控制：

- `Login.vue` 去除身份下拉框，通过真实账号密码匹配登录，支持返回 `redirect`；登录页内嵌注册，`Register.vue` 提供独立注册页。
- `router.ts` 为路由增加 `requiresAuth`、`guestOnly`、`roles` 元信息；`/register` 为免登录公开路由。
- 未登录访问受保护路由跳转 `/login?redirect=...`；已登录访问 `/login` 跳转当前角色首页。
- 用 `Role` 类型与角色首页映射统一处理三种身份，拒绝越权访问并返回当前角色首页。
- 角色以服务端返回为准（登录 / `GET /user/me` 时 `roleMap` 同步），`localStorage.role` 仅作未登录兜底。
- `navigation.ts` 按角色提供菜单，保持菜单与路由权限一致。

### 5. 代码组织

按「接口层、状态层、配置层、页面层、组件层、工具层」组织：

- `src/api/*`：后端接口封装（http 统一请求 / 用户 / 物品 / 评论 / 通知 / 公告 / 统计 / 上传）。
- `src/stores/app.ts`：认证、物品、通知、公告、评论与状态操作。
- `src/navigation.ts`：三角色菜单配置。
- `src/router.ts`：路由 + 元信息 + 守卫。
- `src/App.vue`：工作台容器，按角色与 `activeRoute` 渲染业务模块。
- `src/AppRoot.vue`：根组件，挂载 `RouterView`，监听 `auth:expired` 统一登出。
- `src/views/`：`Login.vue`（登录 + 内嵌注册）、`Register.vue`。
- `src/components/*`：`MetricCard`、`PublishForm`、`DetailDialog`、`AuditCenter`、`ManageItems`、`EditItemDialog`、`UserSettingsDialog`、`NotificationBell`、`AnnouncementBell`、`AnnouncementManager`、`AdminUsers`、`Dashboard`、`LocationSelector`、`TagWall`。
- `src/utils/`：`auth.ts`（JWT 存储/解码/续期）、`markdown.ts`、`image.ts`（图片地址解析）。
- `src/styles.css`：全局布局、配色、响应式与交互视觉。

## 6. 本阶段 AI 具体工作

随着项目迭代，AI 在以下方面承担了具体的实现与修复工作：

1. **真实 API 联调（核心）**：新增 `src/api/` 接口层，将注册、登录、登出、会话校验、物品发布/列表/我的发布/详情/编辑/删除/下架、认领/撤销/确认、图片上传、评论、通知、公告、举报、统计、账号管理等全部业务从本地 Mock 迁移到真实后端接口（`/api/v1`，JWT 鉴权）。
2. **统一请求层与错误处理**：`http.ts` 统一解析 `{code, message, data}` 信封；`code===0` 成功；`10005`（Token 禁用）/`10006`（账号禁用）/`code===2 且无 Token` 时清空登录态并派发 `auth:expired` 事件统一跳登录页；`code===2` 但有 Token 时提示权限不足不登出；后端 6h 续期经响应头静默更新 Token。
3. **解决 Git 分支合并冲突**：完成队友 main 分支与 t-dev 真实接口版的合并，保留真实接口版本并融合筛选栏布局（C 方案），合并后 `git status` 工作区干净、构建与类型检查通过。
4. **清理冗余日志文件**：清理 dev-server 日志等冗余文件，保持仓库干净。
5. **重构注册与认证逻辑**：登录页去除身份下拉框，改为真实账号密码匹配；登录页内嵌注册（账号+密码+昵称）与独立 `/register` 页并存；注册成功自动登录或跳转登录页；登录 / `GET /user/me` 时用 `roleMap`（0/1/2 → student/itemAdmin/systemAdmin）同步前端角色。
6. **移除默认演示账号**：删除林知夏、赵老师等预置演示账号，系统仅保留 `sysadmin / 123456`（后端初始化）；新增旧缓存过滤逻辑，读取 `localStorage` 时过滤已移除账号，防止刷新「复活」。
7. **认领流程对接真实后端**：`POST /item/:id/claim`（认领即占用）、`claim/cancel`（撤销）、`confirm`（发布者确认归还并发放积分）；认领状态以服务端 `claim_user_id` 为准，杜绝跨账号误判；未绑定 QQ（错误码 30006）时提示前往账号设置绑定。
8. **图片上传健壮性**：`/upload/image` 支持 JPG/PNG/WEBP、单张 ≤5MB；针对 Vite 代理间歇性 502/503/504 与网络抖动实现自动重试（最多 3 次、300ms→600ms 退避）；上传返回相对 URL，展示时经 `resolveImageUrl` 拼接 `VITE_IMAGE_BASE_URL`。
9. **评论对接真实后端**：`GET/POST /item/:id/comments`、回复子树、管理员改状态；评论作者暂以「用户#id」展示（后端 `CommentDTO` 暂未返回昵称/头像），并保留本地 Mock 兜底保证评论区不崩。
10. **消息通知系统对接**：`GET /notifications`（limit/offset 分页）、`unread-count`（60 秒轮询）、详情自动已读、批量已读（`PUT /notifications/read`）、批量删除（`DELETE /notifications`）；顶栏铃铛支持单条删除、一键清空（二次确认）与管理员广播入口（`POST /admin/notifications`，支持全员或指定用户）。
11. **公告系统对接**：公开公告列表/详情（浏览量 +1）供首页提示条与顶栏公告栏；公告管理对接 `GET/POST/DELETE /admin/announcement*`（创建即发布、增量更新、置顶、下架、软删除）；「已读」用 `localStorage` 记忆并做红点角标。
12. **数据大屏真实化**：系统管理员数据总览对接 9 个真实统计接口（overview/trend/locations/time-heatmap/stagnant/high-view/return-duration/distribution/funnel），支持近 7/30/90 天切换与刷新，CSS 自绘柱状图、热力图、漏斗、排名等可视化组件。
13. **账号管理对接**：`/user/batch` 分批拉取公开用户字段，支持修改角色（`/admin/change-role`）、禁用/启用（`/admin/change-status`）、调整积分（`/admin/add-credit`，类型含拾金不昧/认领成功/违规扣分/系统调整）。
14. **优化账号设置弹窗布局**：重构 `UserSettingsDialog.vue`，分「绑定 QQ / 修改资料 / 更换头像」三个分区（`el-divider` 分隔），绑定 QQ 完整流程（加入群 → 发验证码 → 确认绑定）与认领前置校验联动。
15. **清理冗余 UI 代码**：清理详情弹窗冗余按钮、历史死代码，重构发现物品筛选栏（栅格布局 + 标签墙 + 地点级联）、修复分页器间距与物品管理表格横向滚动，发布描述支持 Markdown + 图片拖拽/选择自动插入。

## 7. 调试与关键问题修复

处理过的问题：

1. `App.vue` 脚本解析错误：重查 `submitPost`、`claim` 等函数，补齐函数体、对象括号与字符串，并改为多行提升可读性。
2. Vite 将 `.vue` 当作普通 JS 解析：增加 `vite.config.ts` 注册 `@vitejs/plugin-vue`。
3. 工作台入口/直接输入地址可越权：将角色判断下沉到 Vue Router `beforeEach`，为每条业务路由声明 `roles`；工作台入口按角色跳唯一首页。
4. Vite 代理上传图片间歇 502：定位为代理层抖动而非后端业务错误，对 5xx / 网络错误自动重试，业务错误（类型/大小/权限）立即抛出。
5. 登录态误登出（随机 10005 抖动）：`http.ts` 区分「真未登录（无 Token 的 code=2）」与「带 Token 的权限不足」，避免所有接口跟着登出；同时支持响应头 Token 续期，避免 6h 后旧 Token 被拉黑掉线。
6. 跨账号认领误判：认领状态完全以服务端 `claim_user_id` 为准，移除浏览器 localStorage 缓存判定。

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

（需后端运行在 `http://111.229.234.32:8080`。）

## 9. 后续 AI 协作约定

- 修改前先读取相关文件，遵循现有 Vue/Pinia/TS 风格。
- 优先修复根因，避免用隐藏错误的临时补丁。
- 修改范围保持最小，不随意重构无关代码。
- 新增功能同步更新 `README.md`、`spec.md`、`plan.md`。
- 涉及权限：同时检查菜单可见性、页面访问控制与后端数据操作权限。
- 涉及状态流转：明确允许的前置状态与目标状态。
- 完成修改后至少运行一次 `npm run build`。
- 权限修改后至少验证三种角色菜单、直接访问路由与登录重定向行为。

## 10. 当前限制

- 帖子审核 Tab 依赖演示数据兜底（后端当前无「待审核」状态，物品创建即发布）。
- 点赞 / 收藏为纯前端交互，后端暂无对应接口；评论作者暂以「用户#id」展示（后端 `CommentDTO` 暂未返回昵称/头像）。
- 公告「已读」为前端 localStorage 记忆，无服务端已读接口。
- 数据大屏为 CSS 自绘图表，ECharts 尚未接入。
- 移动端适配、Vercel 部署、后端审核流程补充为后续里程碑。

