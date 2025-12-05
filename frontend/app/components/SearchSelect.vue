<script setup lang="ts">
export interface SelectOption {
  key: string | number
  label: string
  value: any
}

const props = withDefaults(
  defineProps<{
    modelValue: any | any[]
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    noResultsText?: string
    maxSelection?: number
  }>(),
  {
    placeholder: '',
    disabled: false,
    noResultsText: 'No results',
    maxSelection: 1
  }
)

// maxSelection > 1 means multiple selection mode
const isMultiple = computed(() => props.maxSelection > 1)

const emit = defineEmits<{
  'update:modelValue': [value: any | any[]]
}>()

const searchQuery = ref('')
const showDropdown = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// For multiple selection mode
const selectedValues = computed<any[]>(() => {
  if (isMultiple.value) {
    return Array.isArray(props.modelValue) ? props.modelValue : []
  }
  return props.modelValue !== null && props.modelValue !== undefined ? [props.modelValue] : []
})

const selectedOptions = computed<SelectOption[]>(() => {
  return selectedValues.value
    .map((val) => props.options.find((opt) => opt.value === val))
    .filter((opt): opt is SelectOption => opt !== undefined)
})

const isMaxReached = computed(() => {
  return selectedValues.value.length >= props.maxSelection
})

const canInput = computed(() => {
  return !props.disabled && !isMaxReached.value
})

const filteredOptions = computed(() => {
  const search = searchQuery.value.toLowerCase()
  let filtered = props.options

  // Filter out already selected options in multiple mode
  if (isMultiple.value) {
    filtered = filtered.filter((opt) => !selectedValues.value.includes(opt.value))
  }

  if (!search) return filtered
  return filtered.filter(
    (item) =>
      item.label.toLowerCase().includes(search) ||
      String(item.key).toLowerCase().includes(search)
  )
})

// Single select compatibility
const selectedOption = computed(() => {
  return props.options.find((opt) => opt.value === props.modelValue)
})

const selectedLabel = computed(() => {
  return selectedOption.value?.label ?? ''
})

function selectOption(option: SelectOption) {
  if (isMultiple.value) {
    const newValues = [...selectedValues.value, option.value]
    emit('update:modelValue', newValues)
  } else {
    emit('update:modelValue', option.value)
  }
  searchQuery.value = ''
  if (!isMultiple.value) {
    showDropdown.value = false
  }
  // Keep focus on input for continuous selection in multiple mode
  if (isMultiple.value && inputRef.value) {
    inputRef.value.focus()
  }
}

function removeOption(value: any) {
  if (isMultiple.value) {
    const newValues = selectedValues.value.filter((v) => v !== value)
    emit('update:modelValue', newValues)
  } else {
    emit('update:modelValue', null)
  }
}

function handleInputFocus() {
  showDropdown.value = true
}

function handleInputBlur() {
  setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

function clearSelection() {
  if (isMultiple.value) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', null)
  }
  searchQuery.value = ''
}

function handleContainerClick() {
  if (canInput.value && inputRef.value) {
    inputRef.value.focus()
  }
}

const hasSelection = computed(() => {
  if (isMultiple.value) {
    return selectedValues.value.length > 0
  }
  return props.modelValue !== null && props.modelValue !== undefined && selectedOption.value !== undefined
})

const inputPlaceholder = computed(() => {
  if (hasSelection.value) return ''
  return props.placeholder
})
</script>

<template>
  <div class="relative">
    <!-- Container with tags and input -->
    <div
      ref="containerRef"
      class="flex min-h-[48px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-300"
      :class="{ 'cursor-not-allowed bg-gray-50': disabled }"
      @click="handleContainerClick"
    >
      <!-- Selected tags (capsules) -->
      <span
        v-for="opt in selectedOptions"
        :key="opt.key"
        class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-800"
      >
        {{ opt.label }}
        <button
          type="button"
          class="flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          :disabled="disabled"
          @mousedown.prevent.stop="removeOption(opt.value)"
        >
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </span>
      <!-- Search input -->
      <input
        v-if="canInput"
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        :placeholder="inputPlaceholder"
        class="min-w-[60px] flex-1 border-none bg-transparent text-base text-gray-900 placeholder-gray-400 outline-none"
        :disabled="disabled"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
      />
      <!-- Max reached indicator -->
      <span v-else-if="isMaxReached && !disabled" class="flex-1 text-sm text-gray-400">
        {{ $t('max_selection_reached') || 'Max reached' }}
      </span>
      <!-- Right side icons -->
      <div class="ml-auto flex items-center gap-1 pl-2">
        <button
          v-if="hasSelection && !disabled"
          type="button"
          class="text-gray-400 hover:text-gray-600"
          @mousedown.prevent="clearSelection"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
    <!-- Dropdown -->
    <div
      v-if="showDropdown && canInput"
      class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <!-- Clear option when has selection -->
      <div
        v-if="hasSelection"
        class="cursor-pointer border-b border-gray-100 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
        @mousedown.prevent="clearSelection"
      >
        <span class="flex items-center gap-1">
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {{ $t('clear') }} {{ $t('selection') }}
        </span>
      </div>
      <div
        v-for="item in filteredOptions"
        :key="item.key"
        class="cursor-pointer px-4 py-2 text-sm hover:bg-gray-100"
        :class="{ 'bg-gray-50 font-medium': !isMultiple && modelValue === item.value }"
        @mousedown.prevent="selectOption(item)"
      >
        {{ item.label }}
      </div>
      <div v-if="filteredOptions.length === 0" class="px-4 py-2 text-sm text-gray-500">
        {{ noResultsText }}
      </div>
    </div>
  </div>
</template>
