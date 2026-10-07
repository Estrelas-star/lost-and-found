// src/api/comment.ts
// 评论区对接真实后端（LNF-SERVER comment 模块；api_guide.md / api_agent.md 均无 comment 章节，
// 本文件契约以后端代码为准：router/advanced/comment_router.go、model/advanced/comment.go）。
// 真实路由（前缀 /api/v1 由 request 内部拼，故 path 以 / 开头、不含 /api/v1）：
//   GET   /item/:itemID/comments          公开列表（游标分页；根评论与回复混排、按 id 倒序）
//   POST  /item/:itemID/comments/create   创建评论/回复（需登录）
//   GET   /item/:itemID/comments/replies  回复子树（公开；depth 缺省 0 → 返回空）
//   PATCH /item/:itemID/comments/update   管理员改状态（role≥1）
// 无 like / 无 delete 接口。
//
// ⚠️ 后端列表接口的已知问题与前端兜底
//   service/advanced/comment_service.go 的游标循环形如：
//       startat = started_id - loop*limit  →  反复执行「id <= startat LIMIT limit」，
//   只有「凑满 limit 条」或 `startat <= 0` 才退出，于是：
//     · 该物品评论数 < limit：上界（缺省 999999）始终大于所有评论 id → 每轮都返回同一批，
//       直到凑满 limit 条 → 前端会收到同一条评论的多次重复（store 侧按 id 去重兜底）；
//     · 该物品 0 条评论：永远凑不满，只能等 startat<=0 → 缺省参数下空转 ≈ 999999/limit 次查询。
//   兜底办法：limit 传 COMMENT_PULL_LIMIT（极大值），使第一轮 startat=999999 就把该物品全部
//   评论一次取回，第二轮 startat=0 立即返回 —— 整个请求只打 1 次数据库。
//   待后端修复（某批返回条数 < limit 即结束循环，或改成 id < lastId 的真游标）后，
//   把 limit 调回常规值（例如 100）即可，store 里的去重逻辑可保留。
import { request } from './http'

/** comment 段错误码：评论不存在（common_response_code.md） */
export const COMMENT_NOT_FOUND = 110001

export interface CommentDTO {
  id: number
  item_id: number
  user_id: number
  /** 父评论 id：后端字段是 int64，**0 表示根评论**（不是 null） */
  parent_id: number
  content: string
  created_at: string
  updated_at: string
}

export interface CommentListResult {
  total: number
  comment_dtos: CommentDTO[]
}

/** 一次性拉全某物品评论所用的 limit（原因见文件头；不要改成 0，后端 limit=0 时只返回 1 条） */
export const COMMENT_PULL_LIMIT = 999999

/**
 * 创建评论 / 回复（需登录）。
 * 注意两点后端细节：① 以 **body.item_id** 为准，路径参数不参与业务校验；
 * ② `user_id` 带 binding:"required"，必须传本人 id（非 0）——服务端随后会用登录态覆盖它。
 */
export async function createComment(body: {
  item_id: number
  user_id: number
  parent_id?: number
  content: string
}): Promise<void> {
  await request(`/item/${body.item_id}/comments/create`, {
    method: 'POST',
    body: JSON.stringify({ ...body, parent_id: body.parent_id ?? 0 }),
  })
}

/** 公开获取物品评论列表（一次性拉全，limit 原因见文件头） */
export async function listComments(itemId: number): Promise<CommentListResult> {
  const res = await request<CommentListResult>(
    `/item/${itemId}/comments?started_id=0&limit=${COMMENT_PULL_LIMIT}`,
  )
  return res.data
}

/** 公开获取评论回复子树：`depth` 缺省 0 会被后端当成「不展开」→ 必须显式传 ≥1 */
export async function getCommentReplies(params: {
  itemId: number
  id: number
  depth?: number
  maxCount?: number
}): Promise<CommentListResult> {
  const q = new URLSearchParams()
  q.set('id', String(params.id))
  q.set('depth', String(params.depth ?? 1))
  q.set('max_count', String(params.maxCount ?? 100))
  const res = await request<CommentListResult>(
    `/item/${params.itemId}/comments/replies?${q.toString()}`,
  )
  return res.data
}

/** 管理员批量更新评论状态（含整棵子树）：status 0待审核 1正常 2已隐藏（role≥1） */
export async function updateCommentStatus(body: {
  itemId: number
  id: number
  status: number
}): Promise<void> {
  await request(`/item/${body.itemId}/comments/update`, {
    method: 'PATCH',
    body: JSON.stringify({ id: body.id, status: body.status }),
  })
}
