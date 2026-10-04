// src/api/comment.ts
// 评论区对接真实后端（LNF-SERVER comment 模块，契约见 model/advanced/comment.go）
//
// ⚠️ 当前部署后端（111.229.234.32:8080）状态（2026-10-04 核实）：
//   - comment_handler.go 仍是空壳、router/enter.go 未注册 CommentRouter；
//   - service 仅 CreateComment 有实现，List / Like / Delete 均未实现。
//   因此这些调用目前多会 404 / 失败。调用方（stores/app.ts）已做 mock 兜底，
//   后端就绪后前端无需改动，仅需核对下方路径前缀与各字段即可。
//
// 路径按 Go REST 常规约定书写；若洪烨实际路由不同，集中改这里即可。
// 注意：request() 内部已拼 /api/v1 前缀，故 path 以 / 开头、不含 /api/v1。
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

export async function createComment(body: {
  item_id: number
  user_id: number
  parent_id?: number | null
  content: string
}): Promise<CommentDTO> {
  return (
    await request<CommentDTO>('/comment', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data
}

export async function listComments(params: {
  item_id: number
  started_id?: number
  limit?: number
}): Promise<CommentListResult> {
  const q = new URLSearchParams()
  q.set('item_id', String(params.item_id))
  if (params.started_id != null) q.set('started_id', String(params.started_id))
  if (params.limit != null) q.set('limit', String(params.limit))
  return (await request<CommentListResult>(`/comment?${q.toString()}`)).data
}

export async function likeComment(id: number): Promise<CommentDTO> {
  return (await request<CommentDTO>(`/comment/${id}/like`, { method: 'POST' })).data
}

export async function deleteComment(id: number): Promise<{ id: number }> {
  return (await request<{ id: number }>(`/comment/${id}`, { method: 'DELETE' })).data
}
