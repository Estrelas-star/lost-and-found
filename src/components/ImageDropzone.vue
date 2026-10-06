<script setup lang="ts">
// 通用「图片拖放上传区」：全站统一的图片上传入口
//  · 视觉：与其它表单项同宽 + 固定较大高度，空态显示浅色「空盒子」图标与引导文案
//  · 交互：整框可点击选择文件，也可直接把图片拖进来；拖入时高亮，键盘 Enter/Space 亦可触发
//  · 职责边界：本组件只做「收集 + 预校验（类型 / 大小 / 张数）」与预览展示，
//    真正的上传仍由调用方按各自流程处理（有的立即上传，有的先攒成待上传队列）
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { resolveImageUrl } from '../utils/image'

const props = withDefaults(defineProps<{
  /** 已上传图片的相对 URL（多图模式展示缩略图，单图模式铺满整框） */
  previews?: string[]
  /** single：只保留一张（用于头像 / 商品主图）；multi：多张上限 max 张 */
  mode?: 'multi' | 'single'
  /** 多图上限；0 表示按 mode 取默认（single→1，multi→9） */
  max?: number
  disabled?: boolean
  /** 上传中（由调用方控制，仅影响文案与交互禁用） */
  loading?: boolean
  label?: string
  hint?: string
  /** 追加一行说明（例如「已选 2 张，保存时一并上传」） */
  note?: string
  /** 单图模式是否显示「移除」按钮（头像等无需清空的场景可关掉） */
  removable?: boolean
}>(), {
  previews: () => [],
  mode: 'multi',
  max: 0,
  disabled: false,
  loading: false,
  label: '',
  hint: '',
  note: '',
  removable: true,
})

const emit = defineEmits<{ files: [File[]]; remove: [number] }>()

// 与 api/upload.ts 的前端预检保持一致（避免明显不合规的文件白跑一趟上传）
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024

const dragOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const limit = computed(() => props.max || (props.mode === 'single' ? 1 : 9))
const busy = computed(() => props.disabled || props.loading)
const hasPreview = computed(() => props.previews.length > 0)
const isMultiWithPreview = computed(() => props.mode === 'multi' && hasPreview.value)
const isFull = computed(() => props.mode === 'multi' && props.previews.length >= limit.value)
const mainLabel = computed(() => props.label || `拖拽图片到此处，或点击选择${props.mode === 'multi' ? `（最多 ${limit.value} 张）` : ''}`)
const subHint = computed(() => props.hint || '支持 JPG / PNG / WEBP，单张不超过 5MB')

/** 类型 / 大小 / 张数三重预检，返回可交给调用方上传的文件 */
function collect(list: FileList | File[] | null | undefined): File[] {
  const all = Array.from(list || [])
  if (!all.length) return []

  const images = all.filter((f) => f.type.startsWith('image/'))
  if (!images.length) { ElMessage.warning('只能上传图片文件（JPG / PNG / WEBP）'); return [] }
  if (images.length < all.length) ElMessage.warning(`已忽略 ${all.length - images.length} 个非图片文件`)

  // 部分来源（拖拽 / 截图）可能不带 MIME，这类交给后端校验，不在这里硬拦
  const wrongType = images.filter((f) => f.type && !ALLOWED_TYPES.includes(f.type))
  const typed = images.filter((f) => !f.type || ALLOWED_TYPES.includes(f.type))
  if (wrongType.length) ElMessage.warning(`${wrongType.length} 个文件格式不支持，仅支持 JPG / PNG / WEBP`)

  const oversize = typed.filter((f) => f.size > MAX_SIZE)
  const sized = typed.filter((f) => f.size <= MAX_SIZE)
  if (oversize.length) ElMessage.warning(`${oversize.length} 张图片超过 5MB，已跳过`)

  // 单图模式：新选的一张视为「替换」，不受已有图片数量限制
  const room = props.mode === 'single' ? 1 : Math.max(0, limit.value - props.previews.length)
  if (room <= 0) { ElMessage.warning(`最多 ${limit.value} 张，请先移除已有图片`); return [] }
  const picked = sized.slice(0, room)
  if (sized.length > room) ElMessage.warning(`最多 ${limit.value} 张，已忽略多余的 ${sized.length - room} 张`)
  return picked
}

function takeFiles(list: FileList | null | undefined) {
  if (busy.value) return
  const picked = collect(list)
  if (picked.length) emit('files', picked)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  input.value = ''   // 清空 value，允许重复选择同一个文件
  takeFiles(files)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (!busy.value) dragOver.value = true
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  takeFiles(e.dataTransfer?.files)
}

function openPicker() {
  if (busy.value) return
  if (isFull.value) { ElMessage.warning(`最多 ${limit.value} 张，请先移除已有图片`); return }
  inputRef.value?.click()
}
</script>

<template>
  <div
    class="idz"
    :class="{ 'is-over': dragOver, 'is-busy': busy, 'is-full': isFull, 'has-preview': hasPreview }"
    role="button"
    :tabindex="busy ? -1 : 0"
    :aria-disabled="busy"
    :aria-label="mainLabel"
    @click="openPicker"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
    @dragover.stop="onDragOver"
    @dragleave.stop.prevent="dragOver = false"
    @drop.stop="onDrop"
  >
    <input
      ref="inputRef"
      class="idz-input"
      type="file"
      accept="image/*"
      :multiple="mode === 'multi'"
      :disabled="busy"
      @change="onPick"
    />

    <!-- 单图模式且有图：图片铺满整框，可更换 / 移除 -->
    <template v-if="mode === 'single' && hasPreview">
      <img class="idz-cover" :src="resolveImageUrl(previews[0])" alt="已上传图片" />
      <div class="idz-cover-mask">
        <span class="idz-cover-text">{{ loading ? '上传中…' : '点击更换，或拖入新图片' }}</span>
        <button v-if="removable" type="button" class="idz-remove" :disabled="busy" @click.stop="emit('remove', 0)">移除</button>
      </div>
    </template>

    <!-- 多图模式且有图：缩略图 + 继续添加提示 -->
    <template v-else-if="isMultiWithPreview">
      <div class="idz-thumbs">
        <div v-for="(url, i) in previews" :key="url + '@' + i" class="idz-thumb">
          <img :src="resolveImageUrl(url)" :alt="`已上传图片 ${i + 1}`" />
          <button type="button" class="idz-remove" :disabled="busy" :title="`移除第 ${i + 1} 张`" @click.stop="emit('remove', i)">×</button>
        </div>
      </div>
      <div class="idz-tail">
        <span class="idz-tail-icon" aria-hidden="true">＋</span>
        <span>{{ loading ? '上传中…' : isFull ? `已选满 ${limit} 张` : '继续拖入或点击添加' }}</span>
      </div>
      <span v-if="note" class="idz-note">{{ note }}</span>
    </template>

    <!-- 空态：浅色「空盒子」图标 + 引导文案 -->
    <template v-else>
      <svg class="idz-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="6.5" y="11" width="35" height="26" rx="4.5" />
        <circle cx="17.5" cy="20.5" r="3" />
        <path d="M9.5 33.5l9.2-9.2a2 2 0 0 1 2.9 0l6.4 6.4" />
        <path d="M25.5 30.7l4.9-4.9a2 2 0 0 1 2.9 0l5.4 5.4" />
      </svg>
      <span class="idz-label">{{ busy ? '上传中…' : mainLabel }}</span>
      <span class="idz-hint">{{ subHint }}</span>
      <span v-if="note" class="idz-note">{{ note }}</span>
    </template>
  </div>
</template>

<style scoped>
.idz{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;min-height:152px;padding:20px 18px;border:1.5px dashed #cddcd4;border-radius:var(--radius-lg);background:var(--surface-soft);color:var(--muted-2);cursor:pointer;text-align:center;transition:border-color var(--dur) var(--ease),background var(--dur) var(--ease),color var(--dur) var(--ease)}
.idz:hover{border-color:var(--green);background:var(--green-soft);color:var(--green)}
.idz.is-over{border-style:solid;border-color:var(--green);background:var(--green-soft);color:var(--green);box-shadow:inset 0 0 0 1px var(--green-light)}
.idz.is-busy{cursor:progress;border-style:solid;background:var(--surface-accent)}
.idz.is-full{cursor:not-allowed}
.idz:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.idz-input{display:none}
/* 浅色「空盒子」图标：空态主视觉，hover / 拖入时加深 */
.idz-icon{width:44px;height:44px;stroke:#c6d6cd;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.55;transition:stroke var(--dur) var(--ease),opacity var(--dur) var(--ease)}
.idz:hover .idz-icon,.idz.is-over .idz-icon{stroke:var(--green);opacity:.9}
.idz-label{font-size:13px;font-weight:600;color:#6b7f76}
.idz:hover .idz-label,.idz.is-over .idz-label{color:var(--green)}
.idz-hint{font-size:11.5px;line-height:1.6}
.idz-note{border-radius:var(--radius-pill);background:var(--green-soft);color:var(--green);font-size:11.5px;padding:3px 11px}
/* 多图缩略图 */
.idz-thumbs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;width:100%}
.idz-thumb{position:relative;width:64px;height:64px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--line);background:var(--surface-sidebar)}
.idz-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.idz-tail{display:inline-flex;align-items:center;gap:6px;font-size:12px}
.idz-tail-icon{color:var(--green);font-size:14px;line-height:1}
/* 单图模式：图片铺满整框 */
.idz-cover{width:100%;max-height:240px;object-fit:cover;border-radius:var(--radius-md);display:block}
.idz-cover-mask{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
.idz-cover-text{font-size:12px}
.idz-remove{border:0;border-radius:var(--radius-pill);background:#000000a6;color:#fff;font-size:12px;line-height:1.4;padding:4px 13px;cursor:pointer;transition:background var(--dur) var(--ease)}
.idz-remove:hover{background:#e06c75}
.idz-remove:disabled{opacity:.45;cursor:not-allowed}
.idz-thumb .idz-remove{position:absolute;top:0;right:0;width:18px;height:18px;padding:0;border-radius:0 var(--radius-sm) 0 var(--radius-sm);font-size:12px;display:grid;place-items:center}
@media(max-width:700px){
  .idz{min-height:132px;padding:16px 12px}
  .idz-icon{width:38px;height:38px}
}
</style>
