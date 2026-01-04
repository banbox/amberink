<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import {
		getUserConfig,
		setConfigValue,
		resetConfigValue,
		resetAllConfig,
		isConfigOverridden,
		getEnvDefault,
		configFields,
		MIN_DEFAULT_GAS_FEE_MULTIPLIER,
		type UserConfigKey,
		getConfig
	} from '$lib/config';
	import { getChainOptions, envName, getEnvNameVersion } from '$lib/stores/config.svelte';
	import { CloseIcon, PlusIcon, ResetIcon } from '$lib/components/icons';

	// Local form state
	let formValues = $state<Record<string, string | number | string[]>>({});
	let showResetConfirm = $state(false);
	let saveMessage = $state('');
	let errorMessage = $state('');
	
	// Toast visibility with animation
	let showSuccessToast = $state(false);
	let showErrorToast = $state(false);
	
	// Get chain options for dropdown - reactive to envName changes
	let chainOptions = $derived.by(() => {
		// Depend on envNameVersion to trigger re-computation when envName changes
		void getEnvNameVersion();
		return getChainOptions();
	});
	
	// Get current config for read-only display
	let currentConfig = $derived(getConfig());

	// Initialize form values from current config
	function initFormValues() {
		const userConfig = getUserConfig();
		const values: Record<string, string | number | string[]> = {};
		
		for (const field of configFields) {
			const userValue = userConfig[field.key];
			const envValue = getEnvDefault(field.key);
			
			if (field.type === 'array') {
				values[field.key] = (userValue as string[] | undefined) || (envValue as string[]) || [];
			} else {
				values[field.key] = userValue !== undefined ? userValue : envValue;
			}
		}
		
		formValues = values;
	}

	// Initialize on mount
	// Initialize form values on mount and when envName changes
	$effect(() => {
		// Depend on envNameVersion to reinitialize when envName changes
		void getEnvNameVersion();
		initFormValues();
	});

	// Get label from message key
	function getLabel(key: string): string {
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}

	// Handle input change
	function handleChange(key: UserConfigKey, value: string | number | string[]) {
		formValues[key] = value;
	}

	// Validate field value
	function validateField(key: UserConfigKey, value: number | string | string[]): string | null {
		if (key === 'defaultGasFeeMultiplier') {
			const numValue = typeof value === 'string' ? parseInt(value, 10) : value as number;
			if (isNaN(numValue) || numValue < MIN_DEFAULT_GAS_FEE_MULTIPLIER) {
				return getLabel('gas_multiplier_min_error').replace('{min}', String(MIN_DEFAULT_GAS_FEE_MULTIPLIER));
			}
		}
		return null;
	}

	// Save a single field
	function saveField(key: UserConfigKey) {
		const value = formValues[key];
		const field = configFields.find(f => f.key === key);
		
		if (!field) return;
		
		let parsedValue: string | number | string[] | undefined = value;
		
		if (field.type === 'number') {
			parsedValue = typeof value === 'string' ? parseInt(value, 10) : value;
			if (isNaN(parsedValue as number)) return;
		}

		// Validate
		const validationError = validateField(key, parsedValue);
		if (validationError) {
			showErrorMessage(validationError);
			return;
		}
		
		setConfigValue(key, parsedValue as never);
		showSaveMessage();
	}

	// Reset a single field to env default
	function resetField(key: UserConfigKey) {
		resetConfigValue(key);
		const envValue = getEnvDefault(key);
		formValues[key] = envValue as string | number | string[];
		showSaveMessage();
	}

	// Reset all fields
	function handleResetAll() {
		resetAllConfig();
		initFormValues();
		showResetConfirm = false;
		showSaveMessage();
	}

	// Show save message briefly
	function showSaveMessage() {
		saveMessage = getLabel('settings_saved');
		showSuccessToast = true;
		setTimeout(() => {
			showSuccessToast = false;
		}, 2000);
	}

	// Show error message briefly
	function showErrorMessage(message: string) {
		errorMessage = message;
		showErrorToast = true;
		setTimeout(() => {
			showErrorToast = false;
		}, 3000);
	}

	// Handle array field (gateways)
	function handleArrayChange(key: UserConfigKey, index: number, value: string) {
		const arr = [...(formValues[key] as string[])];
		arr[index] = value;
		formValues[key] = arr;
	}

	function addArrayItem(key: UserConfigKey) {
		const arr = [...(formValues[key] as string[]), ''];
		formValues[key] = arr;
	}

	function removeArrayItem(key: UserConfigKey, index: number) {
		const arr = (formValues[key] as string[]).filter((_, i) => i !== index);
		formValues[key] = arr;
	}
</script>

<svelte:head>
	<title>{getLabel('settings')} - AmberInk</title>
</svelte:head>

<!-- Fixed Toast Messages at top of viewport -->
<div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
	{#if showSuccessToast}
		<div 
			class="rounded-lg bg-green-600 px-4 py-3 text-sm text-white shadow-lg pointer-events-auto animate-fade-in"
			role="status"
		>
			{saveMessage}
		</div>
	{/if}
	{#if showErrorToast}
		<div 
			class="rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg pointer-events-auto animate-fade-in"
			role="alert"
		>
			{errorMessage}
		</div>
	{/if}
</div>

<div class="mx-auto max-w-3xl px-6 py-8">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">{getLabel('settings')}</h1>
		<p class="mt-2 text-gray-600">{getLabel('settings_desc')}</p>
	</div>

	<!-- Settings Form -->
	<div class="space-y-6">
		{#each configFields as field}
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<label for={field.key} class="block text-sm font-medium text-gray-900">
							{getLabel(field.labelKey)}
							{#if isConfigOverridden(field.key)}
								<span class="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
									{getLabel('customized')}
								</span>
							{/if}
						</label>

						{#if field.key === 'chainId'}
							<!-- ChainId dropdown with chain names -->
							<select
								id={field.key}
								value={String(formValues[field.key] || '')}
								onchange={(e) => {
									const chainId = parseInt(e.currentTarget.value, 10);
									handleChange(field.key, chainId);
									saveField(field.key);
								}}
								class="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							>
								{#each chainOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						{:else if field.type === 'select' && field.options}
							<!-- Generic select dropdown (e.g., envName) -->
							<select
								id={field.key}
								value={String(formValues[field.key] || '')}
								onchange={(e) => {
									handleChange(field.key, e.currentTarget.value);
									saveField(field.key);
								}}
								class="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							>
								{#each field.options as option}
									<option value={option.value}>{getLabel(option.labelKey)}</option>
								{/each}
							</select>
						{:else if field.type === 'text'}
							<input
								type="text"
								id={field.key}
								value={(formValues[field.key] as string) || ''}
								placeholder={field.placeholder}
								oninput={(e) => handleChange(field.key, e.currentTarget.value)}
								onblur={() => saveField(field.key)}
								class="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						{:else if field.type === 'number'}
							<input
								type="number"
								id={field.key}
								value={(formValues[field.key] as number) || ''}
								placeholder={field.placeholder}
								oninput={(e) => handleChange(field.key, e.currentTarget.value)}
								onblur={() => saveField(field.key)}
								class="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						{:else if field.type === 'array'}
							<div class="mt-2 space-y-2">
								{#each (formValues[field.key] as string[]) || [] as item, index}
									<div class="flex gap-2">
										<input
											type="text"
											value={item}
											placeholder={field.placeholder}
											oninput={(e) => handleArrayChange(field.key, index, e.currentTarget.value)}
											onblur={() => saveField(field.key)}
											class="block flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
										/>
										<button
											type="button"
											onclick={() => {
												removeArrayItem(field.key, index);
												saveField(field.key);
											}}
											class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
											title={getLabel('remove')}
										>
											<CloseIcon size={16} />
										</button>
									</div>
								{/each}
								<button
									type="button"
									onclick={() => addArrayItem(field.key)}
									class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
								>
									<PlusIcon size={16} />
									{getLabel('add_gateway')}
								</button>
							</div>
						{/if}

						<!-- Env default hint -->
						<p class="mt-1 text-xs text-gray-500">
							{getLabel('default_value')}:
							{#if field.key === 'chainId'}
								{chainOptions.find((opt) => opt.value === String(getEnvDefault(field.key)))
									?.label || getEnvDefault(field.key)}
							{:else if field.type === 'array'}
								{(getEnvDefault(field.key) as string[]).join(', ')}
							{:else}
								{getEnvDefault(field.key)}
							{/if}
						</p>
					</div>

					<!-- Reset button -->
					{#if isConfigOverridden(field.key)}
						<button
							type="button"
							onclick={() => resetField(field.key)}
							class="ml-4 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
							title={getLabel('reset_default')}
						>
							<ResetIcon size={16} />
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- Read-Only Information Section -->
	<div class="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
		<h3 class="text-sm font-medium text-gray-900 mb-3">{getLabel('fixed_configuration')}</h3>
		<div class="space-y-2 text-sm text-gray-600">
			<div class="flex justify-between">
				<span class="font-medium">{getLabel('blog_hub_address')}:</span>
				<code class="text-xs text-gray-900">{currentConfig.blogHubContractAddress}</code>
			</div>
			<div class="flex justify-between">
				<span class="font-medium">{getLabel('session_manager_address')}:</span>
				<code class="text-xs text-gray-900">{currentConfig.sessionKeyManagerAddress}</code>
			</div>
			<div class="flex justify-between">
				<span class="font-medium">{getLabel('irys_network')}:</span>
				<span class="text-gray-900">{currentConfig.irysNetwork}</span>
			</div>
			<p class="mt-3 text-xs text-gray-500">
				{getLabel('fixed_config_note')}
			</p>
		</div>
	</div>

	<!-- Reset All Section -->
	<div class="mt-8 rounded-lg border border-red-200 bg-red-50 p-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-sm font-medium text-red-800">{getLabel('reset_all')}</h3>
				<p class="mt-1 text-sm text-red-600">{getLabel('reset_all_desc')}</p>
			</div>
			{#if showResetConfirm}
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => (showResetConfirm = false)}
						class="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-red-100"
					>
						{getLabel('cancel')}
					</button>
					<button
						type="button"
						onclick={handleResetAll}
						class="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
					>
						{getLabel('confirm_reset')}
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (showResetConfirm = true)}
					class="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-100"
				>
					{getLabel('reset_all')}
				</button>
			{/if}
		</div>
	</div>
</div>
