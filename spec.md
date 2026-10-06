# 拾光校园失物招领系统功能规格说明书

## 1. 项目目标

为校园师生提供统一的失物招领信息平台，使用户可以发布、查询和认领物品；使失物招领管理员可以审核举报和维护信息；使系统管理员可以维护账号、公告和全校统计数据。前端已与 Go 后端真实 API 联调，所有业务数据均来自后端服务。

## 2. 用户角色

角色以后端返回为准（`UserResponse.role` 数字 → 前端 `Role` 映射）：`0=student`、`1=itemAdmin`、`2=systemAdmin`。

### 2.1 普通学生 `student`（后端 role = 0）

- **注册默认身份**：登录页【立即注册】与 `/register` 页开放普通学生注册，新注册用户默认 `role = 0`（无预置学生账号）。
- 浏览校园失物和招领信息
- 按关键词、物品类型、标签、地点和时间查找信息
- 查看物品详情，评论与楼中楼回复、点赞、收藏
- 发布丢失或捡到物品的信息（含图片、标签、层级地点）
- 查看和管理自己的发布记录
- 提交认领 / 捡到提交，并查看与撤销自己的认领

### 2.2 失物招领管理员 `itemAdmin`（后端 role = 1）

- **后台分配**：无预置管理员账号，由系统管理员登录后在【账号管理】通过「修改角色」将普通学生提升为失物招领管理员。
- 查看待审核发布信息，通过或驳回（帖子审核，当前后端无「待审核」状态，用演示数据兜底）
- 举报审核：查看并处理举报（通过 / 驳回 / 已处理，可填审核意见）
- 查看并维护全部物品：编辑、下架、删除（受后端权限限制，无权限时给出友好提示）

### 2.3 系统管理员 `systemAdmin`（后端 role = 2）

- 查看全校失物招领数据总览（指标、趋势、分布、热力图、漏斗、归还时长等）
- 管理系统账号：修改角色、禁用/启用、调整积分
- 管理公告：创建、编辑、置顶、下架、删除

## 3. 功能规格

### 3.1 首页与信息查询

首页展示物品卡片，卡片包含：物品名称、失物/招领类型、物品状态、地点、发布时间、描述、发布人。数据来自后端 `GET /item/list`（服务端筛选 + 分页）。

| 筛选维度 | 说明 |
| --- | --- |
| 关键词 | 匹配名称、地点、标签（后端服务端筛选） |
| 类型 | 全部 / 寻物 `lost` / 招领 `found`（映射后端 `type` 0/1） |
| 标签 | 前端标签墙多选过滤（从后端 `/tag/list` 拉取） |
| 地点 | 后端地点树级联（`/location/list`，选叶子 `location_id`） |
| 时间 | 近 3 天 / 近 7 天 / 近 30 天（前端维度） |

列表支持真分页（每页 6 条，可选 12/18），翻页重新请求后端并显示真实 `total`。

### 3.2 信息发布（PublishForm）

发布表单字段与校验规则（对接 `POST /item/create`）：

| 字段 | 控件 | 校验规则 |
| --- | --- | --- |
| 信息类型 | radio-button（丢失 `lost` / 拾取 `found`） | 必选（默认 lost） |
| 物品名称 | `el-input` | 必填，至少 2 个字符 |
| 物品标签 | 标签墙多选（`TagWall.vue`） | **必选至少 1 个**（从后端 `/tag/list` 多选） |
| 丢失/拾取地点 | `el-cascader`（后端地点树，校区 → 建筑/地点，选到叶子） | 必选，返回叶子 `location_id` |
| 详细地点信息 | `el-input` | 选填，补充如「靠窗自习室 / 桥头左侧」，写入 `location_detail` |
| 联系方式 | `el-input` | 必填，至少 5 个字符 |
| 详细描述 | `el-textarea`（支持 Markdown） | 必填，至少 10 个字符；支持拖拽/选择图片自动插入 `![图片](url)` |

发布成功即**所有人可见**（后端「创建即发布」，无审核环节），发布后自动跳转「我的发布」。

#### 地点选择（真实地点树优先）

- 进入应用时从后端 `GET /location/list` 拉取真实地点树（`parent_id` 串成层级），发布表单 / 首页筛选 / 编辑弹窗共用。
- 后端地点树不可用时，`LocationSelector.vue` 回退到写死的演示地点（朝晖/屏峰/莫干山校区 + 宿舍楼/教学楼/食堂/图书馆/精弘桥/操场/绿地广场，含楼栋、楼层、详细地址联动）。

#### 图片上传

- 经 `POST /upload/image`（multipart/form-data，字段 `file`）上传，返回相对 URL；
- 仅支持 JPG / PNG / WEBP，**单张 ≤ 5MB**，超过或类型不符给出明确提示；
- Vite 代理间歇性 502/503/504 或网络抖动时**自动重试（最多 3 次，退避 300ms→600ms）**；
- 图片插入描述后，随物品描述一起展示（详情页 Markdown 渲染）。

### 3.3 物品状态与状态流转

#### 状态定义（后端 `item.status` 只有三种，前端按类型二次展示）

| 后端 status | 前端展示（寻物 lost） | 前端展示（招领 found） | 说明 |
| --- | --- | --- | --- |
| 0 | 寻找中 | 招领中 | 在架，可被认领/捡到提交 |
| 1 | 已认领 | 已认领 | 有人认领/捡到提交，待发布者确认 |
| 2 | 已关闭 | 已关闭 | 发布者确认归还 / 发布者下架 |

> 判断「是否在架」一律使用 `isActiveStatus()`（寻找中/招领中），不要与字面量直接比较。

#### 核心状态流转（物品生命周期）

```text
发布信息（学生）——POST /item/create（创建即发布，所有人可见）
   │
   └── status = 0（在架：寻找中 / 招领中）
          │
          ├── 认领 / 我捡到了（POST /item/:id/claim，非发布者，需绑定 QQ）
          │      status 0 → 1（已认领，记录 claim_user_id）
          │
          ├── 撤销认领（POST /item/:id/claim/cancel，认领人或发布者）
          │      status 1 → 0（回到在架）
          │
          ├── 发布者确认归还（POST /item/:id/confirm，发布者）
          │      status 1 → 2（已关闭，发放积分）
          │
          └── 发布者/管理员下架（POST /item/:id/close）
                 status 0 → 2（已关闭，不再公开展示）

删除物品（POST /item/delete，逻辑删除）——从列表移除
编辑物品（POST /item/update，增量更新标题/描述/地点/标签/图片）
```

#### 认领可用状态

只有「寻找中 / 招领中」（在架）才可发起认领 / 我捡到了；「已认领」「已关闭」不可（按钮禁用）。

#### 认领前置条件（QQ 绑定）

- 认领需先绑定 QQ：后端返回错误码 `30006` 时前端提示「认领需先绑定QQ，请前往账号设置绑定」；
- 绑定流程：加入 QQ 群（群号 `1056181967`）→ 输入 QQ 号发送验证码（`POST /user/qq/get-code`）→ 输入群内验证码确认绑定（`POST /user/qq/bind`）。

### 3.4 评论

- 真实接口：`GET /item/:item_id/comments`（游标分页）、`POST /item/:item_id/comments/create`（登录可发）、`GET /item/:item_id/comments/replies`（回复子树）、`PATCH /item/:item_id/comments/update`（管理员改状态）。
- 详情弹窗内展示评论区，支持发评论、楼中楼回复（`parent_id`）、取消回复；作者暂以「用户#id」展示（后端 `CommentDTO` 暂未返回昵称/头像）。
- 后端暂无点赞/删除评论接口；点赞、收藏为纯前端交互。

### 3.5 消息通知（真实后端）

| 能力 | 说明 |
| --- | --- |
| 通知列表 | `GET /notifications?limit&offset`，列表项不含正文 |
| 未读数 | `GET /notifications/unread-count`（返回裸数字，进入应用拉取 + 60 秒轮询） |
| 查看详情 | `GET /notifications/:id`，查看即自动已读 |
| 批量已读 | `PUT /notifications/read`，body `{ ids }` |
| 批量删除 | `DELETE /notifications`，body `{ ids }`（前端单条删除 / 一键清空带二次确认） |
| 管理员广播 | `POST /admin/notifications`（`user_ids` 指定用户或 `send_to_all` 全员；非学生角色可见广播入口） |

### 3.6 公告

- **公开端**：`GET /announcement`（仅已发布，置顶优先按 id 倒序）供首页提示条与顶栏公告栏展示；`GET /announcement/:id` 详情（每次访问浏览量 +1）；「×」关闭 / 「已看」记录用 `localStorage` 记忆（`lnf-dismissed-notices` / `lnf-read-notices`），无服务端已读接口。
- **管理端**（仅系统管理员 role=2）：`GET /admin/announcement`（含已下架）、`POST /admin/announcement/create`（创建即发布）、`POST /admin/announcement/update`（增量更新）、`DELETE /admin/announcement/:id`（软删除）。
- 公告枚举：`type` 0系统公告 / 1活动公告 / 2维护通知 / 3其他；`status` 1已发布 / 2已下架；`is_top` 0否 / 1是。

### 3.7 举报审核

- 用户端：详情弹窗内可【举报】（选择原因：虚假信息/违规内容/恶意行为/其他，可填补充说明）。
- 管理端（审核中心 · 举报审核 Tab）：`GET /admin/reports` 列表 + `POST /admin/reports/:id/review` 审核，动作含通过（1）/ 驳回（2）/ 已处理（3），可填审核意见；举报状态：0待审核 / 1已通过 / 2已驳回 / 3已处理。

### 3.8 账号管理与角色分配

- 用户列表：后端无「列出全部用户」接口，前端用 `POST /user/batch`（`{ids}` 分批拉取，返回公开字段：id/昵称/角色/头像/性别/注册时间）遍历 id 拉取（每批 100，上限 500）。
- **修改角色**：`POST /admin/change-role`（body `{id, role: 0|1|2}`，仅系统管理员），可将普通学生提升为失物招领管理员或系统管理员（或降级）。
- **禁用 / 启用**：`POST /admin/change-status`（body `{id, status: 0|1}`），被禁用账号无法登录（后端返回 10006「账号已被禁用」）。
- **调整积分**：`POST /admin/add-credit`（body `{id, credit, type, description?, operator_id}`，`operator_id` 必须等于当前登录用户 id），类型含拾金不昧奖励 / 认领成功奖励 / 违规扣分 / 系统调整。

### 3.9 数据总览（系统管理员）

对接 9 个真实统计接口（`/admin/stats/*`，`role >= 1` 可访问），支持近 7 / 30 / 90 天切换与刷新：

| 模块 | 数据来源 |
| --- | --- |
| 概览四指标 | 累计发布、成功归还、待处理（含 24h 内条数）、总体归还率（含环比） |
| 近 N 日趋势 | 每日发布量 / 归还量（柱状图，CSS 自绘） |
| 物品类型分布 | 发布量 + 归还率（`dimension=type`） |
| 高频地点 | 发布数量 Top（自动按直属父级消歧） |
| 发布时段热力图 | 星期 × 小时矩阵 |
| 参与漏斗 | 注册 → 发布 → 认领 → 归还（含相邻转化率） |
| 归还时长 | 平均 / 中位数（近似估算） |
| 滞留清单 / 高浏览清单 | 滞留待处理物品、高浏览量物品列表 |


## 4. 用户认证与权限

### 4.1 注册

- 登录页【立即注册】与 `/register` 独立页均可注册；**注册字段为账号（username）、密码、昵称（nickname）**，后端校验账号 2-32 位且唯一、密码 8-20 位且含大小写+数字+符号、昵称 2-32 位。
- 新注册用户 `role` 默认 `0`（普通学生），**不提供角色选择**。
- 登录页内注册成功后自动登录进入工作台；`/register` 页注册成功后跳转登录页。

### 4.2 登录

- 登录页无身份下拉框，仅账号 + 密码；`POST /user/login` 真实校验，**Token 在响应头 `Authorization` 返回**。
- 登录成功后前端将 `token + user + expiredAt`（取 JWT `exp`，兜底 24h）写入 `localStorage`，并按 `roleMap[user.role]` 同步角色。
- 路由守卫按角色跳转：`student → /app/home`、`itemAdmin → /app/audit`、`systemAdmin → /app/dashboard`。
- 启动时 `GET /user/me` 校验会话：失效（10005/10006/2）由 `http.ts` 清空登录态并派发 `auth:expired` 事件，`AppRoot.vue` 统一登出并跳转登录页。
- 登出：`POST /user/logout`（后端失效 Token，失败也照退）+ 清空本地登录态。

### 4.3 内置账号

系统初始**仅预置 `sysadmin / 123456`**（后端初始化，系统管理员 role=2），普通学生与失物招领管理员均无预置账号；`sysadmin` 不可被前端注册（账号唯一校验）。

### 4.4 双层权限控制

1. **菜单层**：`src/navigation.ts` 按角色返回菜单，`App.vue` 的 `visibleNavItems` 仅渲染当前角色菜单。
2. **路由层**：`src/router.ts` 的 `beforeEach` 校验 `meta.roles`，拦截直接输入地址等越权行为。

### 4.5 角色权限矩阵

| 菜单/路由 | 学生 | 失物招领管理员 | 系统管理员 |
| --- | ---: | ---: | ---: |
| 发现物品 `/app/home` | ✓ | — | — |
| 发布信息 `/app/publish` | ✓ | — | — |
| 我的发布 `/app/posts` | ✓ | — | — |
| 我的认领 `/app/claims` | ✓ | — | — |
| 审核中心 `/app/audit` | — | ✓ | — |
| 物品管理 `/app/manage` | — | ✓ | — |
| 数据总览 `/app/dashboard` | — | — | ✓ |
| 账号管理 `/app/users` | — | — | ✓ |
| 公告管理 `/app/notices` | — | — | ✓ |

> 前端 RBAC 仅用于体验；真实后端对每个接口二次鉴权（Token、角色、数据操作权限）。

## 5. TypeScript 实现要求

- 入口、路由、Pinia store、Vite 配置均使用 TypeScript。
- 领域类型定义于 `src/stores/app.ts`（`Role`、`ItemType`、`ItemStatus`、`Item` 等）与 `src/api/types.ts` / `src/api/*.ts`（`UserResponse`、`CreateUserRequest`、`ItemDTO`、`CommentDTO`、`NotificationItem`、`AnnouncementItem`、统计响应等）。
- 使用 `vue-tsc --noEmit`（`npm run type-check`）进行类型检查。

## 6. 当前边界

- 帖子审核 Tab 依赖演示数据兜底（后端当前无「待审核」状态，物品创建即发布）。
- 点赞 / 收藏为纯前端交互，后端暂无对应接口；评论作者暂以「用户#id」展示。
- 公告「已读」为前端 localStorage 记忆，无服务端已读接口。
- 数据大屏为 CSS 自绘图表，ECharts 尚未接入。
- 移动端适配、Vercel 部署、图片对象存储独立域名等为后续里程碑。

