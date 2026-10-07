<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore, isActiveStatus, type Item } from '../stores/app'
import { renderMarkdown } from '../utils/markdown'
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

        <div v-if="store.role === 'student' && (!store.isMyItem(item) || store.isClaimedByMe(item))" class="claim-btn-wrap"><button v-if="!store.isMyItem(item)" type="button" class="primary-btn full-btn" :disabled="!canClaim" @click="submitClaim">{{ item.type === 'lost' ? '我捡到了' : '申请认领' }}</button><button v-if="store.isClaimedByMe(item) && item.status === '已认领'" type="button" class="primary-btn full-btn ghost" @click="cancelClaim">撤销认领</button></div>
        <SimilarItems v-if="item" :item-id="item.id" @open="openSimilar" />
      </div>
    </div>
  </el-dialog>
</template>
