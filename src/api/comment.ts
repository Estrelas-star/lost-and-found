// src/api/comment.ts
// 评论区对接真实后端（LNF-SERVER comment 模块，契约见 model/advanced/comment.go）
// 真实路由（前缀 /api/v1 由 request 内部拼，故 path 以 / 开头、不含 /api/v1）：
//   GET  /item/:item_id/comments          公开列表（游标分页）
//   POST /item/:item_id/comments/create   创建评论/回复（需登录）
//   GET  /item/:item_id/comments/replies  回复子树（公开）
//   PATCH /item/:item_id/comments/update  管理员改状态（admin）
// 无 like / 无 delete 接口。
import { request } from './http'

export interface CommentDTO {
  id: number
  item_id: number
  user_id: number
  parent_id?: number | null
  content: string
  created_at: string
  updated_at: string
}

export interface CommentListResult {
  total: number
  comment_dtos: CommentDTO[]
}

// 创建评论/回复（需登录）
export async function createComment(body: {
  item_id: number
  user_id: number
  parent_id?: number | null
  content: string
}): Promise<void> {
  await request(`/item/${body.item_id}/comments/create`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// 公开获取物品评论列表（游标分页）
export async function listComments(params: {
  item_id: number
  started_id?: number
  limit?: number
}): Promise<CommentListResult> {
  const q = new URLSearchParams()
  if (params.started_id != null) q.set('started_id', String(params.started_id))
  if (params.limit != null) q.set('limit', String(params.limit))
  return (await request<CommentListResult>(`/item/${params.item_id}/comments?${q.toString()}`)).data
}

// 公开获取评论回复子树
export async function getCommentReplies(params: {
  item_id: number
  id: number
  depth?: number
  max_count?: number
}): Promise<CommentListResult> {
  const q = new URLSearchParams()
  q.set('id', String(params.id))
  if (params.depth != null) q.set('depth', String(params.depth))
  if (params.max_count != null) q.set('max_count', String(params.max_count))
  return (await request<CommentListResult>(`/item/${params.item_id}/comments/replies?${q.toString()}`)).data
}

// 管理员批量更新评论状态（含子树）：status 0待审核 1正常 2已隐藏
export async function updateCommentStatus(body: {
  item_id: number
  id: number
  status: number
}): Promise<void> {
  await request(`/item/${body.item_id}/comments/update`, {
    method: 'PATCH',
    body: JSON.stringify({ id: body.id, status: body.status }),
  })
}
