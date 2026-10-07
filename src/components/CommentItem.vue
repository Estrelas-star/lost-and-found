<script setup lang="ts">
// src/components/CommentItem.vue
// 评论楼层节点（**递归组件**）：linux.do 风格的树状回复。
//   · 每层按楼层排序（后端返回的是 id 倒序，DetailDialog 已统一按 id 升序排好并作为 all 传入）；
//   · 父楼层有「N 个回复 ⌄」展开按钮，**默认折叠**，展开后子楼层缩进显示并带左侧竖线；
//   · 子楼层与父楼层**完全相同的一套渲染**（头像 / 昵称 / #楼层 / 时间 / 正文 / 底部操作行），
//     只多一个「↓ 跳到回复」按钮（跳回它直接回复的那条评论）；
//   · 展开状态由 DetailDialog 统一持有（expandedIds），以便「发完回复自动展开父楼层」与「切物品重置」；
//   · 组件通过**文件名自引用**实现任意层级递归（Vue 3 SFC 内建能力），故无需再声明导入。
// 注：后端 CommentDTO 只返回 user_id，昵称 / 头像的映射在 store 的 mapToComment 中完成。
import { computed } from 'vue'
import type { Comment } from '../stores/app'

defineOptions({ name: 'CommentItem' })

const props = defineProps<{
  /** 本节点对应的评论 */
  comment: Comment
  /** 该物品的全部评论（已按楼层升序），子级由 parentId 过滤得到 */
  all: Comment[]
  /** 已展开的评论 id（展开状态由父级统一持有） */
  expandedIds: number[]
  /** 刚「跳到」的评论 id，用于高亮闪一下 */
  highlightId?: number | null
  /** 是否渲染为子回复（子回复多一个「跳到回复」按钮） */
  nested?: boolean
  /** 当前递归层级（由父级 +1 传入），配合 MAX_DEPTH 防止坏数据导致无限递归 */
  depth?: number
}>()

const emit = defineEmits<{
  reply: [comment: Comment]
  toggle: [id: number]
  jump: [id: number]
}>()

/**
 * 递归层级上限：正常情况下回复层级很浅，这里只作为**防御**——
 * 若后端出现「parent_id 指向自身 / 互相指向」的脏数据，没有上限会让前端递归到卡死。
 */
const MAX_DEPTH = 6
const currentDepth = computed(() => props.depth ?? 0)

// 直接子回复：all 已按 id 升序，filter 后天然保持楼层顺序；
// 顺带剔除 parentId 指向自身的脏数据（否则会自我递归）
const children = computed(() =>
  currentDepth.value >= MAX_DEPTH
    ? []
    : props.all.filter((c) => c.parentId === props.comment.id && c.id !== props.comment.id),
)
// 楼层号 = 它在「按 id 升序的全量评论」中的序号
const floor = computed(() => props.all.findIndex((c) => c.id === props.comment.id) + 1)
const expanded = computed(() => props.expandedIds.includes(props.comment.id))
// 子楼层顶部显示「回复 @父作者」（后端不返回被回复者，这里按 parentId 在前端查）
const parentAuthor = computed(() =>
  props.comment.parentId ? props.all.find((c) => c.id === props.comment.parentId)?.author ?? '' : '',
)

function jumpToParent() {
  const parentId = props.comment.parentId
  if (parentId) emit('jump', parentId)
}
</script>

<template>
  <article
    :id="`comment-${comment.id}`"
    class="comment-item"
    :class="{ 'comment-reply': nested, 'comment-highlight': highlightId === comment.id }"
  >
    <div class="comment-avatar">{{ comment.avatar }}</div>
    <div class="comment-body">
      <div class="comment-meta"><strong>{{ comment.author }}</strong><span class="comment-floor">#{{ floor }}</span><time>{{ comment.date }}</time></div>
      <p v-if="nested && parentAuthor" class="reply-label">回复 @{{ parentAuthor }}</p>
      <p class="comment-text">{{ comment.content }}</p>
      <div class="comment-foot">
        <button v-if="children.length" type="button" class="comment-toggle" :class="{ 'is-open': expanded }" :aria-expanded="expanded" @click="emit('toggle', comment.id)">{{ children.length }} 个回复 <span class="comment-toggle-icon">{{ expanded ? '⌃' : '⌄' }}</span></button>
        <div class="comment-actions">
          <button v-if="nested" type="button" @click="jumpToParent">↓ 跳到回复</button>
          <button type="button" @click="emit('reply', comment)">回复</button>
        </div>
      </div>
      <div v-if="children.length && expanded" class="comment-children">
        <CommentItem v-for="child in children" :key="child.id" :comment="child" :all="all" :expanded-ids="expandedIds" :highlight-id="highlightId" :depth="currentDepth + 1" nested @reply="emit('reply', $event)" @toggle="emit('toggle', $event)" @jump="emit('jump', $event)" />
      </div>
    </div>
  </article>
</template>
