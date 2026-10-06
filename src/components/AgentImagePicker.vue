<script setup lang="ts">
// Agent 多模态图片选择器（最多 max 张）：被智能助手对话页与发布页「AI 帮写」共用
// 复用 POST /upload/image（JPG / PNG / WEBP，单张 ≤5MB，代理 502 抖动自动重试）；
// 上传返回相对 URL（/uploads/...），后端会自动拼公网前缀，因此原样提交给 /agent/* 的 image_urls。
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadImage } from '../api/upload'
import { resolveImageUrl } from '../utils/image'

const props = withDefaults(defineProps<{
  modelValue: string[]
  max?: number
  disabled?: boolean
}>(), {
  max: 3,
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const uploading = ref(false)
const canAdd = computed(() => !props.disabled && !uploading.value && props.modelValue.length < props.max)

// 串行上传，保证顺序与选择顺序一致；用本地 working 累积，避免 props 异步回流导致丢图
async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''   // 清空 value，允许重复选择同一个文件
  if (!files.length) return

  const remain = props.max - props.modelValue.length
  if (remain <= 0) { ElMessage.warning(`最多上传 ${props.max} 张图片`); return }
  const picked = files.slice(0, remain)
  if (files.length > remain) ElMessage.warning(`最多 ${props.max} 张，已忽略多余的 ${files.length - remain} 张`)

  uploading.value = true
  const working = [...props.modelValue]
  try {
    for (const file of picked) {
      try {
        working.push(await uploadImage(file))
        emit('update:modelValue', [...working])
      } catch (err) {
        ElMessage.error((err as Error).message || '图片上传失败，请重试')
      }
    }
  } finally {
    uploading.value = false
  }
}

function removeAt(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="agent-images">
    <div v-for="(url, i) in modelValue" :key="url + '@' + i" class="agent-image">
      <img :src="resolveImageUrl(url)" alt="待提交图片" />
      <button type="button" class="agent-image-del" :disabled="disabled" title="移除这张图片" @click="removeAt(i)">×</button>
    </div>
    <label v-if="canAdd" class="agent-image-add" :class="{ 'is-uploading': uploading }" title="上传图片，最多 3 张">
      <input type="file" accept="image/*" multiple :disabled="uploading || disabled" @change="onPick" />
      <span>{{ uploading ? '上传中…' : '＋ 图片' }}</span>
    </label>
    <span class="agent-image-tip">
      <template v-if="modelValue.length">{{ modelValue.length }}/{{ max }} 张</template>
      <template v-else>可传图片辅助识别（最多 {{ max }} 张，JPG/PNG/WEBP ≤5MB）</template>
    </span>
  </div>
</template>

<style scoped>
.agent-images{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.agent-image{position:relative;width:52px;height:52px;border-radius:9px;overflow:hidden;border:1px solid var(--line);background:#edf5ee}
.agent-image img{width:100%;height:100%;object-fit:cover;display:block}
.agent-image-del{position:absolute;top:0;right:0;width:17px;height:17px;border-radius:0 8px 0 8px;background:#000000a6;color:#fff;font-size:12px;line-height:1;display:grid;place-items:center}
.agent-image-del:hover{background:#e06c75}
.agent-image-del:disabled{opacity:.45;cursor:not-allowed}
.agent-image-add{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border:1px dashed #c8d7cd;border-radius:9px;background:#fbfdfb;color:var(--green);font-size:11px;cursor:pointer;text-align:center;line-height:1.2;padding:0 4px;box-sizing:border-box}
.agent-image-add:hover{border-color:var(--green);background:#f2faf6}
.agent-image-add.is-uploading{color:#9aa9a1;border-style:solid;cursor:progress}
.agent-image-add input{display:none}
.agent-image-tip{color:#9aa9a1;font-size:11px}
</style>
