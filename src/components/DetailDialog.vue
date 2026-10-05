<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore, isActiveStatus, type Item } from '../stores/app'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{ item: Item | null, visible: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()
const commentText = ref('')
const replyTarget = ref<{ id: number, author: string } | null>(null)
const claimDialogVisible = ref(false)
const reportDialogVisible = ref(false)
const reportReason = ref('')
const reportDescription = ref('')
const comments = computed(() => props.item ? store.comments.filter((comment) => comment.itemId === props.item?.id) : [])
const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value) emit('close')
  }
})
const canClaim = computed(() => !!props.item && isActiveStatus(props.item.status))

onMounted(() => { if (props.item) store.fetchComments(props.item.id) })

async function sendComment() {
  const content = commentText.value.trim()
  if (!props.item) return
  if (!content) {
    ElMessage.warning('请输入评论内容')
    return
  }
  try {
    await store.addComment({ itemId: props.item.id, author: store.currentUser.name, avatar: store.currentUser.name.slice(0, 1), content, parentId: replyTarget.value?.id, replyTo: replyTarget.value?.author })
    commentText.value = ''
    replyTarget.value = null
    ElMessage.success('评论已发布')
  } catch (e) {
    ElMessage.error('评论发布失败，请稍后重试')
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/30006|绑定|qq|QQ/i.test(msg)) ElMessage.warning('认领需先绑定QQ，请前往账号设置绑定')
    else ElMessage.error(msg || '认领失败，请稍后重试')
  }
}
// 撤销认领（仅本人且物品处于已认领状态）
async function cancelClaim() {
  if (!props.item) return
  try {
    await store.cancelMyClaim(props.item.id)
    ElMessage.success('已撤销认领')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(msg || '撤销失败，请稍后重试')
  }
}

function submitReport() {
  if (!reportReason.value) {
    ElMessage.warning('请选择举报原因')
    return
  }
  reportDialogVisible.value = false
  reportReason.value = ''
  reportDescription.value = ''
  ElMessage.success('举报已提交')
}
</script>

<template>
  <el-dialog v-if="item" v-model="dialogVisible" align-center class="detail-dialog" width="min(620px, 94vw)" :show-close="false" destroy-on-close @closed="emit('close')">
    <template #header><div class="detail-dialog-header"><span>物品详情</span><button class="modal-action" @click="reportDialogVisible = true">⚑ 举报</button><button class="modal-close" @click="emit('close')">×</button></div></template>
    <div class="detail-dialog-scroll">
      <div class="detail-content"><span class="eyebrow">{{ item.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ item.date }}</span><h2>{{ item.title }}</h2><div class="detail-tags"><el-tag v-for="tag in item.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><div class="markdown-body" v-html="renderMarkdown(item.desc)"></div><div class="detail-lines"><span>⌖ {{ item.location }}</span><span>◷ {{ item.date }}</span><span>发布人：{{ item.author }}</span></div>
        <section class="comments-section"><div class="comments-heading"><h3>评论区</h3><span>{{ comments.length }} 条评论</span></div><div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div><div class="comment-composer"><el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit /><button type="button" class="send-comment" aria-label="发送评论" :disabled="!commentText.trim()" @click="sendComment">➤</button></div><div class="comment-list"><article v-for="comment in comments" :key="comment.id" class="comment-item" :class="{ 'comment-reply': comment.parentId }"><div class="comment-avatar">{{ comment.avatar }}</div><div class="comment-body"><div class="comment-meta"><strong>{{ comment.author }}</strong><time>{{ comment.date }}</time></div><p v-if="comment.replyTo" class="reply-label">回复 @{{ comment.replyTo }}</p><p class="comment-text">{{ comment.content }}</p><div class="comment-actions"><button type="button" @click="replyTarget = { id: comment.id, author: comment.author }">回复</button></div></div></article><el-empty v-if="!comments.length" description="还没有评论，来留下第一条吧" :image-size="70" /></div></section>
        <div class="detail-stats"><span>◉ {{ 128 + (item.id ?? 0) * 17 }} 浏览</span><button type="button" class="like-stat" :class="{active: store.likedItemIds.includes(item.id)}" @click="store.toggleItemLike(item.id)"><span>♥</span> {{ store.likedItemIds.includes(item.id) ? '已赞' : '点赞' }}</button><button type="button" class="favorite-stat" :class="{active: store.favoriteItemIds.includes(item.id)}" @click="store.toggleFavorite(item.id)"><span>★</span> {{ store.favoriteItemIds.includes(item.id) ? '已收藏' : '收藏' }}</button></div>
        <div v-if="store.role === 'student'" class="claim-btn-wrap"><button type="button" class="primary-btn full-btn" :disabled="!canClaim" @click="submitClaim">{{ item.type === 'lost' ? '我捡到了' : '申请认领' }}</button><button v-if="(props.item && store.isClaimedByMe(props.item)) && props.item?.status === '已认领'" type="button" class="primary-btn full-btn ghost" @click="cancelClaim">撤销认领</button></div>
      </div>
    </div>
  </el-dialog>
  <el-dialog v-model="reportDialogVisible" title="举报信息" width="min(420px, 92vw)"><el-form label-position="top"><el-form-item label="举报原因" required><el-select v-model="reportReason" placeholder="请选择举报原因" class="dialog-control"><el-option label="虚假信息" value="虚假信息" /><el-option label="违规内容" value="违规内容" /><el-option label="恶意行为" value="恶意行为" /><el-option label="其他" value="其他" /></el-select></el-form-item><el-form-item label="补充说明"><el-input v-model="reportDescription" type="textarea" :rows="3" placeholder="补充描述举报原因（可选）" maxlength="200" show-word-limit /></el-form-item><el-button type="primary" class="dialog-submit" @click="submitReport">提交举报</el-button></el-form></el-dialog>
</template>
