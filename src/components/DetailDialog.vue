<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore, type Item } from '../stores/app'

const props = defineProps<{ item: Item | null, visible: boolean, isOwner?: boolean }>()
const emit = defineEmits<{ close: [], edit: [item: Item] }>()
const store = useAppStore()
const slide = ref(0)
const commentText = ref('')
const replyTarget = ref<{ id: number, author: string } | null>(null)
const claimDialogVisible = ref(false)
const ownerClaimsDialogVisible = ref(false)
const clueDialogVisible = ref(false)
const ownerCluesDialogVisible = ref(false)
const reportDialogVisible = ref(false)
const claimDescription = ref('')
const proofFiles = ref<any[]>([])
/** 申请认领弹窗当前步骤：'form' 填写认领说明 | 'contact' 勾选承诺后展示发布者联系方式 */
const claimStep = ref<'form' | 'contact'>('form')
/** 申请端承诺勾选框状态 */
const promiseAgreed = ref(false)
/** 发布者联系方式是否已复制 */
const contactCopied = ref(false)
const clueDescription = ref('')
const clueFiles = ref<any[]>([])
const reportReason = ref('')
const reportDescription = ref('')
const images = computed(() => props.item?.images ?? [])
const comments = computed(() => props.item ? store.comments.filter((comment) => comment.itemId === props.item?.id) : [])
const isOwner = computed(() => !!props.item && props.item.ownerId === store.account)
const ownerClaims = computed(() => props.item ? store.claims.filter((claim) => claim.itemId === props.item?.id && claim.ownerId === props.item?.ownerId) : [])
const ownerClues = computed(() => props.item ? store.clues.filter((clue) => clue.itemId === props.item?.id && clue.ownerId === props.item?.ownerId) : [])
const isFavorite = computed(() => props.item ? store.favoriteItemIds.includes(props.item.id) : false)
const isLiked = computed(() => props.item ? store.likedItemIds.includes(props.item.id) : false)
const likeCount = computed(() => props.item ? 12 + props.item.id * 3 + (isLiked.value ? 1 : 0) : 0)
const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value) emit('close')
  }
})
const canClaim = computed(() => !!props.item && !isOwner.value && (props.item.status === '招领中' || props.item.status === '待认领'))

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
  if (isOwner.value) {
    ElMessage.warning('不能申请认领自己发布的物品')
    return
  }
  if (!canClaim.value) {
    ElMessage.warning('该物品当前不可申请认领')
    return
  }
  if (!claimDescription.value.trim()) {
    ElMessage.warning('请填写认领说明')
    return
  }
  const ok = store.submitClaim(props.item, { description: claimDescription.value })
  if (!ok) {
    ElMessage.warning('您已提交过申请，请勿重复提交')
    return
  }
  // 不关闭弹窗，切换到"展示联系方式"步骤；重置承诺状态
  claimStep.value = 'contact'
  promiseAgreed.value = false
  contactCopied.value = false
  ElMessage.success('认领申请已提交，请按提示查看发布者联系方式')
}

/** 勾选承诺后查看并复制发布者联系方式 */
function copyPublisherContact() {
  if (!props.item) return
  if (!promiseAgreed.value) {
    ElMessage.warning('请先勾选承诺，再查看发布者联系方式')
    return
  }
  const contact = props.item.contact?.trim() || '暂未提供'
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(contact).then(() => {
      contactCopied.value = true
      ElMessage.success('联系方式已复制到剪贴板')
    }).catch(() => {
      contactCopied.value = true
      ElMessage.success('联系方式已展示')
    })
  } else {
    contactCopied.value = true
    ElMessage.success('联系方式已展示')
  }
}

/** 重新打开申请认领弹窗时重置为表单步骤 */
function openClaimDialog() {
  claimStep.value = 'form'
  promiseAgreed.value = false
  contactCopied.value = false
  claimDescription.value = ''
  proofFiles.value = []
  claimDialogVisible.value = true
}

function openClueForm() {
  clueDescription.value = ''
  clueFiles.value = []
  clueDialogVisible.value = true
}

function submitClue() {
  if (!props.item || props.item.type !== 'lost' || isOwner.value) return
  if (!clueDescription.value.trim()) {
    ElMessage.warning('请填写线索描述')
    return
  }
  const clueImages = clueFiles.value
    .map((file) => file.url || (file.raw ? URL.createObjectURL(file.raw) : ''))
    .filter(Boolean)
  // 静默提交当前登录用户的联系方式（前端界面不展示联系方式输入框）
  store.submitClue(props.item, { description: clueDescription.value, contact: store.currentUser.contact ?? '', images: clueImages })
  clueDialogVisible.value = false
  clueDescription.value = ''
  clueFiles.value = []
  ElMessage.success('线索已提交，感谢您的帮助')
}

function openOwnerClues() {
  if (!props.item) return
  store.markItemCluesRead(props.item.id)
  ownerCluesDialogVisible.value = true
}

function onOwnerCluesDialogClosed() {
  if (props.item) store.markItemCluesRead(props.item.id)
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

async function deleteItem() {
  if (!props.item || props.item.status !== '待审核') return
  try {
    await ElMessageBox.confirm(`确定要删除“${props.item.title}”吗？删除后无法恢复。`, '删除确认', { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' })
    store.removeItem(props.item.id)
    emit('close')
    ElMessage.success('已删除')
  } catch { /* 用户取消 */ }
}

async function withdrawItem() {
  if (!props.item || (props.item.status !== '招领中' && props.item.status !== '待认领')) return
  try {
    await ElMessageBox.confirm('确定要撤回这条信息吗？撤回后将不再对其他人展示，但你可以再次编辑。', '撤回确认', { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' })
    store.withdrawItem(props.item.id)
    ElMessage.success('已撤回')
  } catch { /* 用户取消 */ }
}

/** 发布者同意某条认领申请（带二次确认） */
async function approveClaim(claimId: number) {
  if (!props.item) return
  try {
    await ElMessageBox.confirm('确认物品已归还给该申请人吗？确认后其他申请将自动失效。', '同意认领', {
      type: 'warning',
      confirmButtonText: '确认归还',
      cancelButtonText: '取消'
    })
  } catch { return }
  store.approveClaim(claimId)
  ownerClaimsDialogVisible.value = false
  ElMessage.success('已同意该认领申请，物品已标记为已认领')
}

/** 发布者拒绝某条认领申请 */
async function rejectClaim(claimId: number) {
  if (!props.item) return
  try {
    await ElMessageBox.confirm('确定拒绝该申请人的认领申请吗？', '拒绝认领', {
      type: 'warning',
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消'
    })
  } catch { return }
  store.rejectClaim(claimId)
  ownerClaimsDialogVisible.value = false
  ElMessage.success('已拒绝该认领申请')
}
</script>

<template>
  <el-dialog v-if="item" v-model="dialogVisible" :class="{ 'owner-view': isOwner }" width="min(620px, 94vw)" :show-close="false" destroy-on-close @closed="emit('close')">
    <template #header><div class="detail-dialog-header"><span>物品详情</span><button class="modal-action" @click="reportDialogVisible = true">⚑ 举报</button><button class="modal-close" @click="emit('close')">×</button></div></template>
    <div class="detail-owner-actions"><el-tag :type="item.status === '已认领' || item.status === '已找回' ? 'success' : item.status === '已关闭' || item.status === '已撤回' ? 'info' : item.status === '待认领' ? 'warning' : item.status === '已驳回' ? 'danger' : 'primary'">{{ item.status === '已关闭' ? '已下架' : item.status }}</el-tag><div v-if="isOwner" class="detail-owner-buttons"><button v-if="item.status === '待审核'" type="button" class="owner-delete" @click="deleteItem">删除</button><button v-if="item.status === '招领中' || item.status === '待认领'" type="button" class="owner-withdraw" @click="withdrawItem">撤回</button><button v-if="item.status === '待审核' || item.status === '已撤回'" type="button" class="owner-edit" @click="emit('edit', item)">编辑</button></div></div>
    <div class="detail-dialog-scroll">
      <div class="detail-gallery"><el-carousel v-if="images.length" v-model="slide" height="min(400px, 48vh)" arrow="always" indicator-position="outside"><el-carousel-item v-for="(image, index) in images" :key="image"><el-image class="detail-gallery-image" :src="image" :preview-src-list="images" :initial-index="index" fit="contain" preview-teleported alt="物品照片" /></el-carousel-item></el-carousel><div v-else class="detail-art" :class="item.color"><span>{{ item.icon }}</span><small>暂无照片</small></div></div>
      <div class="detail-content"><span class="eyebrow">{{ item.type === 'lost' ? '寻物信息' : '招领信息' }} · {{ item.date }}</span><h2>{{ item.title }}</h2><div class="detail-tags"><el-tag v-for="tag in item.tags" :key="tag" effect="light">{{ tag }}</el-tag></div><p>{{ item.desc }}</p><div class="detail-lines"><span>⌖ {{ item.location }}</span><span>◷ {{ item.date }}</span><span>发布人：{{ item.author }}</span></div>
        <section class="comments-section"><div class="comments-heading"><h3>评论区</h3><span>{{ comments.length }} 条评论</span></div><div v-if="replyTarget" class="replying-to">正在回复 @{{ replyTarget.author }}<button type="button" @click="replyTarget = null">取消</button></div><div class="comment-composer"><el-input v-model="commentText" type="textarea" :rows="2" :placeholder="replyTarget ? `回复 @${replyTarget.author}` : '说说你的看法...'" maxlength="200" show-word-limit /><button type="button" class="send-comment" aria-label="发送评论" :disabled="!commentText.trim()" @click="sendComment">➤</button></div><div class="comment-list"><article v-for="comment in comments" :key="comment.id" class="comment-item" :class="{ 'comment-reply': comment.parentId }"><div class="comment-avatar">{{ comment.avatar }}</div><div class="comment-body"><div class="comment-meta"><strong>{{ comment.author }}</strong><time>{{ comment.date }}</time></div><p v-if="comment.replyTo" class="reply-label">回复 @{{ comment.replyTo }}</p><p class="comment-text">{{ comment.content }}</p><div class="comment-actions"><button type="button" @click="replyTarget = { id: comment.id, author: comment.author }">回复</button><button type="button" :class="{ active: comment.liked }" @click="store.toggleCommentLike(comment.id)">♡ {{ comment.likes }}</button></div></div></article><el-empty v-if="!comments.length" description="还没有评论，来留下第一条吧" :image-size="70" /></div></section>
        <div class="detail-stats"><span>◉ {{ 128 + item.id * 17 }} 浏览</span><button type="button" class="like-stat" :class="{ active: isLiked }" @click="store.toggleItemLike(item.id)"><span>{{ isLiked ? '♥' : '♡' }}</span> {{ likeCount }} 点赞</button><button type="button" class="favorite-stat" :class="{ active: isFavorite }" @click="store.toggleFavorite(item.id)"><span>{{ isFavorite ? '♥' : '♡' }}</span> {{ 8 + item.id * 2 + (isFavorite ? 1 : 0) }} 收藏</button></div>
        <template v-if="store.role === 'student'">
          <p v-if="item.status === '已认领'" class="claimed-notice">该物品已被认领</p>
          <p v-else-if="item.status === '已找回'" class="claimed-notice">该物品已确认找回</p>
          <button v-else-if="isOwner && item.type === 'lost'" type="button" class="primary-btn full-btn manage-claims-btn" @click="openOwnerClues">查看线索</button>
          <button v-else-if="isOwner" type="button" class="primary-btn full-btn manage-claims-btn" @click="ownerClaimsDialogVisible = true">管理认领申请</button>
          <button v-else-if="item.type === 'lost'" type="button" class="primary-btn full-btn clue-btn" @click="openClueForm">提供线索</button>
          <el-tooltip v-else :disabled="canClaim" content="该物品当前不可申请认领"><span class="claim-btn-wrap"><button type="button" class="primary-btn full-btn" :disabled="!canClaim" @click="canClaim && openClaimDialog()">申请认领</button></span></el-tooltip>
        </template>
      </div>
    </div>
  </el-dialog>
  <el-dialog v-model="ownerClaimsDialogVisible" title="管理认领申请" width="min(620px, 94vw)">
    <div class="owner-claims-manage">
      <article v-for="claim in ownerClaims" :key="claim.id" class="owner-claim-card">
        <div class="owner-claim-card-head">
          <div class="owner-claim-applicant"><span class="owner-claim-avatar">{{ claim.applicant.slice(0, 1) }}</span><div><strong>{{ claim.applicant }}</strong><time>申请时间：{{ claim.date }}</time></div></div>
          <el-tag :type="claim.status === '已通过' ? 'success' : claim.status === '已驳回' ? 'danger' : 'warning'" effect="light" size="small">{{ claim.status === '已通过' ? '已通过' : claim.status === '已驳回' ? '已拒绝' : '待处理' }}</el-tag>
        </div>
        <div class="owner-claim-fields">
          <div class="owner-claim-field"><span class="owner-claim-label">认领说明</span><p class="owner-claim-desc">{{ claim.description || '未填写认领说明' }}</p></div>
          <div class="owner-claim-field"><span class="owner-claim-label">联系方式</span><span class="owner-claim-contact">{{ claim.contact || '未提供' }}</span></div>
          <div v-if="claim.rejectionReason" class="owner-claim-field"><span class="owner-claim-label">处理备注</span><span class="owner-claim-reason">{{ claim.rejectionReason }}</span></div>
        </div>
        <div class="owner-claim-actions">
          <button type="button" class="claim-action-btn reject" @click="rejectClaim(claim.id)">拒绝</button>
          <button type="button" class="claim-action-btn approve" @click="approveClaim(claim.id)">同意认领</button>
        </div>
      </article>
      <el-empty v-if="!ownerClaims.length" description="暂时没有认领申请" :image-size="72" />
    </div>
  </el-dialog>
  <el-dialog v-model="ownerCluesDialogVisible" title="该物品收到的线索" width="min(520px, 94vw)" @closed="onOwnerCluesDialogClosed">
    <div v-if="ownerClues.length" class="owner-claim-list">
      <article v-for="clue in ownerClues" :key="clue.id" class="owner-claim-item">
        <div class="owner-claim-heading"><strong>{{ clue.reporter }}</strong><time>{{ clue.date }}</time></div>
        <p>{{ clue.description }}</p>
        <small>联系方式：{{ clue.contact }}</small>
        <div v-if="clue.images.length" class="owner-clue-images"><el-image v-for="(image, index) in clue.images" :key="image" :src="image" :preview-src-list="clue.images" :initial-index="index" fit="contain" preview-teleported /></div>
      </article>
    </div>
    <el-empty v-else description="暂时没有线索" :image-size="72" />
  </el-dialog>
  <el-dialog v-model="clueDialogVisible" title="提供线索" width="min(460px, 92vw)">
    <el-form label-position="top">
      <el-form-item label="线索描述" required><el-input v-model="clueDescription" type="textarea" :rows="4" placeholder="描述你发现的线索或可能的物品位置" maxlength="300" show-word-limit /></el-form-item>
      <el-form-item label="上传物品照片"><el-upload v-model:file-list="clueFiles" action="#" list-type="picture-card" :auto-upload="false" accept="image/*"><span>＋</span></el-upload></el-form-item>
      <el-button type="primary" class="dialog-submit" @click="submitClue">提交线索</el-button>
    </el-form>
  </el-dialog>
  <el-dialog v-model="claimDialogVisible" :title="claimStep === 'form' ? '申请认领' : '查看发布者联系方式'" width="min(480px, 94vw)" destroy-on-close :close-on-click-modal="false" :close-on-press-escape="false">
    <!-- 第一步：填写认领说明 -->
    <div v-if="claimStep === 'form'" class="claim-form-step">
      <el-form label-position="top">
        <el-form-item label="认领说明" required><el-input v-model="claimDescription" type="textarea" :rows="4" placeholder="请描述物品特征、遗失时间等证明信息" maxlength="300" show-word-limit /></el-form-item>
        <el-form-item label="证明材料图片"><el-upload v-model:file-list="proofFiles" action="#" list-type="picture-card" :auto-upload="false" accept="image/*"><span>＋</span></el-upload></el-form-item>
        <el-button type="primary" class="dialog-submit" @click="submitClaim">提交申请</el-button>
      </el-form>
    </div>
    <!-- 第二步：勾选承诺后展示发布者联系方式 -->
    <div v-else class="claim-contact-step">
      <p class="claim-contact-tip">申请已提交成功！为保障双方权益，请先确认以下承诺：</p>
      <label class="claim-promise-box" :class="{ 'promise-checked': promiseAgreed }">
        <el-checkbox v-model="promiseAgreed">我承诺仅将该联系方式用于找回该物品，绝不恶意骚扰</el-checkbox>
      </label>
      <div v-if="promiseAgreed" class="claim-contact-reveal">
        <span class="claim-contact-label">发布者联系方式</span>
        <div class="claim-contact-row">
          <strong class="claim-contact-value">{{ item?.contact?.trim() || '暂未提供' }}</strong>
          <button type="button" class="claim-copy-btn" @click="copyPublisherContact">{{ contactCopied ? '已复制 ✓' : '一键复制' }}</button>
        </div>
      </div>
      <p v-else class="claim-promise-hint">请先勾选上方承诺，再查看发布者联系方式</p>
    </div>
  </el-dialog>
  <el-dialog v-model="reportDialogVisible" title="举报信息" width="min(420px, 92vw)"><el-form label-position="top"><el-form-item label="举报原因" required><el-select v-model="reportReason" placeholder="请选择举报原因" class="dialog-control"><el-option label="虚假信息" value="虚假信息" /><el-option label="违规内容" value="违规内容" /><el-option label="恶意行为" value="恶意行为" /><el-option label="其他" value="其他" /></el-select></el-form-item><el-form-item label="补充说明"><el-input v-model="reportDescription" type="textarea" :rows="3" placeholder="补充描述举报原因（可选）" maxlength="200" show-word-limit /></el-form-item><el-button type="primary" class="dialog-submit" @click="submitReport">提交举报</el-button></el-form></el-dialog>
</template>
