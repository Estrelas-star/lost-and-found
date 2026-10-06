<script setup lang="ts">
// 「AI 帮写」对话框（发布信息页用）：只做智能填充，不建帖
// 契约：POST /agent/extract（只读抽取）→ 返回 draft / missing_fields / questions
// 刻意选用 extract 而非 /agent/chat：extract 不建会话、不建帖，填完表仍由用户点「发布」走 /item/create
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '../api/http'
import { extractAgent } from '../api/agent'
import type { AgentDraft, AgentMissingField } from '../api/agent'
import AgentImagePicker from './AgentImagePicker.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; apply: [draft: AgentDraft] }>()

const EXAMPLES = [
  '我昨天下午在图书馆三楼丢了个黑色保温杯，带吸管的',
  '在食堂二楼捡到一张校园卡，请联系我',
  '丢了一把蓝色折叠伞，伞柄有贴纸，在教三楼附近',
]

// draft.missing_fields 与顶层 missing_fields 的取值都是这几个
const MISSING_LABEL: Record<string, string> = {
  item: '物品名称',
  location: '地点',
  location_detail: '详细地点',
  time: '时间',
  contact: '联系方式',
  color: '颜色',
  features: '特征',
}

const text = ref('')
// 多模态：最多 3 张（相对 URL，后端自动拼公网前缀）
const images = ref<string[]>([])
const loading = ref(false)
const draft = ref<AgentDraft | null>(null)
const missing = ref<AgentMissingField[]>([])
const questions = ref<string[]>([])
// 120006：后端未开启智能助手 → 降级为提示，不阻塞手动填表
const disabled = ref(false)

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => { if (!v) emit('close') },
})

function reset() {
  text.value = ''
  images.value = []
  draft.value = null
  missing.value = []
  questions.value = []
}
watch(() => props.visible, (v) => { if (v) reset() })

function useExample(ex: string) { text.value = ex; draft.value = null }

async function generate() {
  const t = text.value.trim()
  if (!t) { ElMessage.warning('请先用一句话描述一下物品情况'); return }
  if (t.length > 500) { ElMessage.warning('描述不超过 500 字'); return }
  loading.value = true
  try {
    const res = await extractAgent({ text: t, image_urls: images.value.length ? [...images.value] : undefined })
    const data = res.data
    if (!data?.draft) {
      draft.value = null
      ElMessage.warning('没能识别出物品信息，换个说法再试试（建议带上「丢了 / 捡到」）')
      return
    }
    draft.value = data.draft
    missing.value = data.missing_fields ?? data.draft.missing_fields ?? []
    questions.value = data.questions ?? []
  } catch (e) {
    if (e instanceof ApiError && e.code === 120006) disabled.value = true
    ElMessage.error((e as Error).message || '智能填写失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

function applyDraft() {
  if (!draft.value) return
  emit('apply', draft.value)
  emit('close')
}
</script>

<template>
  <el-dialog v-model="dialogVisible" title="AI 帮写" width="min(600px, 94vw)" align-center class="ai-write-dialog">
    <div v-if="disabled" class="aiw-body">
      <el-alert type="warning" :closable="false" show-icon title="智能填写当前不可用（后端未开启智能助手），请手动填写表单。" />
    </div>

    <div v-else class="aiw-body">
      <p class="aiw-tip">用一句话说明物品情况（也可以附上物品照片，最多 3 张），助手会帮你抽出标题、描述、标签和地点。<b>这里只填充表单，不会直接发布。</b></p>

      <div class="aiw-examples">
        <button v-for="ex in EXAMPLES" :key="ex" type="button" class="aiw-chip" @click="useExample(ex)">{{ ex }}</button>
      </div>

      <el-input
        v-model="text"
        type="textarea"
        :rows="3"
        maxlength="500"
        show-word-limit
        resize="none"
        placeholder="例如：我昨天下午在图书馆三楼丢了个黑色保温杯，带吸管的"
      />

      <AgentImagePicker v-model="images" :max="3" :disabled="loading" />

      <div class="aiw-actions">
        <el-button type="primary" :loading="loading" @click="generate">{{ draft ? '重新生成' : '生成草稿' }}</el-button>
        <span class="aiw-hint">单次约 2~8 秒，请勿重复点击</span>
      </div>

      <div v-if="draft" class="aiw-draft">
        <div class="aiw-draft-head">
          <span class="aiw-type" :class="draft.type === 0 ? 'lost' : 'found'">{{ draft.type === 0 ? '寻物' : '招领' }}</span>
          <strong>{{ draft.title }}</strong>
        </div>
        <p v-if="draft.description" class="aiw-draft-desc">{{ draft.description }}</p>
        <dl class="aiw-fields">
          <div><dt>标签</dt><dd>{{ draft.tag_names?.length ? draft.tag_names.join('、') : '未识别' }}</dd></div>
          <div><dt>地点</dt><dd>{{ (draft.location_name || draft.location_detail) ? `${draft.location_name ?? ''} ${draft.location_detail ?? ''}`.trim() : '未识别' }}</dd></div>
          <div><dt>联系方式</dt><dd>{{ draft.contact || '未识别（请在表单里补填）' }}</dd></div>
        </dl>
        <div v-if="missing.length || questions.length" class="aiw-missing">
          <span class="aiw-missing-label">待补充</span>
          <el-tag v-for="mf in missing" :key="mf" size="small" type="warning" effect="plain">{{ MISSING_LABEL[mf] ?? mf }}</el-tag>
          <el-tag v-for="(q, i) in questions" :key="'q' + i" size="small" effect="plain">{{ q }}</el-tag>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :disabled="!draft" @click="applyDraft">填入表单</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.aiw-body{display:flex;flex-direction:column;gap:12px}
.aiw-tip{margin:0;color:var(--muted);font-size:12px;line-height:1.7}
.aiw-tip b{color:var(--ink)}
.aiw-examples{display:flex;flex-direction:column;gap:6px}
.aiw-chip{text-align:left;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:#fbfdfb;color:#4b615a;font-size:12px;line-height:1.5}
.aiw-chip:hover{border-color:var(--green);color:var(--green);background:#f2faf6}
.aiw-actions{display:flex;align-items:center;gap:12px}
.aiw-hint{color:var(--muted);font-size:11px}
.aiw-draft{padding:12px 14px;border:1px dashed #cfe7dc;border-radius:10px;background:#f4faf7}
.aiw-draft-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aiw-draft-head strong{font-size:13px}
.aiw-type{font-size:10px;font-weight:700;border-radius:10px;padding:2px 8px;background:#dbe9ff;color:#3d6fb5}
.aiw-type.lost{background:#fde8de;color:#b56a3d}
.aiw-type.found{background:#d8f1e8;color:#2f8f6c}
.aiw-draft-desc{margin:8px 0 0;color:#4b5563;font-size:12px;line-height:1.7}
.aiw-fields{margin:10px 0 0;display:flex;flex-direction:column;gap:5px}
.aiw-fields > div{display:flex;gap:8px;font-size:12px}
.aiw-fields dt{flex:0 0 60px;color:#9aa9a1;margin:0}
.aiw-fields dd{margin:0;color:#4b5563;word-break:break-word}
.aiw-missing{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
.aiw-missing-label{color:#9aa9a1;font-size:11px;letter-spacing:.6px}
</style>
