<script setup lang="ts">
// 审核中心（失物招领管理员）
// ⚠️ 后端现状：物品「创建即发布」，**没有「待审核」状态**（items.status 只有 0已发布 / 1已认领 / 2已关闭），
//    也没有任何审核相关接口。因此本页**不展示任何演示数据**，只如实说明当前不可用。
//    待后端补充审核流程（状态 + 接口）后，再接入待审核列表与通过 / 驳回。
</script>

<template>
  <section class="audit-center page-section">
    <div class="section-intro"><span class="eyebrow">OPERATIONS</span><h1>审核中心</h1><p>集中处理新提交的失物招领信息。</p></div>
    <el-alert
      class="audit-empty-alert"
      type="warning"
      show-icon
      :closable="false"
      title="审核功能等待后端支持"
      description="后端物品为「创建即发布」，没有「待审核」状态，也没有审核相关接口，因此这里没有可处理的数据。审核流程上线后，本页会列出待审核帖子并提供通过 / 驳回。"
    />
    <el-empty description="暂无待审核信息（后端当前无审核流程）" />
  </section>
</template>

<style scoped>
.audit-empty-alert { margin-top: 18px; }
.audit-center :deep(.el-empty) { padding: 36px 0 60px; }
</style>