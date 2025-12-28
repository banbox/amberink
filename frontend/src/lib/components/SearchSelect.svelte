<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { CloseIcon, ChevronDownIcon } from '$lib/components/icons';

	export interface SelectOption {
		key: string | number;
		label: string;
		value: unknown;
	}

	interface Props {
		value: unknown | unknown[];
		options: SelectOption[];
		placeholder?: string;
		disabled?: boolean;
		noResultsText?: string;
		maxSelection?: number;
		onchange?: (value: unknown | unknown[]) => void;
		'aria-labelledby'?: string;
	}

	let {
		value = $bindable(),
		options,
		placeholder = '',
		disabled = false,
		noResultsText = 'No results',
		maxSelection = 1,
		onchange,
		'aria-labelledby': ariaLabelledby
	}: Props = $props();

	// maxSelection > 1 means multiple selection mode
	let isMultiple = $derived(maxSelection > 1);

	let searchQuery = $state('');
	let showDropdown = $state(false);
	let inputRef: HTMLInputElement | null = $state(null);

	// For multiple selection mode
	let selectedValues = $derived.by(() => {
		if (isMultiple) {
			return Array.isArray(value) ? value : [];
		}
		return value !== null && value !== undefined ? [value] : [];
	});

	let selectedOptions = $derived.by(() => {
		return selectedValues
			.map((val) => options.find((opt) => opt.value === val))
			.filter((opt): opt is SelectOption => opt !== undefined);
	});

	let isMaxReached = $derived(selectedValues.length >= maxSelection);

	let canInput = $derived(!disabled && !isMaxReached);

	let filteredOptions = $derived.by(() => {
		const search = searchQuery.toLowerCase();
		let filtered = options;

		// Filter out already selected options in multiple mode
		if (isMultiple) {
			filtered = filtered.filter((opt) => !selectedValues.includes(opt.value));
		}

		if (!search) return filtered;
		return filtered.filter(
			(item) =>
				item.label.toLowerCase().includes(search) || String(item.key).toLowerCase().includes(search)
		);
	});

	// Single select compatibility
	let selectedOption = $derived(options.find((opt) => opt.value === value));

	let hasSelection = $derived.by(() => {
		if (isMultiple) {
			return selectedValues.length > 0;
		}
		return value !== null && value !== undefined && selectedOption !== undefined;
	});

	let inputPlaceholder = $derived(hasSelection ? '' : placeholder);

	function selectOption(option: SelectOption) {
		if (isMultiple) {
			const newValues = [...selectedValues, option.value];
			value = newValues;
			onchange?.(newValues);
		} else {
			value = option.value;
			onchange?.(option.value);
		}
		searchQuery = '';
		if (!isMultiple) {
			showDropdown = false;
		}
		// Keep focus on input for continuous selection in multiple mode
		if (isMultiple && inputRef) {
			inputRef.focus();
		}
	}

	function removeOption(val: unknown) {
		if (isMultiple) {
			const newValues = selectedValues.filter((v) => v !== val);
			value = newValues;
			onchange?.(newValues);
		} else {
			value = null;
			onchange?.(null);
		}
	}

	function handleInputFocus() {
		showDropdown = true;
	}

	function handleInputBlur() {
		setTimeout(() => {
			showDropdown = false;
		}, 150);
	}

	function clearSelection() {
		if (isMultiple) {
			value = [];
			onchange?.([]);
		} else {
			value = null;
			onchange?.(null);
		}
		searchQuery = '';
	}

	function handleContainerClick() {
		if (canInput && inputRef) {
			inputRef.focus();
		}
	}
</script>

<div class="relative">
	<!-- Container with tags and input -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="flex min-h-[48px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-300"
		class:cursor-not-allowed={disabled}
		class:bg-gray-50={disabled}
		role="combobox"
		tabindex="0"
		aria-labelledby={ariaLabelledby}
		aria-expanded={showDropdown}
		aria-controls="search-select-listbox"
		onclick={handleContainerClick}
	>
		<!-- Selected tags (capsules) -->
		{#each selectedOptions as opt (opt.key)}
			<span
				class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-800"
			>
				{opt.label}
				<button
					type="button"
					class="flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700"
					{disabled}
					aria-label={m.remove()}
					onmousedown={(e) => {
						e.preventDefault();
						e.stopPropagation();
						removeOption(opt.value);
					}}
				>
					<CloseIcon size={12} />
				</button>
			</span>
		{/each}
		<!-- Search input -->
		{#if canInput}
			<input
				bind:this={inputRef}
				bind:value={searchQuery}
				type="text"
				placeholder={inputPlaceholder}
				class="min-w-[60px] flex-1 border-none bg-transparent text-base text-gray-900 placeholder-gray-400 outline-none"
				{disabled}
				onfocus={handleInputFocus}
				onblur={handleInputBlur}
			/>
		{:else if isMaxReached && !disabled && maxSelection > 1}
			<!-- Max reached indicator -->
			<span class="flex-1 text-sm text-gray-400">
				{m.max_selection_reached()}
			</span>
		{/if}
		<!-- Right side icons -->
		<div class="ml-auto flex items-center gap-1 pl-2">
			{#if hasSelection && !disabled}
				<button
					type="button"
					class="text-gray-400 hover:text-gray-600"
					aria-label={m.clear()}
					onmousedown={(e) => {
						e.preventDefault();
						clearSelection();
					}}
				>
					<CloseIcon size={16} />
				</button>
			{/if}
			<ChevronDownIcon size={16} class="text-gray-400" />
		</div>
	</div>
	<!-- Dropdown -->
	{#if showDropdown && canInput}
		<div
			id="search-select-listbox"
			role="listbox"
			class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
		>
			<!-- Clear option when has selection -->
			{#if hasSelection}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="cursor-pointer border-b border-gray-100 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
					onmousedown={(e) => {
						e.preventDefault();
						clearSelection();
					}}
				>
					<span class="flex items-center gap-1">
						<CloseIcon size={12} />
						{m.clear_selection()}
					</span>
				</div>
			{/if}
			{#each filteredOptions as item (item.key)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="cursor-pointer px-4 py-2 text-sm hover:bg-gray-100"
					class:bg-gray-50={!isMultiple && value === item.value}
					class:font-medium={!isMultiple && value === item.value}
					onmousedown={(e) => {
						e.preventDefault();
						selectOption(item);
					}}
				>
					{item.label}
				</div>
			{/each}
			{#if filteredOptions.length === 0}
				<div class="px-4 py-2 text-sm text-gray-500">
					{noResultsText}
				</div>
			{/if}
		</div>
	{/if}
</div>
