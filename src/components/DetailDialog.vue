<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore, type Item } from '../stores/app'

const props = defineProps<{ item: Item | null, visible: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()
const slide = ref(0)
const commentText = ref('')
const replyTarget = ref<{ id: number, author: string } | null>(null)
const claimDialogVisible = ref(false)
const reportDialogVisible = ref(false)
const claimDescription = ref('')
const proofFiles = ref<any[]>([])
const reportReason = ref('')
const reportDescription = ref('')
const images = computed(() => props.item?.images ?? [])
const comments = computed(() => props.item ? store.comments.filter((comment) => comment.itemId === props.item?.id) : [])
const isFavorite = computed(() => props.item ? store.favoriteItemIds.includes(props.item.id) : false)
const isLiked = computed(() => props.item ? store.likedItemIds.includes(props.item.id) : false)
const likeCount = computed(() => props.item ? 12 + props.item.id * 3 + (isLiked.value ? 1 : 0) : 0)
const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value) emit('close')
  }
})
const canClaim = computed(() => !!props.item && (props.item.status === '招领中' || props.item.status === '待认领'))

function sendComment() {
  const content = commentText.value.trim()
  if (!props.item) return
  if (!content) {
    ElMessage.warning('请输入评论内容')
    return
  }
  store.addComment({ itemId: props.item.id, author: store.currentUser.name, avatar: store.currentUser.name.slice(0, 1), content, parentId: replyTarget.value?.id, replyTo: replyTarget.value?.author })
  commentText.value = ''
  replyTarget.value = null
  ElMessage.success('评论已发布')
}

function submitClaim() {
  if (!props.item) return
  if (!canClaim.value) {
    ElMessage.warning('该物品当前不可申请认领')
    return
  }
  if (!claimDescription.value.trim()) {
    ElMessage.warning('请填写认领说明')
    return
  }
  store.submitClaim(props.item)
  claimDialogVisible.value = false
  claimDescription.value = ''
  proofFiles.value = []
  ElMessage.success('认领申请已提交，请等待审核')
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
  <el-dialog v-if="item" v-model="dialogVisible" width="min(620px, 94vw)" :show-close="false" destroy-on-close @closed="emit('close')">
    <template #header><div class="detail-dialog-header"><span>物品详情</span><button class="modal-action" @click="reportDialogVisible = true">⚑ 举报</button><button class="modal-close" @click="emit('close')">×</button></div></template>
    <div class="detail-dialog-scroll">
      <div class="detail-gallery"><el-carousel v-if="images.length" v-model="slide" height="250px" arrow="always" indicator-position="outside"><el-carousel-item v-for="image in images" :key="image"><img :src="image" alt="物品照片" /></el-carousel-item></el-carousel><div v-else class="detail-art" :class="item.color"><span>{{ item.icon }}</span><small>暂无照片</small></div></div>
      <div class="detail-content"><span class="eyebrow">{{ item.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ item.date }}</span><h2>{{ item.title }}</h2><div class="detail-tags"><el-tag v-for="tag in item.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><p>{{ item.desc }}</p><div class="detail-lines"><span>⌖ {{ item.location }}</span><span>◷ {{ item.date }}</span><span>发布人：{{ item.author }}</span></div>
        <section class="comments-section"><div class="comments-heading"><h3>评论区</h3><span>{{ comments.length }} 条评论</span></div><div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div><div class="comment-composer"><el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit /><button type="button" class="send-comment" aria-label="发送评论" :disabled="!commentText.trim()" @click="sendComment">➤</button></div><div class="comment-list"><article v-for="comment in comments" :key="comment.id" class="comment-item" :class="{ 'comment-reply': comment.parentId }"><div class="comment-avatar">{{ comment.avatar }}</div><div class="comment-body"><div class="comment-meta"><strong>{{ comment.author }}</strong><time>{{ comment.date }}</time></div><p v-if="comment.replyTo" class="reply-label">回复 @{{ comment.replyTo }}</p><p class="comment-text">{{ comment.content }}</p><div class="comment-actions"><button type="button" @click="replyTarget = { id: comment.id, author: comment.author }">回复</button><button type="button" :class="{ active: comment.liked }" @click="store.toggleCommentLike(comment.id)">♡ {{ comment.likes }}</button></div></div></article><el-empty v-if="!comments.length" description="还没有评论，来留下第一条吧" :image-size="70" /></div></section>
        <div class="detail-stats"><span>◉ {{ 128 + item.id * 17 }} 浏览</span><button type="button" class="like-stat" :class="{ active: isLiked }" @click="store.toggleItemLike(item.id)"><span>{{ isLiked ? '♥' : '♡' }}</span> {{ likeCount }} 点赞</button><button type="button" class="favorite-stat" :class="{ active: isFavorite }" @click="store.toggleFavorite(item.id)"><span>{{ isFavorite ? '♥' : '♡' }}</span> {{ 8 + item.id * 2 + (isFavorite ? 1 : 0) }} 收藏</button></div>
        <el-tooltip v-if="store.role === 'student'" :disabled="canClaim" content="该物品当前不可申请认领"><span class="claim-btn-wrap"><button type="button" class="primary-btn full-btn" :disabled="!canClaim" @click="canClaim && (claimDialogVisible = true)">申请认领</button></span></el-tooltip>
      </div>
    </div>
  </el-dialog>
  <el-dialog v-model="claimDialogVisible" title="申请认领" width="min(460px, 92vw)"><el-form label-position="top"><el-form-item label="认领说明" required><el-input v-model="claimDescription" type="textarea" :rows="4" placeholder="请描述物品特征、遗失时间等证明信息" maxlength="300" show-word-limit /></el-form-item><el-form-item label="证明材料图片"><el-upload v-model:file-list="proofFiles" action="#" list-type="picture-card" :auto-upload="false" accept="image/*"><span>＋</span></el-upload></el-form-item><el-button type="primary" class="dialog-submit" @click="submitClaim">提交申请</el-button></el-form></el-dialog>
  <el-dialog v-model="reportDialogVisible" title="举报信息" width="min(420px, 92vw)"><el-form label-position="top"><el-form-item label="举报原因" required><el-select v-model="reportReason" placeholder="请选择举报原因" class="dialog-control"><el-option label="虚假信息" value="虚假信息" /><el-option label="违规内容" value="违规内容" /><el-option label="恶意行为" value="恶意行为" /><el-option label="其他" value="其他" /></el-select></el-form-item><el-form-item label="补充说明"><el-input v-model="reportDescription" type="textarea" :rows="3" placeholder="补充描述举报原因（可选）" maxlength="200" show-word-limit /></el-form-item><el-button type="primary" class="dialog-submit" @click="submitReport">提交举报</el-button></el-form></el-dialog>
</template>
