<script setup lang="ts">
import { publishArticle } from '~/composables/publish'
import { CATEGORY_KEYS } from '~/composables/data'
import type { SelectOption } from '~/components/SearchSelect.vue'

const { t } = useI18n()

// Category options for SearchSelect
const categoryOptions = computed<SelectOption[]>(() => {
  return CATEGORY_KEYS.map((key, index) => ({
    key,
    label: t(key),
    value: BigInt(index)
  }))
})

// Selected category value (null means no selection)
const selectedCategory = ref<bigint | null>(null)

// Form state
const title = ref('')
const summary = ref('')
const categoryId = computed(() => selectedCategory.value ?? 0n)
const author = ref('')
const content = ref('')
const postscript = ref('')
const coverImageFile = ref<File | null>(null)
const coverImagePreview = ref<string | null>(null)
const royaltyBps = ref<bigint>(500n)

// Submit state
const isSubmitting = ref(false)
const submitStatus = ref<
  'idle' | 'validating' | 'uploadingCover' | 'uploadingArticle' | 'publishingContract' | 'success' | 'error'
>('idle')
const statusMessage = ref('')

// Handle cover image selection
function handleCoverImageChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // Validate file type
  if (!file.type.startsWith('image/')) {
    statusMessage.value = t('invalid_image')
    submitStatus.value = 'error'
    return
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    statusMessage.value = t('image_too_large')
    submitStatus.value = 'error'
    return
  }

  coverImageFile.value = file
  coverImagePreview.value = URL.createObjectURL(file)
  submitStatus.value = 'idle'
}

// Remove cover image
function removeCoverImage() {
  if (coverImagePreview.value) {
    URL.revokeObjectURL(coverImagePreview.value)
  }
  coverImageFile.value = null
  coverImagePreview.value = null
}

// Reset form
function resetForm() {
  title.value = ''
  summary.value = ''
  selectedCategory.value = null
  author.value = ''
  content.value = ''
  postscript.value = ''
  removeCoverImage()
  isSubmitting.value = false
  submitStatus.value = 'idle'
  statusMessage.value = ''
}

// Handle form submission
async function handleSubmit() {
  if (isSubmitting.value) return

  try {
    isSubmitting.value = true
    submitStatus.value = 'validating'
    statusMessage.value = t('validating')

    // Validation
    if (!title.value.trim()) {
      throw new Error(t('field_required', { field: t('title') }))
    }
    if (!summary.value.trim()) {
      throw new Error(t('field_required', { field: t('summary') }))
    }
    if (!content.value.trim()) {
      throw new Error(t('field_required', { field: t('content_markdown') }))
    }
    if (categoryId.value < 0n) {
      throw new Error(t('invalid_category'))
    }
    // Use selected category as tag
    const selectedKey = CATEGORY_KEYS[Number(categoryId.value)]
    const tags = selectedKey ? [t(selectedKey)] : []

    // Combine content with postscript if provided
    const fullContent = postscript.value.trim()
      ? `${content.value.trim()}\n\n---\n\n${postscript.value.trim()}`
      : content.value.trim()

    // Update status for cover upload
    if (coverImageFile.value) {
      submitStatus.value = 'uploadingCover'
      statusMessage.value = t('uploading_cover')
    }

    // Update status for article upload
    submitStatus.value = 'uploadingArticle'
    statusMessage.value = t('uploading_to_arweave')

    // Call publishArticle from composables
    const result = await publishArticle({
      title: title.value.trim(),
      summary: summary.value.trim(),
      content: fullContent,
      tags,
      coverImage: coverImageFile.value,
      categoryId: categoryId.value,
      royaltyBps: royaltyBps.value,
      originalAuthor: author.value.trim() || undefined
    })

    // Success
    submitStatus.value = 'success'
    statusMessage.value = t('publish_success', { arweaveId: result.arweaveId, txHash: result.txHash })
  } catch (error) {
    submitStatus.value = 'error'
    const errorMessage = error instanceof Error ? error.message : String(error)
    statusMessage.value = t('publish_failed', { error: errorMessage })
  } finally {
    isSubmitting.value = false
  }
}

// Button text based on submit status
const submitButtonText = computed(() => {
  if (!isSubmitting.value) return t('publish_article')
  switch (submitStatus.value) {
    case 'uploadingCover':
      return t('uploading_cover')
    case 'uploadingArticle':
      return t('uploading_to_arweave')
    case 'publishingContract':
      return t('publishing_to_blockchain')
    default:
      return t('publish_article')
  }
})

// Status message styling
const statusClass = computed(() => {
  switch (submitStatus.value) {
    case 'success':
      return 'border border-green-200 bg-green-50 text-green-800'
    case 'error':
      return 'border border-red-200 bg-red-50 text-red-800'
    default:
      return 'border border-blue-200 bg-blue-50 text-blue-800'
  }
})
</script>

<template>
  <div class="min-h-screen bg-white">
    <div class="mx-auto max-w-3xl px-6 py-12">
      <header class="mb-12">
        <h1 class="mb-2 text-4xl font-light tracking-tight">{{ $t('publish_article') }}</h1>
        <p class="text-gray-500">{{ $t('share_thoughts') }}</p>
      </header>

      <form @submit.prevent="handleSubmit" class="space-y-8">
        <!-- Title -->
        <div>
          <label for="title" class="mb-2 block text-sm font-medium text-gray-700">
            {{ $t('title') }} *
          </label>
          <input
            id="title"
            v-model="title"
            type="text"
            :placeholder="$t('enter_title')"
            class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
            :disabled="isSubmitting"
          />
        </div>

        <!-- Category & Author -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700">
              {{ $t('category') }} *
            </label>
            <SearchSelect
              v-model="selectedCategory"
              :options="categoryOptions"
              :placeholder="$t('search_category')"
              :disabled="isSubmitting"
              :no-results-text="$t('no_results')"
            />
          </div>
          <div>
            <label for="author" class="mb-2 block text-sm font-medium text-gray-700">
              {{ $t('author') }}
            </label>
            <input
              id="author"
              v-model="author"
              type="text"
              :placeholder="$t('author_placeholder')"
              class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
              :disabled="isSubmitting"
            />
          </div>
        </div>

        <!-- Cover Image -->
        <div>
          <label for="cover-image" class="mb-3 block text-sm font-medium text-gray-700">
            {{ $t('cover_image') }}
          </label>
          <template v-if="coverImagePreview">
            <div class="space-y-3">
              <div class="relative overflow-hidden rounded-lg bg-gray-100">
                <img :src="coverImagePreview" alt="Cover preview" class="h-64 w-full object-cover" />
              </div>
              <button
                type="button"
                class="text-sm text-gray-600 underline hover:text-gray-900"
                :disabled="isSubmitting"
                @click="removeCoverImage"
              >
                {{ $t('remove_image') }}
              </button>
            </div>
          </template>
          <template v-else>
            <label
              for="cover-image"
              class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 px-6 py-10 transition-colors hover:border-gray-300"
            >
              <svg class="mb-2 h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <p class="text-sm font-medium text-gray-700">{{ $t('upload_cover') }}</p>
              <p class="text-xs text-gray-500">{{ $t('image_format_help') }}</p>
              <input
                id="cover-image"
                type="file"
                accept="image/*"
                class="hidden"
                :disabled="isSubmitting"
                @change="handleCoverImageChange"
              />
            </label>
          </template>
        </div>

        <!-- Content -->
        <div>
          <label for="content" class="mb-2 block text-sm font-medium text-gray-700">
            {{ $t('content_markdown') }} *
          </label>
          <textarea
            id="content"
            v-model="content"
            :placeholder="$t('write_content')"
            :rows="12"
            class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
            :disabled="isSubmitting"
          />
        </div>

        <!-- Postscript -->
        <div>
          <label for="postscript" class="mb-2 block text-sm font-medium text-gray-700">
            {{ $t('postscript') }}
          </label>
          <textarea
            id="postscript"
            v-model="postscript"
            :placeholder="$t('postscript_placeholder')"
            :rows="4"
            class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
            :disabled="isSubmitting"
          />
        </div>

        <!-- Status Message -->
        <div
          v-if="submitStatus !== 'idle'"
          :class="['whitespace-pre-wrap rounded-lg px-4 py-3 text-sm', statusClass]"
        >
          {{ statusMessage }}
        </div>

        <!-- Buttons -->
        <div class="flex gap-3">
          <button
            type="submit"
            :disabled="isSubmitting"
            class="flex-1 rounded-lg bg-gray-900 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {{ submitButtonText }}
          </button>
          <button
            type="button"
            :disabled="isSubmitting"
            class="rounded-lg border border-gray-200 px-6 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
            @click="resetForm"
          >
            {{ $t('clear') }}
          </button>
        </div>

        <p class="text-xs text-gray-500">{{ $t('required_fields') }}</p>
      </form>
    </div>
  </div>
</template>
