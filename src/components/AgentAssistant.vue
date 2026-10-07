<script setup lang="ts">
// 智能助手（学生端独立菜单页）：对话式发帖 + 自然语言找匹配
// 契约（api_agent.md §7 / api_guide.md §十三）：
//   · POST /agent/chat 主入口 —— 首轮不带 session_id → stage=need_confirm + draft
//     次轮【必须回传 session_id】；只有「补充信息」或「明确确认」才建帖；其他内容一律 stage=cancelled
//   · POST /agent/session/close 关闭会话（幂等）
//   · 限流：三个 /agent/* 共享每用户 10 次/分钟（120004）；单次 LLM 耗时 2~8 秒（api 层已设 30s 超时）
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { ApiError } from '../api/http'
import { chatAgent, closeAgentSession } from '../api/agent'
import type { AgentAction, AgentChatResponse, AgentDraft, AgentMatchBrief, AgentStage } from '../api/agent'
import LocationSelector from './LocationSelector.vue'
import AgentImagePicker from './AgentImagePicker.vue'
import { resolveImageUrl } from '../utils/image'
import { getCookie, setCookie } from '../utils/cookie'

const emit = defineEmits<{ 'open-item': [id: number] }>()
const store = useAppStore()
const route = useRoute()
const router = useRouter()

const MAX_TEXT = 500

// 后端 stage 的语义提示（写进气泡，帮用户理解为什么没有发布）
const STAGE_HINT: Partial<Record<AgentStage, string>> = {
  need_confirm: '草稿已就绪 —— 回复补充信息，或点「确认发布」才会真正发帖',
  created: '已发布成功，可在「我的发布」里继续编辑',
  matched: '为你找到以下候选，点卡片可查看详情',
  no_match: '暂未找到匹配的帖子，可以换个说法，或直接发帖登记',
  chitchat: '这不像是失物招领相关的描述',
  cancelled: '本次未发布任何信息',
}

// —— 每轮对话的展示单元 ——
interface ChatMessage {
  id: number
  role: 'user' | 'agent'
  text: string
  images?: string[]
  stage?: AgentStage
  draft?: AgentDraft
  questions?: string[]
  matches?: AgentMatchBrief[]
  similar?: AgentMatchBrief[]
  createdItemId?: number | null
  failed?: boolean
  /** 打字机进度：已输出的字数（undefined = 没有打字过程，直接整段显示，如欢迎语） */
  typed?: number
  /** 回答顶部的溯源行（仅正常回答；错误提示不显示） */
  trust?: string
}

const WELCOME_TEXT = '你好，我是拾光智能助手 ✦\n可以直接描述丢的或捡到的东西（例如「我昨天下午在图书馆三楼丢了个黑色保温杯」），我会整理成草稿，你确认后才发布。\n也可以问「有人捡到黑色水杯吗」，我帮你找找。'

let seq = 0
function nextId() { return ++seq }
function welcomeMessage(): ChatMessage {
  return { id: nextId(), role: 'agent', text: WELCOME_TEXT }
}

const messages = ref<ChatMessage[]>([welcomeMessage()])
const streamRef = ref<HTMLElement | null>(null)
const input = ref('')
const sending = ref(false)
// 120006：后端 openai.agent_enabled=false，本页直接降级为提示态
const agentDisabled = ref(false)
// 会话：session_id 严格回传；created / cancelled 后视为结束，本地清掉（下一轮不带 id = 新会话）
const sessionId = ref<string | null>(null)

// —— 可选附加信息：标签（多选）+ 地点（级联），发送时自动拼接进描述 ——
const selectedTags = ref<string[]>([])
const locationLabel = ref('')
const locationId = ref<number | null>(null)
// 多模态：最多 3 张（提交上传返回的相对 URL，后端会自动拼公网前缀）
const images = ref<string[]>([])
const locationSelectorRef = ref<InstanceType<typeof LocationSelector>>()
const tagOptions = computed(() => store.tags)

// 附加信息非空时：胶囊高亮 + 出现「×」一键清除全部（按需求不做任何文字变化）
const hasExtras = computed(() => selectedTags.value.length > 0 || !!locationLabel.value.trim())
function clearExtras() {
  selectedTags.value = []
  locationLabel.value = ''
  locationId.value = null
  locationSelectorRef.value?.setPath([])   // 同步清掉级联选择器的内部路径
}

// —— 图片：输入框右下角小图标选图 + 整块对话区拖拽上传 ——
const imagePickerRef = ref<InstanceType<typeof AgentImagePicker>>()
const panelDragOver = ref(false)
// dragenter / dragleave 会在子元素之间反复触发，用深度计数判断是否真的离开了面板
let dragDepth = 0
function onPanelDragEnter(e: DragEvent) {
  if (!canSend.value) return
  if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return   // 只对「拖文件」响应
  dragDepth += 1
  panelDragOver.value = true
}
function onPanelDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) panelDragOver.value = false
}
async function onPanelDrop(e: DragEvent) {
  dragDepth = 0
  panelDragOver.value = false
  if (!canSend.value) return
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length) await imagePickerRef.value?.addFiles(files)
}
function pickImages() { imagePickerRef.value?.pick() }

// —— 限流冷却（120004）：进入 60 秒倒计时，期间禁止发送 ——
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null
function startCooldown(seconds = 60) {
  cooldown.value = seconds
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null }
  }, 1000)
}

const canSend = computed(() => !sending.value && cooldown.value === 0)
const sendLabel = computed(() => (cooldown.value > 0 ? `${cooldown.value}s` : '发送'))
const placeholder = computed(() => (sessionId.value
  ? '回复补充信息，或输入「确认」发布草稿、「取消」放弃；图片可通过拖拽上传'
  : '描述一下物品：丢了什么 / 在哪里捡到的 / 大概时间…；图片可通过拖拽上传（回车发送）'))

// 智能助手统一头像：后端上传目录下的静态图，展示时经 resolveImageUrl 拼源（相对 URL 约定）
const aiAvatarUrl = resolveImageUrl('/uploads/chensong.jpg')

// —— 右侧「试试这样说」示例弹窗 ——
// 开合状态不持久化，只有「是否已自动展示过」写 cookie：首次进入自动弹出一次，之后默认收起
const GUIDE_COOKIE = 'lnf-agent-guide-seen'
const drawerOpen = ref(false)
function toggleDrawer() { drawerOpen.value = !drawerOpen.value }

const EXAMPLES = [
  '我昨天下午在图书馆三楼丢了个黑色保温杯，带吸管的',
  '有人捡到黑色水杯吗',
  '我在食堂二楼捡到一张校园卡',
]

function useExample(text: string) {
  input.value = text
  // 选完就收起示例窗，避免窄屏下压住对话区
  drawerOpen.value = false
}

// 滚动到底部（不返回 Promise，避免各处 fire-and-forget 触发 lint 提示）
function scrollToBottom() {
  nextTick(() => {
    const el = streamRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// —— 「正在思考」霓虹炫彩框：三句文案每秒随机切换（文字 3D 竖转一圈），右侧星星高速自转 ——
const THINK_TEXTS = ['AI Deep Thinking', '智能体深度思考中', 'AI结果数据源精准比对中']
const thinkText = ref(THINK_TEXTS[0])
// 只作 :key 使用：值一变就重建节点，让 CSS 动画每秒重放一次
const thinkSeq = ref(0)
let thinkTimer: ReturnType<typeof setInterval> | null = null
function stopThinking() {
  if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null }
}
function startThinking() {
  stopThinking()
  thinkText.value = THINK_TEXTS[0]
  thinkSeq.value += 1
  thinkTimer = setInterval(() => {
    // 随机换一句，且不与当前重复（否则看不出切换动画）
    const rest = THINK_TEXTS.filter((t) => t !== thinkText.value)
    thinkText.value = rest[Math.floor(Math.random() * rest.length)]
    thinkSeq.value += 1
  }, 1000)
}
// 整个请求期间（含「确认 / 取消」这类显式动作）都亮着霓虹框
watch(sending, (on) => { on ? startThinking() : stopThinking() })

// —— 打字机：按每秒 40 字逐字渲染回答，制造「AI 一直在输出」的实时感 ——
const TYPE_TICK_MS = 1000 / 40 // 25ms/字
let typingTimer: ReturnType<typeof setInterval> | null = null
/** 已输出的文本（没有打字过程的消息整段返回） */
function visibleText(m: ChatMessage) {
  return m.typed == null ? m.text : (m.text || '').slice(0, m.typed)
}
/** 是否已输出完（未标记 typed 的视为已完成） */
function typingDone(m: ChatMessage) {
  return m.typed == null || m.typed >= (m.text || '').length
}
function stopTyping() {
  if (typingTimer) { clearInterval(typingTimer); typingTimer = null }
}
/** 把仍在打字的消息一次补全（新回答到来 / 重新开始时用） */
function finishTyping() {
  messages.value.forEach((m) => { if (m.typed != null && m.typed < (m.text || '').length) m.typed = undefined })
}
/** 对话流是否贴在底部附近：只有贴底时才自动跟随，避免打断用户向上翻看 */
function isNearBottom() {
  const el = streamRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120
}
/** 逐字输出某条回答：同一时刻只有一条在打字（新的一条会先补全上一条） */
function startTyping(id: number) {
  stopTyping()
  finishTyping()
  const msg = messages.value.find((m) => m.id === id)
  const total = (msg?.text || '').length
  if (!msg || !total) return
  msg.typed = 0
  scrollToBottom()
  typingTimer = setInterval(() => {
    // 每拍都从数组里重新取（拿到的是响应式代理，赋值才会触发重新渲染）
    const target = messages.value.find((m) => m.id === id)
    if (!target) { stopTyping(); return }
    const follow = isNearBottom()
    target.typed = Math.min(total, (target.typed ?? 0) + 1)
    if (follow) scrollToBottom()
    if (typingDone(target)) stopTyping()
  }, TYPE_TICK_MS)
}

// 「AI溯源，数据可信度 95 + 1~3 的随机数（保留两位小数）%」：每条回答生成一次，之后固定不变
function trustLine() {
  const extra = 1 + Math.random() * 2
  return `AI溯源，数据可信度${(95 + extra).toFixed(2)}%`
}

// 把「标签 / 地点」附加信息拼进描述：保留用户原句，附加项放进括号，便于后端抽取
function buildBody(raw: string, action: AgentAction): string {
  const base = raw.trim()
  // 显式动作（确认 / 取消）不依赖输入框：后端 text 必填，未输入内容时用固定文案兜底，
  // 这样点「确认发布 / 取消」按钮就能直接生效，不需要用户再补一句话
  if (action !== 'auto') return base || (action === 'confirm' ? '确认' : '取消')
  const extras: string[] = []
  if (locationLabel.value) extras.push(`地点：${locationLabel.value}`)
  if (selectedTags.value.length) extras.push(`特征：${selectedTags.value.join('、')}`)
  return extras.length ? `${base}（${extras.join('；')}）` : base
}

function clearComposer() {
  input.value = ''
  images.value = []
  clearExtras()
}

function applyResponse(data: AgentChatResponse) {
  if (data.session_id) sessionId.value = data.session_id
  const msg: ChatMessage = {
    id: nextId(),
    role: 'agent',
    text: data.reply || STAGE_HINT[data.stage] || '已处理，请继续描述。',
    trust: trustLine(),
    typed: 0,
    stage: data.stage,
    draft: data.draft,
    questions: data.questions ?? [],
    matches: data.matches ?? [],
    similar: data.similar ?? [],
    createdItemId: data.created_item_id ?? null,
  }
  messages.value.push(msg)
  // 会话已结束：本地清掉 session_id，下一轮按「新会话」处理（后端会覆盖旧会话）
  if (data.stage === 'created' || data.stage === 'cancelled') sessionId.value = null
  if (data.stage === 'created') store.fetchMyItems()   // 让「我的发布」立即能看到新帖
  startTyping(msg.id)                                  // 逐字渲染，不再整段弹出
}

function handleError(e: unknown) {
  const code = e instanceof ApiError ? e.code : undefined
  const raw = e instanceof Error ? e.message : String(e)
  let hint = raw || '请求失败，请稍后重试'
  if (code === 120001) {
    sessionId.value = null
    hint = `${hint}。已重置会话，请重新描述一次。`
  } else if (code === 120002) {
    hint = `${hint}。草稿仍然保留，可直接重试。`
  } else if (code === 120004) {
    startCooldown(60)
    hint = `${hint}。已进入 60 秒冷却倒计时。`
  } else if (code === 120005) {
    sessionId.value = null
    hint = `${hint}。已重置会话。`
  } else if (code === 120006) {
    agentDisabled.value = true
  }
  const id = nextId()
  messages.value.push({ id, role: 'agent', text: hint, failed: true, typed: 0 })
  startTyping(id)
}

async function send(action: AgentAction = 'auto') {
  if (!canSend.value) return
  if (agentDisabled.value) return
  const body = buildBody(input.value, action)
  if (!body) {
    // text 是后端必填项：图片只能作为辅助，不能单独提交
    ElMessage.warning(images.value.length
      ? '请再补一句文字描述（后端要求 text 必填，图片只能作为辅助）'
      : '请先描述一下物品情况（也可以选好标签 / 地点再发送）')
    return
  }
  if (body.length > MAX_TEXT) {
    ElMessage.warning(`描述过长（${body.length} 字，含所选标签 / 地点），请精简到 ${MAX_TEXT} 字以内`)
    return
  }

  const sentImages = [...images.value]
  messages.value.push({ id: nextId(), role: 'user', text: body, images: sentImages })
  clearComposer()
  sending.value = true
  scrollToBottom()
  try {
    const res = await chatAgent({
      session_id: sessionId.value ?? undefined,
      text: body,
      image_urls: sentImages.length ? sentImages : undefined,
      action,
    })
    applyResponse(res.data)
  } catch (e) {
    handleError(e)
  } finally {
    sending.value = false
  }
}

// 重新开始：关闭服务端会话（幂等，失败也不影响本地重置）
async function restart() {
  try { await closeAgentSession(sessionId.value ?? undefined) } catch { /* 忽略 */ }
  stopTyping()
  sessionId.value = null
  messages.value = [welcomeMessage()]
  clearComposer()
  ElMessage.success('已开始新的对话')
}

function goPosts() { router.push({ name: 'posts' }) }
function goPublish() { router.push({ name: 'publish' }) }
// 打开物品详情：交给 App.vue 的 openItemById（会拉详情并弹出详情弹窗）
function openItem(id?: number | null) { if (id != null) emit('open-item', id) }

// 首页「智能匹配」跳过来时会带 ?q=搜索词：预填到输入框，由用户确认后再发送（避免自动消耗限流额度）
onMounted(() => {
  const q = route.query.q
  if (typeof q === 'string' && q.trim()) {
    input.value = q.trim()
    ElMessage.info('已带入搜索关键词，按回车即可让助手帮你找')
  }
  // 首次进入自动展开示例窗，并写 cookie（之后不再自动展开，用户可点梯形按钮随时开合）
  if (!agentDisabled.value && !getCookie(GUIDE_COOKIE)) {
    drawerOpen.value = true
    setCookie(GUIDE_COOKIE, '1')
  }
  scrollToBottom()
})
onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
  stopTyping()
  stopThinking()
})
</script>

<template>
  <section class="agent-page" :class="{ 'has-drawer': drawerOpen && !agentDisabled }">
    <div class="section-intro">
      <span class="eyebrow">AI ASSISTANT</span>
      <h1>智能助手</h1>
      <p>说一句话就能发帖，也能让助手帮你翻找匹配的帖子。</p>
    </div>

    <!-- 对话区与示例弹窗同一行：弹窗的梯形按钮直接附着在对话面板的右边缘 -->
    <div class="agent-main">
      <!-- 120006：后端未开启 agent 功能时的降级态 -->
      <el-result
        v-if="agentDisabled"
        icon="warning"
        title="智能助手暂未开启"
        sub-title="后端当前未启用该功能，你可以直接前往「发布信息」手动登记，或稍后再来试试。"
        class="agent-disabled"
      >
        <template #extra>
          <el-button type="primary" @click="goPublish">去发布信息</el-button>
        </template>
      </el-result>

      <!-- 整块（对话 + 输入区）都是图片投放区：拖入未松手时显示灰色蒙雾 -->
      <div
        v-else
        class="agent-panel"
        :class="{ 'is-dragging': panelDragOver }"
        @dragenter.prevent="onPanelDragEnter"
        @dragover.prevent
        @dragleave.prevent="onPanelDragLeave"
        @drop.prevent="onPanelDrop"
      >
        <div ref="streamRef" class="agent-stream">
        <div v-for="m in messages" :key="m.id" class="agent-row" :class="m.role === 'user' ? 'agent-row-user' : 'agent-row-agent'">
          <div v-if="m.role === 'user'" class="agent-bubble agent-bubble-user">
            <span class="agent-bubble-text">{{ m.text }}</span>
            <div v-if="m.images?.length" class="agent-bubble-images">
              <img v-for="(url, i) in m.images" :key="url + '@' + i" :src="resolveImageUrl(url)" alt="已提交图片" />
            </div>
          </div>
          <template v-else>
            <img class="agent-avatar" :src="aiAvatarUrl" alt="智能助手" />
            <div class="agent-bubble agent-bubble-agent" :class="{ 'agent-bubble-failed': m.failed }">
              <p v-if="m.trust" class="agent-trust">{{ m.trust }}</p>
              <p class="agent-text">{{ visibleText(m) }}<span v-if="!typingDone(m)" class="agent-caret" aria-hidden="true"></span></p>

              <!-- 逐字输出完成后才展开草稿 / 候选 / 操作按钮：整块不一次性渲染 -->
              <template v-if="typingDone(m)">
              <p v-if="m.stage && STAGE_HINT[m.stage]" class="agent-stage-hint">{{ STAGE_HINT[m.stage] }}</p>

              <!-- 草稿预览（等用户确认） -->
              <div v-if="m.draft" class="agent-draft">
                <div class="agent-draft-head">
                  <span class="agent-draft-type" :class="m.draft.type === 0 ? 'lost' : 'found'">{{ m.draft.type === 0 ? '寻物' : '招领' }}</span>
                  <strong>{{ m.draft.title }}</strong>
                </div>
                <p v-if="m.draft.description" class="agent-draft-desc">{{ m.draft.description }}</p>
                <div class="agent-draft-meta">
                  <span v-if="m.draft.tag_names?.length">标签：{{ m.draft.tag_names.join('、') }}</span>
                  <span v-if="m.draft.location_name || m.draft.location_detail">地点：{{ m.draft.location_name }}{{ m.draft.location_detail ? ' ' + m.draft.location_detail : '' }}</span>
                  <span v-if="m.draft.contact">联系方式：{{ m.draft.contact }}</span>
                </div>
                <div v-if="m.questions?.length" class="agent-draft-questions">
                  <el-tag v-for="(q, i) in m.questions" :key="i" size="small" type="warning" effect="plain">{{ q }}</el-tag>
                </div>
              </div>

              <!-- 两步确认：仅 need_confirm 阶段出现（补充信息 / 明确确认才会建帖） -->
              <div v-if="m.stage === 'need_confirm'" class="agent-actions">
                <el-button type="primary" size="small" :disabled="!canSend" @click="send('confirm')">确认发布</el-button>
                <span class="agent-actions-hint">↓ 或直接在下方输入框回复「确认」/ 补充信息</span>
                <el-button size="small" :disabled="!canSend" @click="send('cancel')">取消</el-button>
              </div>

              <!-- 已建帖 -->
              <div v-if="m.stage === 'created'" class="agent-actions">
                <el-button v-if="m.createdItemId" type="primary" size="small" @click="openItem(m.createdItemId)">查看详情</el-button>
                <el-button size="small" @click="goPosts">去「我的发布」</el-button>
              </div>

              <!-- 候选匹配（item 即标准 ItemResponse，可点进详情） -->
              <div v-if="m.matches?.length" class="agent-matches">
                <article v-for="hit in m.matches" :key="hit.item_id" class="agent-match" @click="openItem(hit.item_id)">
                  <div class="agent-match-cover">
                    <img v-if="hit.item.images?.[0]?.image_url" :src="resolveImageUrl(hit.item.images[0].image_url)" alt="" />
                    <span v-else>{{ hit.item.type === 0 ? '◌' : '◉' }}</span>
                  </div>
                  <div class="agent-match-body">
                    <strong>{{ hit.item.title }}</strong>
                    <small>{{ (hit.item.locations || []).map((l) => l.name).join(' · ') }} · {{ (hit.item.created_at || '').slice(0, 10) }}</small>
                    <div class="agent-match-reasons">
                      <el-tag size="small" effect="plain" type="success">匹配度 {{ Math.round((hit.score ?? 0) * 100) }}%</el-tag>
                      <el-tag v-for="(r, i) in hit.reasons || []" :key="i" size="small" effect="plain">{{ r }}</el-tag>
                    </div>
                  </div>
                </article>
              </div>

              <!-- 同/异类型补充推荐 -->
              <div v-if="m.similar?.length" class="agent-similar">
                <span class="agent-similar-label">其它相关帖子</span>
                <button v-for="hit in m.similar" :key="hit.item_id" type="button" class="agent-similar-link" @click="openItem(hit.item_id)">{{ hit.item.title }}</button>
              </div>
              </template>
            </div>
          </template>
        </div>

        <div v-if="sending" class="agent-row agent-row-agent">
          <img class="agent-avatar" :src="aiAvatarUrl" alt="智能助手" />
          <!-- 思考期间：普通气泡换成霓虹炫彩框（蓝→紫→粉横向流动 + 文案 3D 竖转切换 + 星星高速自转） -->
          <!-- aria-live=off：文案每秒都在换，交给读屏逐秒播报会非常吵 -->
          <div class="agent-neon" role="status" aria-live="off">
            <span :key="thinkSeq" class="agent-neon-text">{{ thinkText }}</span>
            <span class="agent-neon-star" aria-hidden="true">✦</span>
          </div>
        </div>
      </div>

      <!-- 输入区（固定在面板底部）：已选图片 / 标签·地点胶囊 / 输入框 / 重新开始·发送 -->
      <div class="agent-composer">
          <!-- 已选图片：只显示缩略图，上传入口是输入框右下角的小图片图标 + 整块拖拽 -->
          <!-- v-show：无图时整块隐藏（.aip 无图时高度为 0 却仍占一个 flex 槽位，会让 composer 的 gap 在输入行上方多出一段间距） -->
          <AgentImagePicker v-show="images.length" ref="imagePickerRef" v-model="images" :max="3" :disabled="!canSend" hide-add class="agent-images" />

        <!-- 输入区：左边「标签 | 地点」胶囊、中间多行输入、右边「重新开始 / 发送」竖列 -->
        <div class="agent-input-row">
            <div class="agent-extras">
              <!-- 「可选」与胶囊同一行（垂直居中），不再单独占一行高度 -->
              <span class="agent-extras-label">可选</span>
              <div class="agent-extras-capsule" :class="{ 'is-on': hasExtras }">
                <!-- 标签（上） / 地点（下）上下两行，两行文字都居中 -->
                <div class="agent-extras-fields">
                  <el-select v-model="selectedTags" multiple collapse-tags placeholder="标签" class="agent-extra-tags">
                    <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.name" />
                  </el-select>
                  <span class="agent-extras-divider" aria-hidden="true"></span>
                  <LocationSelector ref="locationSelectorRef" v-model="locationLabel" v-model:location-id="locationId" placeholder="地点" class="agent-extra-location" />
                </div>
              <button v-if="hasExtras" type="button" class="agent-extras-clear" title="清除标签与地点" @click="clearExtras">×</button>
            </div>
          </div>

          <div class="agent-input-box">
            <el-input
              v-model="input"
              type="textarea"
              :rows="3"
              :maxlength="MAX_TEXT"
              resize="none"
              :placeholder="placeholder"
              @keydown.enter.exact.prevent="send()"
            />
            <div class="agent-input-tools">
              <span class="agent-count">{{ input.length }}/{{ MAX_TEXT }}</span>
              <button type="button" class="agent-img-btn" :disabled="!canSend" title="上传图片（JPG / PNG / WEBP，单张 ≤5MB，最多 3 张）" aria-label="上传图片" @click="pickImages">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="4.5" width="18" height="15" rx="3" stroke="currentColor" stroke-width="1.6" />
                  <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                  <path d="M4 16.4l4.7-4.7a1.4 1.4 0 0 1 2 0l4.6 4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div class="agent-actions-col">
            <button type="button" class="agent-restart" @click="restart"><span class="agent-restart-icon" aria-hidden="true">↻</span>重新开始</button>
            <button type="button" class="agent-send" :disabled="!canSend" @click="send()">
              <svg class="agent-send-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21.4 3.1 2.9 10.4l6.5 2.7 2.7 6.5z" fill="currentColor" />
                <path d="M9.4 13.1 21.4 3.1" stroke="#fff" stroke-width="1.3" stroke-linecap="round" />
              </svg>
              {{ sendLabel }}
            </button>
          </div>
        </div>

        <p v-if="cooldown > 0" class="agent-cooldown">已触发限流，{{ cooldown }} 秒后可再次发送</p>
      </div>

        <!-- 拖到整块对话区时的蒙雾提示（松手即上传） -->
        <div v-if="panelDragOver" class="agent-drop-mask">
          <svg class="agent-drop-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="6.5" y="11" width="35" height="26" rx="4.5" stroke="currentColor" stroke-width="2" />
            <circle cx="17.5" cy="20.5" r="3" fill="currentColor" />
            <path d="M9.5 33.5l9.2-9.2a2 2 0 0 1 2.9 0l6.4 6.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <strong>松开即可上传图片</strong>
          <span>支持 JPG / PNG / WEBP，单张 ≤5MB，最多 3 张</span>
        </div>
      </div>

      <!-- 示例弹窗：梯形按钮（短边向右）附着在对话面板的右边缘 -->
      <aside v-if="!agentDisabled" class="agent-drawer" :class="{ 'is-open': drawerOpen }">
        <button
          type="button"
          class="agent-drawer-toggle"
          :aria-expanded="drawerOpen"
          :title="drawerOpen ? '收起示例窗' : '展开示例窗，看看可以怎么说'"
          @click="toggleDrawer"
        >{{ drawerOpen ? '收起示例' : '试试这样说' }}</button>
        <div class="agent-drawer-body">
          <span class="agent-guide-title">试试这样说</span>
          <div class="agent-guide-chips">
            <button v-for="ex in EXAMPLES" :key="ex" type="button" class="agent-guide-chip" @click="useExample(ex)">{{ ex }}</button>
          </div>
          <p class="agent-guide-note">助手会先给出草稿，你回复「确认」或补充信息后才会真正发布；回复「取消」则放弃。</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
/* 整页不滚动：页面高度锁在视口内（顶栏 76 + page-wrap 上下内边距 46/80），只有对话流内部滚动 */
.agent-page{display:flex;flex-direction:column;height:calc(100vh - 202px);height:calc(100dvh - 202px);max-width:var(--page-max);margin:0 auto}
/* 展开示例窗时右侧多占一列，对话面板保持原有宽度 */
.agent-page.has-drawer{max-width:calc(var(--page-max) + 352px)}
.agent-disabled{margin-top:28px}
/* 对话面板 + 示例弹窗同一行：弹窗的梯形按钮正好落在面板右边缘 */
.agent-main{display:flex;align-items:stretch;flex:1;min-height:0}
.agent-panel{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-card)}
.agent-stream{flex:1;min-height:140px;overflow-y:auto;padding:20px 18px;display:flex;flex-direction:column;gap:14px;background:#f9fbf9;border-radius:var(--radius-lg) var(--radius-lg) 0 0}
/* 图片拖到面板任意位置（对话 + 输入区）时的灰色蒙雾 */
.agent-drop-mask{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;border-radius:var(--radius-lg);background:#5c6d6666;color:#fff;text-align:center;pointer-events:none}
.agent-drop-mask strong{font-size:15px}
.agent-drop-mask span{font-size:12px;opacity:.88}
.agent-drop-icon{width:46px;height:46px;opacity:.92;margin-bottom:2px}
.agent-guide-title{display:block;font-size:11px;color:#9aa9a1;letter-spacing:1.4px;font-weight:700;margin-bottom:10px}
.agent-guide-chips{display:flex;flex-wrap:wrap;gap:8px}
.agent-guide-chip{padding:8px 13px;border:1px solid var(--line);border-radius:18px;background:var(--surface-soft);color:#4b615a;font-size:12px;line-height:1.4;text-align:left;cursor:pointer}
.agent-guide-chip:hover{border-color:var(--green);color:var(--green);background:#f2faf6}
.agent-guide-note{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.6}
/* —— 示例弹窗：与对话面板同一行；梯形按钮带过渡地在「面板右缘（收起）↔ 示例框右缘（展开）」之间滑动 —— */
.agent-drawer{position:relative;flex:0 0 auto;width:0;transition:width var(--dur) var(--ease),padding-left var(--dur) var(--ease)}
/* 26（收起态按钮位）+ 300（示例框）+ 26（展开态按钮位）；flex-basis 保持 auto 才能让 width 过渡生效 */
.agent-page.has-drawer .agent-drawer{width:352px;padding-left:26px}
.agent-drawer-body{display:none}
.agent-page.has-drawer .agent-drawer-body{display:block;width:300px;height:100%;padding:16px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-card);animation:agent-drawer-in var(--dur) var(--ease) both}
@keyframes agent-drawer-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.agent-drawer-toggle{position:absolute;left:0;top:14px;display:grid;place-items:center;width:26px;height:96px;padding:0;border:0;background:var(--green);color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;writing-mode:vertical-rl;cursor:pointer;clip-path:polygon(0 0,100% 14%,100% 86%,0 100%);transition:transform var(--dur) var(--ease),background var(--dur) var(--ease)}
/* 展开时梯形滑到最右侧，吸附在「试试这样说」示例框的右边缘（26 左位 + 300 框宽 = 326） */
.agent-page.has-drawer .agent-drawer-toggle{transform:translateX(326px)}
.agent-drawer-toggle:hover{background:var(--green-dark)}
/* 弹窗较窄：示例竖排更易读 */
@media(min-width:1200px){
  .agent-drawer .agent-guide-chips{flex-direction:column;gap:6px}
  .agent-drawer .agent-guide-chip{width:100%}
}
.agent-row{display:flex;gap:10px;align-items:flex-start}
.agent-row-user{justify-content:flex-end}
.agent-avatar{width:30px;height:30px;flex:0 0 30px;border-radius:9px;object-fit:cover;display:block;border:1px solid var(--line);background:var(--surface-sidebar)}
.agent-bubble{max-width:78%;padding:11px 14px;border-radius:12px;font-size:13px;line-height:1.7;word-break:break-word}
.agent-bubble-user{margin-left:auto;background:var(--green);color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}
.agent-bubble-text{display:block;white-space:pre-wrap}
.agent-bubble-images{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.agent-bubble-images img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #ffffff59}
.agent-bubble-agent{background:var(--surface);border:1px solid var(--line);border-bottom-left-radius:4px;box-shadow:var(--shadow-xs)}
.agent-bubble-failed{background:#fff5f4;border-color:#f3d3cc;color:#b4553f}
.agent-text{margin:0;white-space:pre-wrap}
.agent-stage-hint{margin:8px 0 0;color:var(--muted);font-size:12px}
/* —— 思考中的霓虹炫彩框：横向流动的蓝→紫→粉渐变 + 文案 3D 竖转一圈 + 星星高速自转 —— */
/* 尺寸跟随内容、上限与 AI 回复气泡一致（.agent-bubble 的 max-width:78%），不再被 flex 拉满整行 */
.agent-neon{position:relative;flex:0 1 auto;max-width:78%;display:flex;align-items:center;gap:12px;min-height:48px;padding:12px 18px;border-radius:14px;border-bottom-left-radius:4px;overflow:hidden;perspective:640px;color:#fff;box-shadow:0 0 16px #7c3aed5c,0 0 32px #2563eb3d;animation:agent-neon-glow 1.6s ease-in-out infinite}
/* 渐变带宽度是元素的两倍、且首尾同色 → background-position 走满一周期时无缝衔接，看起来是一直流淌 */
.agent-neon::before{content:"";position:absolute;inset:0;background-image:linear-gradient(90deg,#2563eb,#7c3aed,#db2777,#2563eb,#7c3aed,#db2777,#2563eb);background-size:200% 100%;animation:agent-neon-flow 1.6s linear infinite}
.agent-neon>span{position:relative;z-index:1}
.agent-neon-text{flex:1 1 auto;text-align:center;font-size:13px;font-weight:700;letter-spacing:.4px;animation:agent-neon-flip .17s var(--ease) both}
.agent-neon-star{flex:0 0 auto;font-size:17px;line-height:1;text-shadow:0 0 8px #fff,0 0 18px #a78bfa;animation:agent-neon-spin .7s linear infinite}
@keyframes agent-neon-flow{from{background-position:0% 50%}to{background-position:100% 50%}}
@keyframes agent-neon-flip{from{transform:rotateX(-360deg) scale(.9);opacity:0}60%{opacity:1}to{transform:rotateX(0) scale(1);opacity:1}}
@keyframes agent-neon-spin{to{transform:rotate(360deg)}}
@keyframes agent-neon-glow{0%,100%{box-shadow:0 0 14px #7c3aed4d,0 0 26px #2563eb33}50%{box-shadow:0 0 24px #db277766,0 0 44px #7c3aed4d}}
/* 回答第一行上方的溯源行 */
.agent-trust{margin:0 0 7px;display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border:1px solid #e0dbff;border-radius:var(--radius-pill);background:linear-gradient(90deg,#eff4ff,#f7f0ff 55%,#fff0f7);color:#6a5acd;font-size:11px;font-weight:700;letter-spacing:.2px}
.agent-trust::before{content:"✦";font-size:10px}
/* 逐字输出时的光标（复用 agent-blink 的呼吸效果） */
.agent-caret{display:inline-block;width:2px;height:.95em;margin-left:2px;vertical-align:-2px;background:currentColor;animation:agent-blink 1s infinite}
@keyframes agent-blink{0%,100%{opacity:.25}50%{opacity:1}}
/* 尊重系统「减少动态效果」偏好：只关动画，不影响内容与配色 */
@media(prefers-reduced-motion:reduce){
  .agent-neon,.agent-neon::before,.agent-neon-text,.agent-neon-star,.agent-caret{animation:none}
}
/* 窄屏：霓虹框文字缩小、允许折成两行，避免被裁切 */
@media(max-width:700px){
  .agent-neon{gap:8px;padding:10px 12px}
  .agent-neon-text{font-size:12px}
  .agent-neon-star{font-size:15px}
}
.agent-draft{margin-top:10px;padding:12px 14px;border:1px dashed #cfe7dc;border-radius:10px;background:#f4faf7}
.agent-draft-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.agent-draft-head strong{font-size:13px}
.agent-draft-type{font-size:10px;font-weight:700;border-radius:10px;padding:2px 8px;background:#dbe9ff;color:#3d6fb5}
.agent-draft-type.lost{background:#fde8de;color:#b56a3d}
.agent-draft-type.found{background:#d8f1e8;color:#2f8f6c}
.agent-draft-desc{margin:8px 0 0;color:#4b5563;font-size:12px;line-height:1.7}
.agent-draft-meta{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;color:var(--muted);font-size:12px}
.agent-draft-questions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.agent-actions{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
/* 二次确认引导：夹在「确认发布」和「取消」之间，明确告诉用户也可以直接在下方回复 */
.agent-actions-hint{padding:5px 12px;border:1px solid #f0dfb8;border-radius:var(--radius-pill);background:#fff7e6;color:#8a6b22;font-size:11.5px;line-height:1.5}
.agent-matches{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.agent-match{display:flex;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}
.agent-match:hover{border-color:var(--green);box-shadow:0 6px 16px #19332f12}
.agent-match-cover{width:46px;height:46px;flex:0 0 46px;display:grid;place-items:center;overflow:hidden;border-radius:9px;background:#edf5ee;color:#96b3a6;font-size:18px}
.agent-match-cover img{width:100%;height:100%;object-fit:cover}
.agent-match-body{display:flex;flex-direction:column;gap:4px;min-width:0}
.agent-match-body strong{font-size:13px;line-height:1.4}
.agent-match-body small{color:var(--muted);font-size:11px}
.agent-match-reasons{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.agent-similar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px}
.agent-similar-label{color:#9aa9a1;font-size:11px;letter-spacing:.6px}
.agent-similar-link{color:var(--green);font-size:12px;text-decoration:underline;text-underline-offset:3px}
.agent-composer{flex:0 0 auto;display:flex;flex-direction:column;gap:12px;padding:14px 18px 16px;border-top:1px solid #edf1ed;background:#fff;border-radius:0 0 var(--radius-lg) var(--radius-lg)}
.agent-images{width:100%}
/* 三块（可选胶囊 / 输入框 / 按钮列）保持等高：统一取 --row-h；「可选」小字在胶囊之外，不计入高度 */
.agent-input-row{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;--row-h:96px}
/* 左：标签（上）/ 地点（下）上下两行塞进一个胶囊，两行之间一条横线；「可选」与胶囊同行并垂直居中（不占额外高度） */
.agent-extras{flex:0 0 250px;display:flex;align-items:center;gap:8px}
.agent-extras-label{flex:0 0 auto;white-space:nowrap;color:var(--muted-2);font-size:10px;font-weight:700;letter-spacing:1.2px}
.agent-extras-capsule{flex:1 1 auto;min-width:0;display:flex;align-items:center;height:var(--row-h);padding:0 8px 0 10px;border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface);transition:border-color var(--dur) var(--ease),background var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}
.agent-extras-capsule:focus-within{box-shadow:0 0 0 2px var(--green-soft)}
.agent-extras-capsule.is-on{border-color:var(--green);background:var(--green-soft)}
.agent-extras-fields{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
.agent-extras-divider{flex:0 0 1px;height:1px;margin:0 10px;background:var(--line)}
.agent-extras-clear{flex:0 0 auto;width:20px;height:20px;margin-left:5px;padding:0;border:0;border-radius:50%;background:#00000014;color:#6b7a73;font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer}
.agent-extras-clear:hover{background:#e06c75;color:#fff}
.agent-extra-tags,.agent-extra-location{width:100%;min-width:0}
.agent-extras-capsule :deep(.el-select),.agent-extras-capsule :deep(.el-input),.agent-extras-capsule :deep(.el-cascader){width:100%}
.agent-extras-capsule :deep(.el-select__wrapper),.agent-extras-capsule :deep(.el-input__wrapper){background:transparent!important;box-shadow:none!important;padding:0 4px}
.agent-extras-capsule :deep(.el-select__placeholder),.agent-extras-capsule :deep(.el-input__inner){font-size:12px}
/* 两行文字居中：select 的占位是绝对定位块（只能 text-align）、tag 列表与 cascader 输入框分别用两种手段覆盖 */
.agent-extras-capsule :deep(.el-select__selection),
.agent-extras-capsule :deep(.el-select__placeholder),
.agent-extras-capsule :deep(.el-select__selected-item),
.agent-extras-capsule :deep(.el-cascader__tags),
.agent-extras-capsule :deep(input){text-align:center}
.agent-extras-capsule :deep(.el-select__selection),
.agent-extras-capsule :deep(.el-cascader__tags){justify-content:center}
.agent-extras-capsule :deep(.location-selector){gap:0;flex-wrap:nowrap;width:100%}
.agent-extras-capsule :deep(.location-selector .loc-cascader){flex:1 1 100%}
/* 中：输入框（右下角是字数统计与小图片图标）—— 与左右两块同高 */
.agent-input-box{position:relative;flex:1 1 280px;min-width:240px}
.agent-input-box :deep(.el-textarea){width:100%}
.agent-input-box :deep(.el-textarea__inner){height:var(--row-h);min-height:var(--row-h)!important;padding:10px 12px 30px;border-radius:var(--radius-md);box-shadow:0 0 0 1px var(--line) inset}
.agent-input-box :deep(.el-textarea__inner:focus){box-shadow:0 0 0 1px var(--green) inset}
.agent-input-tools{position:absolute;right:10px;bottom:7px;display:flex;align-items:center;gap:8px}
.agent-count{color:var(--muted-2);font-size:11px;font-variant-numeric:tabular-nums}
.agent-img-btn{width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:#8fa39a;display:grid;place-items:center;cursor:pointer;transition:color var(--dur) var(--ease),background var(--dur) var(--ease)}
.agent-img-btn svg{width:17px;height:17px}
.agent-img-btn:hover:not(:disabled){background:var(--green-soft);color:var(--green)}
.agent-img-btn:disabled{opacity:.45;cursor:not-allowed}
/* 右：「重新开始」（上）与「发送」（下）等宽等高（各 40px），整体在列内竖直居中；列宽收窄到 108px */
.agent-actions-col{flex:0 0 108px;height:var(--row-h);display:flex;flex-direction:column;justify-content:center;gap:8px}
.agent-restart{display:flex;align-items:center;justify-content:center;gap:5px;flex:0 0 auto;height:40px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--green-soft);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;transition:border-color var(--dur) var(--ease),color var(--dur) var(--ease)}
.agent-restart:hover{border-color:var(--green);color:var(--green)}
.agent-restart-icon{font-size:14px;line-height:1}
.agent-send{display:flex;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;height:40px;border:0;border-radius:var(--radius-md);background:var(--green);color:#fff;font-size:13px;font-weight:700;box-shadow:0 5px 12px #42b98330;cursor:pointer;transition:background var(--dur) var(--ease)}
.agent-send-icon{width:16px;height:16px}
.agent-send:hover:not(:disabled){background:var(--green-dark)}
.agent-send:disabled{background:#b9c4bf;box-shadow:none;cursor:not-allowed}
.agent-cooldown{margin:0;color:#c9952f;font-size:11.5px}
/* 中窄屏：示例窗改为对话区上方的流内块（不再占右侧一列），任何宽度下都不遮挡对话 */
@media(max-width:1199px){
  .agent-page.has-drawer{max-width:var(--page-max)}
  .agent-main{flex-direction:column;gap:14px}
  .agent-drawer{order:-1;width:auto}
  .agent-page.has-drawer .agent-drawer{flex:0 0 auto;width:auto;padding-left:0}
  .agent-page.has-drawer .agent-drawer-body{width:auto;max-height:min(38vh,300px);margin-top:10px}
  .agent-drawer-toggle{position:static;transform:none;width:auto;height:auto;padding:6px 16px;font-size:12px;letter-spacing:0;writing-mode:horizontal-tb;clip-path:polygon(0 0,96% 0,100% 100%,0 100%)}
}
@media(max-width:900px){
  .agent-extras{flex:1 1 100%}
}
@media(max-width:700px){
  .agent-bubble{max-width:88%}
  /* 窄屏三块改为上下排列，不再需要等高（--row-h 置为 auto 即取消固定高度） */
  .agent-input-row{align-items:stretch;--row-h:auto}
  .agent-extras,.agent-input-box,.agent-actions-col{flex:1 1 100%;min-width:0}
  .agent-extras-capsule{height:auto;padding:6px 8px 6px 10px}
  .agent-input-box :deep(.el-textarea__inner){min-height:88px!important}
  .agent-actions-col{flex-direction:row;height:auto}
  .agent-actions-col .agent-restart,.agent-actions-col .agent-send{flex:1 1 0;height:40px}
}
/* ≤640px 时 page-wrap 内边距变为 30/60，可用高度相应多出 36px */
@media(max-width:640px){
  .agent-page{height:calc(100vh - 166px);height:calc(100dvh - 166px)}
}
</style>
