<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore, isActiveStatus, type Comment, type Item } from '../stores/app'
import { renderMarkdown } from '../utils/markdown'
import CommentItem from './CommentItem.vue'
import SimilarItems from './SimilarItems.vue'

const props = defineProps<{ item: Item | null, visible: boolean }>()
const emit = defineEmits<{ close: []; openItem: [id: number]; refresh: [id: number] }>()
const store = useAppStore()
const claimDialogVisible = ref(false)
const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value) emit('close')
  }
})
const canClaim = computed(() => !!props.item && isActiveStatus(props.item.status))

// —— 评论区（楼层树）——
// 评论列表由 store 统一持有（按 itemId 过滤），App.vue 打开详情时已拉取一次；
// 这里再 watch 一次物品 id，保证「相似帖子」切换物品、或从别处重新打开时也会刷新。
// 楼层排序：统一按 **id 升序**（1 楼最早 → 依次往后），后端返回的倒序在这里纠正；
// 树形结构由 CommentItem 按 parentId 递归组装，展开状态放这里统一持有，
// 便于「回复某人后自动展开该楼层」与「切换物品时重置交互态」。
const commentText = ref('')
const replyTarget = ref<{ id: number; author: string } | null>(null)
const expandedIds = ref<number[]>([])
const highlightId = ref<number | null>(null)
let highlightTimer: number | undefined

const comments = computed(() => {
  const item = props.item
  if (!item) return []
  return store.comments.filter((c) => c.itemId === item.id).sort((a, b) => a.id - b.id)
})
// 顶层楼层：没有父级的就是根评论（根评论之间同样按楼层升序）
const rootComments = computed(() => comments.value.filter((c) => !c.parentId))

watch(() => props.item?.id, (id) => {
  replyTarget.value = null
  expandedIds.value = []
  highlightId.value = null
  if (id) store.fetchComments(id)
})

// 展开 / 收起某个楼层的回复
function toggleReplies(id: number) {
  expandedIds.value = expandedIds.value.includes(id)
    ? expandedIds.value.filter((item) => item !== id)
    : [...expandedIds.value, id]
}
// 点某条评论的「回复」：记录回复目标并回到输入框（已在视口内则不动）
function startReply(comment: Comment) {
  replyTarget.value = { id: comment.id, author: comment.author }
  requestAnimationFrame(() => document.querySelector('.comment-composer')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
// 子楼层的「↓ 跳到回复」：滚到它直接回复的那条评论，并高亮闪一下
function jumpToComment(id: number) {
  const el = document.getElementById(`comment-${id}`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  highlightId.value = id
  window.clearTimeout(highlightTimer)
  highlightTimer = window.setTimeout(() => { highlightId.value = null }, 1600)
}

async function sendComment() {
  if (!props.item) return
  const content = commentText.value.trim()
  if (!content) {
    ElMessage.warning('请输入评论内容')
    return
  }
  const parentId = replyTarget.value?.id
  try {
    await store.addComment({ itemId: props.item.id, content, parentId })
    commentText.value = ''
    replyTarget.value = null
    // 回复的是有子级的楼层时自动展开，保证刚发出的回复立刻可见
    if (parentId && !expandedIds.value.includes(parentId)) expandedIds.value = [...expandedIds.value, parentId]
    ElMessage.success('评论已发布')
  } catch (e) {
    ElMessage.error((e as Error).message || '评论发布失败，请稍后重试')
  }
}

async function submitClaim() {
  const item = props.item
  if (!item) return
  if (!canClaim.value) {
    ElMessage.warning('该物品当前不可认领')
    return
  }
  try {
    await store.submitClaim(item.id)
    ElMessage.success(item.type === 'lost' ? '已提交，等待失主联系' : '认领成功')
    emit('refresh', item.id)   // 认领后立即就地刷新弹窗内容（列表已由 store 重新拉取）
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/30006|绑定|qq|QQ/i.test(msg)) ElMessage.warning('认领需先绑定QQ，请前往账号设置绑定')
    else ElMessage.error(msg || '认领失败，请稍后重试')
  }
}
// 撤销认领（仅本人且物品处于已认领状态）
async function cancelClaim() {
  if (!props.item) return
  const id = props.item.id
  try {
    await store.cancelMyClaim(id)
    ElMessage.success('已撤销认领')
    emit('refresh', id)        // 撤销后立即就地刷新弹窗内容
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(msg || '撤销失败，请稍后重试')
  }
}

// 相似帖子：点卡片切换到该物品（由 App.vue 拉详情并重新打开弹窗）
function openSimilar(id: number) { emit('openItem', id) }
</script>

<template>
  <el-dialog v-if="item" v-model="dialogVisible" align-center class="detail-dialog" width="min(620px, 94vw)" :show-close="false" destroy-on-close @closed="emit('close')">
    <template #header><div class="detail-dialog-header"><span>物品详情</span><button class="modal-close" @click="emit('close')">×</button></div></template>
    <div class="detail-dialog-scroll">
      <div class="detail-content"><span class="eyebrow">{{ item.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ item.date }}</span><h2>{{ item.title }}</h2><div class="detail-tags"><el-tag v-for="tag in item.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><div class="markdown-body" v-html="renderMarkdown(item.desc)"></div><div class="detail-lines"><span>⌖ {{ item.location }}</span><span>◷ {{ item.date }}</span><span>发布人：{{ item.author }}</span><span>联系方式：{{ item.contact || '未提供' }}</span></div>

        <section class="comments-section">
          <div class="comments-heading"><h3>评论区</h3><span>{{ comments.length }} 条评论</span></div>
          <div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div>
          <div class="comment-composer">
            <el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit />
            <button type="button" class="send-comment" aria-label="发送评论" :disabled="!commentText.trim()" @click="sendComment">➤</button>
          </div>
          <div class="comment-list">
            <CommentItem v-for="comment in rootComments" :key="comment.id" :comment="comment" :all="comments" :expanded-ids="expandedIds" :highlight-id="highlightId" @reply="startReply" @toggle="toggleReplies" @jump="jumpToComment" />
            <el-empty v-if="!comments.length" description="还没有评论，来留下第一条吧" :image-size="70" />
          </div>
        </section>
        <div v-if="store.role === 'student' && (!store.isMyItem(item) || store.isClaimedByMe(item))" class="claim-btn-wrap"><button v-if="!store.isMyItem(item)" type="button" class="primary-btn full-btn" :disabled="!canClaim" @click="submitClaim">{{ item.type === 'lost' ? '我捡到了' : '申请认领' }}</button><button v-if="store.isClaimedByMe(item) && item.status === '已认领'" type="button" class="primary-btn full-btn ghost" @click="cancelClaim">撤销认领</button></div>
        <SimilarItems v-if="item" :item-id="item.id" @open="openSimilar" />
      </div>
    </div>
  </el-dialog>
</template>
