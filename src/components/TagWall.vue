<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string[]
  options: string[]
  label: string
  sidebarWidth?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)

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
function clearAll() {
  emit('update:modelValue', [])
}
</script>

<template>
  <div class="tag-wall">
    <button type="button" class="tw-trigger" @click="open = !open">
      <span v-if="modelValue.length" class="tw-sel">{{ modelValue.length }} 项已选</span>
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
          <div class="tw-grid">
            <button
              v-for="opt in options"
              :key="opt"
              type="button"
              class="tw-chip"
              :class="{ active: modelValue.includes(opt) }"
              @click="toggle(opt)"
            >{{ opt }}</button>
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
  height: 32px;
  padding: 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  color: #303133;
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
}
.tw-trigger:hover { border-color: #42b983; }
.tw-ph { color: #a8abb2; }
.tw-sel { color: #42b983; font-weight: 500; }
.tw-arrow { color: #909399; font-size: 12px; }

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
