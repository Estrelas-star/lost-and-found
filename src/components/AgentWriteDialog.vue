<script setup lang="ts">
// 「AI 帮写」**临时对话框**（发布信息页用）：用草稿接口把一句话变成可发布的表单内容
//
// 关于「草稿 API」：后端没有独立的发布草稿接口（agent.md：「不设独立「发布草稿」接口」，router 亦无 draft 路由）。
//   返回草稿的接口是 → POST /agent/extract（只读抽取，官方标注为「D 智能填充表单」专用）
//                      POST /agent/chat（首轮 stage=need_confirm + draft，会建会话，多轮对话用）
//   本对话框刻意选 extract：不建会话、不建帖；填完仍由用户点「发布」走 /item/create。
//
// 交互（本轮调整）：
//   · **临时对话框、不跳转**：在发布页原地弹出，关闭即回到表单（发布页在 KeepAlive 中，填写内容不丢）
//   · **自动填充**：打开时自动带入表单里已写好的标题/描述并**立即生成 + 立即灌进表单**（无需二次点击）
//   · **完全帮写**：醒目的按钮，带着当前描述跳转智能助手，使用多轮对话 / 找匹配的完整能力
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError } from '../api/http'
import { extractAgent } from '../api/agent'
import type { AgentDraft, AgentMissingField } from '../api/agent'
import AgentImagePicker from './AgentImagePicker.vue'

const props = defineProps<{
  visible: boolean
  /** 发布表单里已有的物品名称（打开时自动带入并直接生成草稿） */
  seedTitle?: string
  /** 发布表单里已有的详细描述 */
  seedDesc?: string
}>()
const emit = defineEmits<{ close: []; apply: [draft: AgentDraft] }>()

const router = useRouter()

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
// 是否已把草稿自动灌进发布表单
const filled = ref(false)

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => { if (!v) emit('close') },
})

// 打开时：清理上一次状态 → 带入发布表单里已写好的内容 → 有内容就直接自动生成并填入
function openDialog() {
  images.value = []
  draft.value = null
  missing.value = []
  questions.value = []
  filled.value = false
  const seed = [props.seedTitle, props.seedDesc].map((s) => (s || '').trim()).filter(Boolean).join('：')
  text.value = seed
  if (seed) generate()   // 表单里已有内容 → 自动生成草稿并自动填入表单
}
watch(() => props.visible, (v) => { if (v) openDialog() })

function useExample(ex: string) { text.value = ex; draft.value = null; filled.value = false }

async function generate() {
  const t = text.value.trim()
  if (!t) { ElMessage.warning('请先用一句话描述一下物品情况'); return }
  if (t.length > 500) { ElMessage.warning('描述不超过 500 字'); return }
  loading.value = true
  filled.value = false
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
    // 关键：生成成功即**自动填入发布表单**（完全功能），不再需要用户点「填入表单」
    emit('apply', data.draft)
    filled.value = true
  } catch (e) {
    if (e instanceof ApiError && e.code === 120006) disabled.value = true
    ElMessage.error((e as Error).message || '智能填写失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

/** 完全帮写：带着当前描述跳到智能助手，使用多轮对话 / 找匹配 / 图片识别的完整能力 */
function goAssistant() {
  const q = text.value.trim()
  emit('close')
  router.push({ name: 'assistant', query: q ? { q } : {} })
}
</script>

<template>
  <el-dialog v-model="dialogVisible" width="min(560px, 94vw)" align-center class="ai-write-dialog">
    <template #header>
      <div class="aiw-head">
        <span>✦ AI 帮写</span>
        <button type="button" class="aiw-full-btn" title="带着当前描述跳到智能助手，用多轮对话 / 找匹配的完整能力" @click="goAssistant">完全帮写 →</button>
      </div>
    </template>

    <div v-if="disabled" class="aiw-body">
      <el-alert type="warning" :closable="false" show-icon title="智能填写当前不可用（后端未开启智能助手），请手动填写表单，或点右上角「完全帮写」到智能助手页重试。" />
    </div>

    <div v-else class="aiw-body">
      <p class="aiw-tip">用一句话说明物品情况（也可以附上照片，最多 3 张）。生成后<b>会自动填入表单</b>，核对无误点「发布」即可；想多轮对话或找匹配，用右上角「完全帮写」。</p>

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
        <el-button type="primary" :loading="loading" @click="generate">{{ draft ? '重新生成并填入' : '生成并填入表单' }}</el-button>
        <span class="aiw-hint">单次约 2~8 秒，请勿重复点击</span>
      </div>

      <div v-if="filled" class="aiw-filled">✓ 已自动填入表单（类型 / 名称 / 描述 / 标签 / 地点 / 联系方式），关闭本窗口核对后即可发布。</div>

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
      <el-button @click="emit('close')">{{ filled ? '完成' : '关闭' }}</el-button>
      <el-button type="primary" plain @click="goAssistant">完全帮写 →</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.aiw-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.aiw-head>span{font-size:16px;font-weight:700;color:var(--ink)}
/* 「完全帮写」：带着当前描述跳到智能助手用完整能力，做成醒目按钮 */
.aiw-full-btn{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 14px;border:0;border-radius:var(--radius-pill);background:linear-gradient(135deg,var(--green) 0%,var(--green-dark) 100%);color:#fff;font-size:12px;font-weight:700;box-shadow:0 5px 12px #42b9833d;cursor:pointer;transition:box-shadow var(--dur) var(--ease),transform var(--dur) var(--ease)}
.aiw-full-btn:hover{box-shadow:0 8px 18px #42b98359;transform:translateY(-1px)}
.aiw-filled{margin-top:10px;padding:9px 12px;border:1px dashed #9ed4b8;border-radius:var(--radius-md);background:var(--green-soft);color:var(--green-dark);font-size:12px;line-height:1.6}
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
