<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  modelValue: string[]
  options: string[]
  label: string
  sidebarWidth?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const route = useRoute()
const open = ref(false)
// 弹层内的前端搜索关键字（仅过滤展示，不影响已选）
const keyword = ref('')
const filteredOptions = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return props.options
  return props.options.filter((o) => o.toLowerCase().includes(k))
})
// 展开时清空关键字：每次打开都是一次新的搜索
function toggleOpen() {
  open.value = !open.value
  if (open.value) keyword.value = ''
}
// 切页自动关闭：发布页外层有 <KeepAlive>、组件不会销毁，否则弹层会一直挂在 body 上
watch(() => route.fullPath, () => { open.value = false })

// 仅当传入侧栏宽度时，把遮罩/面板限制在右侧工作台区域，不盖住左侧栏
const backdropStyle = computed(() =>
  props.sidebarWidth && props.sidebarWidth > 0
    ? { left: props.sidebarWidth + 'px' }
    : {}
)

function toggle(v: string) {
  const set = new Set(props.modelValue)
  if (set.has(v)) set.delete(v)
  else set.add(v)
  emit('update:modelValue', [...set])
}
// 单个已选标签的「×」：只移除这一个
function remove(v: string) {
  emit('update:modelValue', props.modelValue.filter((item) => item !== v))
}
function clearAll() {
  emit('update:modelValue', [])
}
</script>

<template>
  <div class="tag-wall">
    <button type="button" class="tw-trigger" @click="toggleOpen">
      <span v-if="modelValue.length" class="tw-tags">
        <span v-for="v in modelValue" :key="v" class="tw-tag">{{ v }}<span class="tw-tag-x" title="移除" @click.stop="remove(v)">×</span></span>
      </span>
      <span v-else class="tw-ph">请选择{{ label }}</span>
      <span class="tw-arrow">▾</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="tw-backdrop" :style="backdropStyle" @click.self="open = false">
        <div class="tw-sheet">
          <div class="tw-head">
            <span class="tw-title">选择{{ label }}</span>
            <div class="tw-actions">
              <button type="button" class="tw-clear" @click="clearAll">清空</button>
              <button type="button" class="tw-close" @click="open = false" aria-label="关闭">×</button>
            </div>
          </div>
          <div class="tw-search">
            <el-input v-model="keyword" :placeholder="`搜索${label}`" clearable />
          </div>
          <div class="tw-grid">
            <button
              v-for="opt in filteredOptions"
              :key="opt"
              type="button"
              class="tw-chip"
              :class="{ active: modelValue.includes(opt) }"
              @click="toggle(opt)"
            >{{ opt }}</button>
            <div v-if="!filteredOptions.length" class="tw-empty">没有匹配的{{ label }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tag-wall { width: 100%; }
.tw-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  color: #303133;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.tw-trigger:hover { border-color: #42b983; }
.tw-trigger:focus-visible { outline: 2px solid #7bcda4; outline-offset: 2px; }
.tw-ph { color: #a8abb2; flex: 1 1 auto; }
.tw-arrow { color: #909399; font-size: 12px; flex: 0 0 auto; align-self: center; }

/* 已选标签：浅色容器 + 小圆「×」，直接显示在触发栏内（点 × 只移除这一个） */
.tw-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}
.tw-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 1px 5px 1px 8px;
  border: 1px solid #cfe7dc;
  border-radius: 999px;
  background: #eff8f3;
  color: #369976;
  font-size: 12px;
  line-height: 18px;
}
.tw-tag-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  color: #369976;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tw-tag-x:hover { background: #42b983; color: #fff; }

.tw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: flex-end;
  z-index: 3000;
}
.tw-sheet {
  width: 100%;
  max-height: 80vh;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 16px 16px 20px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  animation: tw-up 0.18s ease;
}
@keyframes tw-up {
  from { transform: translateY(24px); opacity: 0.5; }
  to { transform: none; opacity: 1; }
}
.tw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.tw-title { font-size: 14px; font-weight: 500; color: #303133; }
.tw-clear {
  border: none;
  background: transparent;
  color: #42b983;
  font-size: 13px;
  cursor: pointer;
  margin-right: 6px;
}
.tw-close {
  border: none;
  background: transparent;
  color: #909399;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
/* 前端搜索过滤：宽屏占弹层宽度 50%（40%~60% 区间内），窄屏铺满 */
.tw-search {
  width: 100%;
  margin-bottom: 12px;
}
@media (min-width: 900px) {
  .tw-search { width: 50%; }
}
.tw-empty {
  grid-column: 1 / -1;
  padding: 18px 0;
  color: #a8abb2;
  font-size: 13px;
  text-align: center;
}
.tw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
  overflow-y: auto;
  padding: 2px;
}
.tw-chip {
  padding: 11px 6px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  background: #fff;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}
.tw-chip:hover { border-color: #42b983; }
.tw-chip.active {
  background: #42b983;
  border-color: #42b983;
  color: #fff;
  font-weight: 500;
}
</style>
