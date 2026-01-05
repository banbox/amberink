<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatTips, shortAddress } from '$lib/utils';
	import { formatDateMedium } from '$lib/formatUtils';
	import { weiToUsd, formatUsd } from '$lib/priceService';
	import { getAvatarUrl } from '$lib/arweave';
	import type { ArticleDetailData } from '$lib/graphql';

	type Props = {
		open: boolean;
		article: ArticleDetailData | null;
		collectEnabled: boolean;
		localCollectCount: number;
		maxCollectSupply: bigint;
		nativeTokenPrice: number | null;
		nativeSymbol: string;
		isCollecting: boolean;
		onClose: () => void;
		onCollect: () => void;
	};

	let {
		open,
		article,
		collectEnabled,
		localCollectCount,
		maxCollectSupply,
		nativeTokenPrice,
		nativeSymbol,
		isCollecting,
		onClose,
		onCollect
	}: Props = $props();

	// Derived values for safer access
	const collectAvailable = $derived(collectEnabled && localCollectCount < Number(maxCollectSupply));
</script>

{#if open && collectEnabled && article}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={onClose}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
			role="document"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 class="mb-4 text-lg font-bold text-gray-900">{m.collect_article()}</h3>

			<!-- Collect Stats -->
			<div class="mb-6 grid grid-cols-2 gap-4">
				<div class="rounded-lg bg-gray-50 p-3 text-center">
					<div class="text-2xl font-bold text-emerald-600">
						{formatTips(article?.collectPrice || '0')}
						{nativeSymbol}
					</div>
					<div class="mt-1 text-xs text-gray-500">
						{#if nativeTokenPrice}
							{#await weiToUsd(article?.collectPrice || '0')}
								≈ {formatUsd(0)}
							{:then usdPrice}
								≈ {formatUsd(usdPrice)}
							{/await}
						{:else}
							{m.price_label()}
						{/if}
					</div>
				</div>
				<div class="rounded-lg bg-gray-50 p-3 text-center">
					<div class="text-2xl font-bold text-gray-900">
						{localCollectCount}/{maxCollectSupply > 0n ? maxCollectSupply.toString() : '∞'}
					</div>
					<div class="text-xs text-gray-500">{m.collected_count()}/{m.total()}</div>
				</div>
			</div>

			<!-- Collectors List -->
			{#if article?.collections && article.collections.length > 0}
				<div class="mb-6">
					<h4 class="mb-3 text-sm font-medium text-gray-700">
						{m.collectors()} ({article.collections.length})
					</h4>
					<div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
						<table class="w-full text-sm">
							<thead class="sticky top-0 bg-gray-50">
								<tr class="text-left text-xs text-gray-500">
									<th class="px-3 py-2">{m.address()}</th>
									<th class="px-3 py-2 text-right">{m.amount()}</th>
									<th class="px-3 py-2 text-right">{m.time()}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each article.collections as collection}
									<tr class="hover:bg-gray-50">
										<td class="px-3 py-2">
											<a
												href={localizeHref(`/u?id=${collection.user.id}`)}
												class="flex items-center gap-2 hover:underline"
											>
												<Avatar
													url={getAvatarUrl(collection.user.avatar)}
													initials={collection.user.id.slice(2, 4).toUpperCase()}
													size="h-6 w-6"
													textSize="text-xs"
												/>
												<span class="truncate text-gray-700"
													>{collection.user.nickname || shortAddress(collection.user.id)}</span
												>
											</a>
										</td>
										<td class="px-3 py-2 text-right font-medium text-emerald-600">
											{formatTips(collection.amount)}
										</td>
										<td class="px-3 py-2 text-right text-gray-500">
											{formatDateMedium(collection.createdAt)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{:else}
				<div class="mb-6 rounded-lg border border-gray-200 p-4 text-center text-sm text-gray-500">
					{m.no_items({ items: m.collectors() })}
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button
					type="button"
					onclick={onClose}
					class="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
					disabled={isCollecting}
				>
					{m.cancel({})}
				</button>
				<button
					type="button"
					onclick={onCollect}
					disabled={isCollecting || !collectAvailable}
					class="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
				>
					{#if isCollecting}
						{m.processing({})}
					{:else if !collectAvailable}
						{m.sold_out()}
					{:else}
						{m.collect_for({
							price: formatTips(article?.collectPrice || '0'),
							symbol: nativeSymbol
						})}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
