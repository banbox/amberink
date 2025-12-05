<script setup lang="ts">
import {
	getStoredSessionKey,
	createSessionKey,
	revokeSessionKey,
	isSessionKeyValidForCurrentWallet
} from '~/composables/useSessionKey'

const { t } = useI18n()

const hasSessionKey = ref(false)
const validUntil = ref<Date | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

onMounted(() => {
	checkSessionKey()
})

async function checkSessionKey() {
	const sk = getStoredSessionKey()
	if (sk) {
		// Verify it belongs to current wallet
		const isValid = await isSessionKeyValidForCurrentWallet()
		hasSessionKey.value = isValid
		validUntil.value = isValid ? new Date(sk.validUntil * 1000) : null
	} else {
		hasSessionKey.value = false
		validUntil.value = null
	}
}

async function handleCreate() {
	isLoading.value = true
	errorMessage.value = ''
	try {
		await createSessionKey()
		await checkSessionKey()
	} catch (error) {
		console.error('Failed to create session key:', error)
		errorMessage.value = t('session_key_error')
	} finally {
		isLoading.value = false
	}
}

async function handleRevoke() {
	isLoading.value = true
	errorMessage.value = ''
	try {
		await revokeSessionKey()
		await checkSessionKey()
	} catch (error) {
		console.error('Failed to revoke session key:', error)
		errorMessage.value = t('session_key_error')
	} finally {
		isLoading.value = false
	}
}

// Format date for display
const formattedValidUntil = computed(() => {
	if (!validUntil.value) return ''
	return validUntil.value.toLocaleDateString()
})
</script>

<template>
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<h3 class="mb-2 font-semibold text-gray-900">{{ t('seamless_mode') }}</h3>

		<template v-if="hasSessionKey">
			<p class="mb-2 flex items-center gap-1 text-green-600">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				{{ t('seamless_enabled') }}
			</p>
			<p class="mb-4 text-sm text-gray-500">
				{{ t('seamless_valid_until') }}: {{ formattedValidUntil }}
			</p>
			<button
				class="rounded px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
				:disabled="isLoading"
				@click="handleRevoke"
			>
				{{ t('revoke_authorization') }}
			</button>
		</template>

		<template v-else>
			<p class="mb-2 text-gray-500">{{ t('seamless_disabled') }}</p>
			<p class="mb-4 text-sm text-gray-400">
				{{ t('seamless_description') }}
			</p>
			<button
				class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				:disabled="isLoading"
				@click="handleCreate"
			>
				{{ isLoading ? t('authorizing') : t('enable_seamless') }}
			</button>
		</template>

		<!-- Error message -->
		<p v-if="errorMessage" class="mt-2 text-sm text-red-600">
			{{ errorMessage }}
		</p>
	</div>
</template>
