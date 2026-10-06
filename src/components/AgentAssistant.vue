<script setup lang="ts">
// 智能助手（学生端独立菜单页）：对话式发帖 + 自然语言找匹配
// 契约（api_agent.md §7 / api_guide.md §十三）：
//   · POST /agent/chat 主入口 —— 首轮不带 session_id → stage=need_confirm + draft
//     次轮【必须回传 session_id】；只有「补充信息」或「明确确认」才建帖；其他内容一律 stage=cancelled
//   · POST /agent/session/close 关闭会话（幂等）
//   · 限流：三个 /agent/* 共享每用户 10 次/分钟（120004）；单次 LLM 耗时 2~8 秒（api 层已设 30s 超时）
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
  ? '回复补充信息，或输入「确认」发布草稿、「取消」放弃'
  : '描述一下物品：丢了什么 / 在哪里捡到的 / 大概时间…（回车发送）'))

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

// 把「标签 / 地点」附加信息拼进描述：保留用户原句，附加项放进括号，便于后端抽取
function buildBody(raw: string, action: AgentAction): string {
  const base = raw.trim()
  if (action !== 'auto') return base           // 确认 / 取消是显式动作，不拼接附加信息
  const extras: string[] = []
  if (locationLabel.value) extras.push(`地点：${locationLabel.value}`)
  if (selectedTags.value.length) extras.push(`特征：${selectedTags.value.join('、')}`)
  return extras.length ? `${base}（${extras.join('；')}）` : base
}

function clearComposer() {
  input.value = ''
  selectedTags.value = []
  images.value = []
  locationLabel.value = ''
  locationId.value = null
  locationSelectorRef.value?.setPath([])   // 同步清掉级联选择器的内部路径
}

function applyResponse(data: AgentChatResponse) {
  if (data.session_id) sessionId.value = data.session_id
  messages.value.push({
    id: nextId(),
    role: 'agent',
    text: data.reply || STAGE_HINT[data.stage] || '已处理，请继续描述。',
    stage: data.stage,
    draft: data.draft,
    questions: data.questions ?? [],
    matches: data.matches ?? [],
    similar: data.similar ?? [],
    createdItemId: data.created_item_id ?? null,
  })
  // 会话已结束：本地清掉 session_id，下一轮按「新会话」处理（后端会覆盖旧会话）
  if (data.stage === 'created' || data.stage === 'cancelled') sessionId.value = null
  if (data.stage === 'created') store.fetchMyItems()   // 让「我的发布」立即能看到新帖
  scrollToBottom()
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
  messages.value.push({ id: nextId(), role: 'agent', text: hint, failed: true })
  scrollToBottom()
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
onBeforeUnmount(() => { if (cooldownTimer) clearInterval(cooldownTimer) })
</script>

<template>
  <section class="agent-page" :class="{ 'has-drawer': drawerOpen && !agentDisabled }">
    <div class="section-intro">
      <span class="eyebrow">AI ASSISTANT</span>
      <h1>智能助手</h1>
      <p>说一句话就能发帖，也能让助手帮你翻找匹配的帖子。</p>
    </div>

    <!-- 右侧「试试这样说」示例弹窗：梯形按钮可开合；首次进入自动展开（cookie 记忆） -->
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
        <p class="agent-guide-note">助手会先给出草稿，你回复「确认」或补充信息后才会真正发布；回复「取消」则放弃。也可以附上物品照片（最多 3 张）辅助识别。</p>
      </div>
    </aside>

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

    <div v-else class="agent-panel">
      <div class="agent-panel-head">
        <span class="agent-status" :class="{ 'agent-status-on': !!sessionId }">
          {{ sessionId ? '会话进行中（30 分钟内有效）' : '等待你的描述' }}
        </span>
        <button type="button" class="agent-restart" @click="restart">↻ 重新开始</button>
      </div>

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
              <p class="agent-text">{{ m.text }}</p>
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
            </div>
          </template>
        </div>

        <div v-if="sending" class="agent-row agent-row-agent">
          <img class="agent-avatar" :src="aiAvatarUrl" alt="智能助手" />
          <div class="agent-bubble agent-bubble-agent agent-thinking">正在思考…<i class="agent-dots">···</i></div>
        </div>
      </div>

      <!-- 输入区：标签 / 地点均为可选，发送时自动拼接进描述（例：原句（地点：屏峰校区 · 图书馆；特征：水杯、黑色）） -->
      <div class="agent-composer">
        <div class="agent-extras">
          <div class="agent-extra">
            <span class="agent-extra-label">物品标签<i>可选</i></span>
            <el-select v-model="selectedTags" multiple collapse-tags clearable placeholder="可多选，例如：水杯、黑色" class="agent-extra-select">
              <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.name" />
            </el-select>
          </div>
          <div class="agent-extra">
            <span class="agent-extra-label">地点<i>可选</i></span>
            <LocationSelector ref="locationSelectorRef" v-model="locationLabel" v-model:location-id="locationId" />
          </div>
        </div>

        <div class="agent-input-row">
          <el-input
            v-model="input"
            type="textarea"
            :rows="3"
            :maxlength="MAX_TEXT"
            show-word-limit
            resize="none"
            :placeholder="placeholder"
            @keydown.enter.exact.prevent="send()"
          />
          <button type="button" class="agent-send" :disabled="!canSend" @click="send()">{{ sendLabel }}</button>
        </div>
        <!-- 多模态：图片作为文本的补充（后端要求 text 必填） -->
        <div class="agent-image-row">
          <AgentImagePicker v-model="images" :max="3" :disabled="!canSend" />
        </div>
        <p class="agent-tip">
          回车发送 · 可附图片（最多 3 张）辅助识别 · 助手先给草稿，回复「确认」或补充信息才会发布 · 单次约 2~8 秒，请不要重复提交
          <span v-if="cooldown > 0" class="agent-cooldown">（已触发限流，{{ cooldown }} 秒后可再次发送）</span>
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 整页不滚动：页面高度锁在视口内（顶栏 76 + page-wrap 上下内边距 46/80），只有对话流内部滚动 */
.agent-page{display:flex;flex-direction:column;height:calc(100vh - 202px);height:calc(100dvh - 202px);max-width:880px;transition:max-width var(--dur) var(--ease),padding-right var(--dur) var(--ease)}
/* 示例窗展开时为它预留右侧空间：对话区整体左移，弹窗绝不压住对话（≤1199px 见下方媒体查询） */
.agent-page.has-drawer{max-width:calc(880px + 316px);padding-right:316px}
.agent-disabled{margin-top:28px}
.agent-panel{flex:1;min-height:0;display:flex;flex-direction:column;margin-top:22px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-card)}
.agent-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-bottom:1px solid #edf1ed;background:#fbfcfa;border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.agent-status{font-size:11px;color:#9aa9a1;letter-spacing:.3px}
.agent-status-on{color:var(--green);font-weight:700}
.agent-restart{font-size:12px;color:#6b7a73;padding:5px 11px;border:1px solid var(--line);border-radius:16px;background:#fff}
.agent-restart:hover{border-color:var(--green);color:var(--green)}
.agent-stream{flex:1;min-height:140px;overflow-y:auto;padding:20px 18px;display:flex;flex-direction:column;gap:14px;background:#f9fbf9}
.agent-guide-title{display:block;font-size:11px;color:#9aa9a1;letter-spacing:1.4px;font-weight:700;margin-bottom:10px}
.agent-guide-chips{display:flex;flex-wrap:wrap;gap:8px}
.agent-guide-chip{padding:8px 13px;border:1px solid var(--line);border-radius:18px;background:#fff;color:#4b615a;font-size:12px;line-height:1.4}
.agent-guide-chip:hover{border-color:var(--green);color:var(--green);background:#f2faf6}
.agent-guide-note{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.6}
/* —— 右侧「试试这样说」示例弹窗：浮在页面右侧，梯形按钮贴在它的左边缘 —— */
.agent-drawer{position:fixed;top:96px;right:0;width:300px;z-index:30;pointer-events:none}
.agent-drawer-body{pointer-events:auto;padding:16px 16px 14px;background:var(--surface);border:1px solid var(--line);border-right:0;border-radius:var(--radius-lg) 0 0 var(--radius-lg);box-shadow:var(--shadow-pop);max-height:min(58vh,440px);overflow-y:auto;transform:translateX(100%);transition:transform var(--dur) var(--ease)}
.agent-drawer.is-open .agent-drawer-body{transform:none}
.agent-drawer-toggle{pointer-events:auto;position:absolute;left:-30px;top:14px;display:grid;place-items:center;width:30px;height:96px;padding:0;border:0;background:var(--green);color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;writing-mode:vertical-rl;cursor:pointer;clip-path:polygon(0 14%,100% 0,100% 100%,0 86%);transition:background var(--dur) var(--ease)}
.agent-drawer-toggle:hover{background:var(--green-dark)}
/* 宽屏下弹窗较窄：示例做成竖排更易读 */
@media(min-width:1200px){
  .agent-drawer .agent-guide-chips{flex-direction:column;gap:6px}
  .agent-drawer .agent-guide-chip{width:100%;text-align:left;background:var(--surface-soft)}
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
.agent-thinking{display:flex;align-items:center;gap:6px;color:var(--muted)}
.agent-dots{letter-spacing:2px;font-style:normal;animation:agent-blink 1.2s infinite}
@keyframes agent-blink{0%,100%{opacity:.25}50%{opacity:1}}
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
.agent-composer{flex:0 0 auto;padding:14px 18px 16px;border-top:1px solid #edf1ed;background:#fff;border-radius:0 0 var(--radius-lg) var(--radius-lg)}
.agent-image-row{margin-top:10px}
/* 物品标签 / 地点：并排一行（≤700px 自动回落为单列） */
.agent-extras{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-bottom:12px}
.agent-extra{display:grid;grid-template-columns:88px 1fr;gap:10px;align-items:start}
.agent-extra-label{color:#6b7a73;font-size:12px;line-height:32px}
.agent-extra-label i{margin-left:4px;color:#b6bfba;font-size:10px;font-style:normal}
.agent-extra-select{width:100%}
.agent-input-row{display:flex;gap:10px;align-items:flex-end}
.agent-input-row :deep(.el-textarea){flex:1}
.agent-send{flex:0 0 84px;height:38px;border-radius:9px;background:var(--green);color:#fff;font-size:13px;font-weight:700;box-shadow:0 5px 12px #42b98330}
.agent-send:hover:not(:disabled){background:#369976}
.agent-send:disabled{background:#b9c4bf;box-shadow:none;cursor:not-allowed}
.agent-tip{margin:10px 0 0;color:var(--muted);font-size:11px;line-height:1.6}
.agent-cooldown{color:#c9952f}
/* 中窄屏：示例窗改为流内块，放在对话区上方（不再浮层）—— 任何宽度下都不遮挡对话 */
@media(max-width:1199px){
  .agent-page.has-drawer{max-width:880px;padding-right:0}
  .agent-drawer{position:static;width:auto;margin-top:16px;pointer-events:auto}
  .agent-drawer-body{transform:none;border-right:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-xs);max-height:min(38vh,320px);margin-top:10px}
  .agent-drawer:not(.is-open) .agent-drawer-body{display:none}
  .agent-drawer-toggle{position:static;width:auto;height:auto;padding:6px 16px;font-size:12px;letter-spacing:0;writing-mode:horizontal-tb;clip-path:polygon(0 0,96% 0,100% 100%,0 100%)}
}
@media(max-width:700px){
  .agent-extras{grid-template-columns:1fr}
  .agent-extra{grid-template-columns:1fr}
  .agent-extra-label{line-height:1.4}
  .agent-bubble{max-width:88%}
  .agent-input-row{flex-direction:column;align-items:stretch}
  .agent-send{width:100%;flex:0 0 auto}
}
/* ≤640px 时 page-wrap 内边距变为 30/60，可用高度相应多出 36px */
@media(max-width:640px){
  .agent-page{height:calc(100vh - 166px);height:calc(100dvh - 166px)}
}
</style>
