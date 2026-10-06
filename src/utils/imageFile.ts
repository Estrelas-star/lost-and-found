// src/utils/imageFile.ts
// 图片文件预检（口径与 api/upload.ts 一致）：供拖放区与「外部触发上传」的组件共用。
// 不合规的文件只提示、不抛错；不带 MIME 的来源（拖拽 / 截图）交给后端校验，不在这里硬拦。
import { ElMessage } from 'element-plus'

export const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const IMAGE_MAX_SIZE = 5 * 1024 * 1024

/**
 * 类型 / 大小 / 张数三重预检，返回可以上传的文件子集。
 * @param list    用户选择或拖入的文件
 * @param max     总张数上限
 * @param current 已上传张数
 * @param single  单图模式：新选的 1 张视为「替换」，不受已有张数限制
 */
export function filterImageFiles(
  list: FileList | File[] | null | undefined,
  { max, current = 0, single = false }: { max: number; current?: number; single?: boolean },
): File[] {
  const all = Array.from(list || [])
  if (!all.length) return []

  const images = all.filter((f) => f.type.startsWith('image/'))
  if (!images.length) { ElMessage.warning('只能上传图片文件（JPG / PNG / WEBP）'); return [] }
  if (images.length < all.length) ElMessage.warning(`已忽略 ${all.length - images.length} 个非图片文件`)

  const wrongType = images.filter((f) => f.type && !IMAGE_ALLOWED_TYPES.includes(f.type))
  const typed = images.filter((f) => !f.type || IMAGE_ALLOWED_TYPES.includes(f.type))
  if (wrongType.length) ElMessage.warning(`${wrongType.length} 个文件格式不支持，仅支持 JPG / PNG / WEBP`)

  const oversize = typed.filter((f) => f.size > IMAGE_MAX_SIZE)
  const sized = typed.filter((f) => f.size <= IMAGE_MAX_SIZE)
  if (oversize.length) ElMessage.warning(`${oversize.length} 张图片超过 5MB，已跳过`)

  const room = single ? 1 : Math.max(0, max - current)
  if (room <= 0) { ElMessage.warning(`最多 ${max} 张，请先移除已有图片`); return [] }
  const picked = sized.slice(0, room)
  if (sized.length > room) ElMessage.warning(`最多 ${max} 张，已忽略多余的 ${sized.length - room} 张`)
  return picked
}
