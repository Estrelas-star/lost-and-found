// src/api/agent.ts
// Agent 智能助手：对话式发帖 / 自然语言找匹配 / 表单智能填充 / 详情页相似推荐
// 契约来源：LNF-SERVER/agent.md/api_agent.md §7、api_guide.md §十三
//   · POST /agent/chat          主入口（需登录）：发帖（两步确认）/ 找匹配 / 闲聊兜底
//   · POST /agent/match         只读匹配：不建会话、不建帖、无副作用
//   · POST /agent/extract       只读抽取：给发帖表单「AI 帮写」智能填充
//   · POST /agent/session/close 关闭当前会话（幂等）
//   · GET  /item/:itemID/similar 详情页相似推荐（无需登录，纯 SQL，不调用 LLM）
import { request } from './http'
import type { ItemDTO } from './item'

/** 草稿：字段与 /item/create 对齐，tag_ids 必定来自 tags 表，可直接提交给 /item/create */
export interface AgentDraft {
  type: number                    // 0 失物 / 1 招领
  title: string
  description?: string
  tag_ids?: number[]              // 一定来自 tags 表，可直接提交
  tag_names?: string[]            // 仅供展示
  location_id?: number | null     // 可为 null（建帖时后端补 140「其他地点」）
  location_name?: string          // 地点全链，如「屏峰校区/图书馆」
  location_detail?: string        // 只放链路表达不了的细节（楼层/门牌），展示时不要与全链重复拼接
  contact?: string                // 仅当用户明确给出时存在（API 侧不兜底 QQ）
  lost_found_time?: string
  time_from?: string
  time_to?: string
  missing_fields?: AgentMissingField[]
  followup_question?: string
}

/** draft.missing_fields[] 取值 */
export type AgentMissingField = 'item' | 'location' | 'location_detail' | 'time' | 'contact' | 'color' | 'features'

/** 候选匹配项：item 即标准 ItemResponse，可直接复用现有列表卡片组件 */
export interface AgentMatchBrief {
  item_id: number
  score: number                   // [0,1]
  reasons?: string[]
  risk?: string[]
  item: ItemDTO
}

/** /agent/chat 的 stage 枚举（前端按此分支渲染） */
export type AgentStage = 'need_confirm' | 'created' | 'matched' | 'no_match' | 'chitchat' | 'cancelled'
export type AgentIntent = 'create_lost' | 'create_found' | 'match' | 'chitchat' | 'other'
export type AgentAction = 'auto' | 'confirm' | 'cancel'
export type AgentVerdict = 'strong_match' | 'ambiguous' | 'no_match'

/** POST /agent/chat 响应：questions / matches / similar 恒为数组（无内容为 []，不是 null） */
export interface AgentChatResponse {
  session_id: string
  stage: AgentStage
  reply: string
  intent: AgentIntent
  questions: string[]
  matches: AgentMatchBrief[]
  similar: AgentMatchBrief[]
  draft?: AgentDraft
  created_item_id?: number | null
}

/** POST /agent/match 响应（只读；未命中时 matches=[] 且仍为 code=0） */
export interface AgentMatchResponse {
  intent: AgentIntent
  entities?: Record<string, unknown>
  matches: AgentMatchBrief[]
  similar: AgentMatchBrief[]
  summary?: string
  verdict: AgentVerdict
}

/** POST /agent/extract 响应（只读，供发帖表单智能填充） */
export interface AgentExtractResponse {
  intent: AgentIntent
  is_lnf_context: boolean
  draft?: AgentDraft
  missing_fields?: AgentMissingField[]
  questions?: string[]
}

export interface AgentChatParams {
  session_id?: string              // 首轮不传；第二轮必须原样回传
  text: string                     // ≤ 500 字符
  image_urls?: string[]            // ≤ 3 张；'/' 开头视为本站相对路径，也接受公网 URL
  action?: AgentAction             // auto（默认）/ confirm / cancel
}

/**
 * LLM 单次耗时 2~8 秒，契约要求请求超时 ≥ 30 秒。
 * 三个 /agent/* 接口共享「每用户 10 次/分钟 + 全系统 30 次/分钟」限流（超限 120004）。
 */
export const LLM_TIMEOUT_MS = 30000

/**
 * 主入口：POST /agent/chat（需登录）
 * 会话严格模式：一个用户同时只有 1 个会话；不带 session_id = 新建并【覆盖】旧会话；
 * 带错/过期 session_id → 120001 且不会自动新建；TTL 30 分钟；单会话最多 3 轮用户消息。
 */
export function chatAgent(params: AgentChatParams) {
  return request<AgentChatResponse>('/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ action: 'auto', ...params }),
    timeoutMs: LLM_TIMEOUT_MS,
  })
}

/** 只读匹配：POST /agent/match（top_n 默认 3、最大 10；不建会话、不建帖、无副作用） */
export function matchAgent(params: { text: string; image_urls?: string[]; top_n?: number }) {
  return request<AgentMatchResponse>('/agent/match', {
    method: 'POST',
    body: JSON.stringify({ top_n: 3, ...params }),
    timeoutMs: LLM_TIMEOUT_MS,
  })
}

/** 只读抽取：POST /agent/extract，用于发帖表单「AI 帮写」智能填充（不建帖，最后仍走 /item/create） */
export function extractAgent(params: { text: string; image_urls?: string[] }) {
  return request<AgentExtractResponse>('/agent/extract', {
    method: 'POST',
    body: JSON.stringify(params),
    timeoutMs: LLM_TIMEOUT_MS,
  })
}

/** 关闭当前会话（幂等）：POST /agent/session/close，session_id 可空 */
export function closeAgentSession(session_id?: string) {
  return request<null>('/agent/session/close', {
    method: 'POST',
    body: JSON.stringify({ session_id: session_id ?? '' }),
  })
}

/**
 * 详情页相似推荐（无需登录）：GET /item/:itemID/similar?limit=n
 * 同类型优先、相反类型补齐，不含自身；按「标签命中 + 地点全链 + 全文相关度 + 时间」排序；不调用 LLM
 * 物品不存在/已删除 → 20001
 */
export function getSimilarItems(itemID: number, limit = 5) {
  return request<ItemDTO[]>(`/item/${itemID}/similar?limit=${limit}`)
}
