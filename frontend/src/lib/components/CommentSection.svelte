<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { CommentData } from '$lib/graphql/queries';
	import { ContractError, likeComment, likeCommentWithSessionKey } from '$lib/contracts';
	import type { StoredSessionKey } from '$lib/sessionKey';
	import { getMinActionValue } from '$lib/config';

	interface Props {
		articleId: string;
		comments: CommentData[];
		walletAddress: string | null;
		sessionKey: StoredSessionKey | null;
		hasValidSessionKey: boolean;
		isCommenting: boolean;
		onComment: (text: string) => void;
	}

	let { articleId, comments, walletAddress, sessionKey, hasValidSessionKey, isCommenting, onComment }: Props = $props();

	let likingCommentIds = $state<Set<string>>(new Set());

	// Comment input state
	let commentText = $state('');
	let isInputFocused = $state(false);
	let inputRef = $state<HTMLTextAreaElement | null>(null);

	// Format address to short form
	function shortAddress(address: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	// Format date - Medium style (e.g., "Dec 9, 2025")
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Handle submit
	function handleSubmit() {
		if (!commentText.trim() || isCommenting || !walletAddress) return;
		onComment(commentText.trim());
		commentText = '';
		isInputFocused = false;
	}

	function getErrorMessage(error: unknown): string {
		if (error instanceof ContractError) {
			const errorMessages: Record<string, string> = {
				user_rejected: m.error_user_rejected({}),
				insufficient_funds: m.error_insufficient_funds({}),
				network_error: m.error_network_error({}),
				contract_reverted: m.error_contract_reverted({}),
				gas_estimation_failed: m.error_gas_estimation_failed({}),
				nonce_too_low: m.error_nonce_too_low({}),
				replacement_underpriced: m.error_replacement_underpriced({}),
				wallet_not_connected: m.error_wallet_not_connected({}),
				wrong_network: m.error_wrong_network({}),
				timeout: m.error_timeout({}),
				unknown_error: m.error_unknown({})
			};
			return errorMessages[error.code] || error.message;
		}
		return error instanceof Error ? error.message : String(error);
	}

	async function handleLikeComment(comment: CommentData) {
		if (!walletAddress) return;
		if (likingCommentIds.has(comment.id)) return;

		likingCommentIds = new Set([...likingCommentIds, comment.id]);
		try {
			const minValue = getMinActionValue();
			const aId = BigInt(articleId);
			const cId = BigInt(comment.commentId);
			const commenter = comment.user.id as `0x${string}`;

			if (hasValidSessionKey && sessionKey) {
				await likeCommentWithSessionKey(
					sessionKey,
					aId,
					cId,
					commenter,
					'0x0000000000000000000000000000000000000000',
					minValue
				);
			} else {
				await likeComment(
					aId,
					cId,
					commenter,
					'0x0000000000000000000000000000000000000000',
					minValue
				);
			}

			comments = comments.map((c) => (c.id === comment.id ? { ...c, likes: c.likes + 1 } : c));
		} catch (e) {
			console.error('Failed to like comment:', e);
			alert(m.interaction_failed({ error: getErrorMessage(e) }));
		} finally {
			const next = new Set(likingCommentIds);
			next.delete(comment.id);
			likingCommentIds = next;
		}
	}

	// Handle cancel
	function handleCancel() {
		commentText = '';
		isInputFocused = false;
		inputRef?.blur();
	}

	// Insert formatting
	function insertFormatting(type: 'bold' | 'italic') {
		if (!inputRef) return;
		const start = inputRef.selectionStart;
		const end = inputRef.selectionEnd;
		const selectedText = commentText.substring(start, end);
		const wrapper = type === 'bold' ? '**' : '*';
		const newText = commentText.substring(0, start) + wrapper + selectedText + wrapper + commentText.substring(end);
		commentText = newText;
		// Restore cursor position
		setTimeout(() => {
			if (inputRef) {
				const newPos = selectedText ? end + wrapper.length * 2 : start + wrapper.length;
				inputRef.setSelectionRange(newPos, newPos);
				inputRef.focus();
			}
		}, 0);
	}

	// Get user display name
	const userDisplay = $derived(walletAddress ? shortAddress(walletAddress) : '');
	const userInitials = $derived(walletAddress ? shortAddress(walletAddress).slice(0, 2).toUpperCase() : '?');

	// Get display name for a comment user
	function getUserDisplay(user: CommentData['user']): string {
		return user.nickname || shortAddress(user.id);
	}

	// Get initials for avatar
	function getUserInitials(user: CommentData['user']): string {
		if (user.nickname) {
			return user.nickname.slice(0, 2).toUpperCase();
		}
		return shortAddress(user.id).slice(0, 2).toUpperCase();
	}
</script>

<section class="mt-8" id="comments">
	<!-- Comments List -->
	{#if comments && comments.length > 0}
		<h2 class="mb-6 text-xl font-bold text-gray-900">
			{m.comments({})} ({comments.length})
		</h2>
		<div class="space-y-6 mb-2">
			{#each comments as comment (comment.id)}
				<article class="comment-item">
					<!-- Row 1: Avatar + Nickname + Date -->
					<div class="flex items-center gap-3">
						<a href={`/u/${comment.user.id}`} class="shrink-0">
							{#if comment.user.avatar}
								<img src={comment.user.avatar} alt="" class="h-10 w-10 rounded-full object-cover" />
							{:else}
								<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-800 text-sm font-medium text-white">
									{getUserInitials(comment.user)}
								</div>
							{/if}
						</a>
						<div class="flex flex-col">
							<a href={`/u/${comment.user.id}`} class="text-sm font-medium text-gray-900 hover:underline">
								{getUserDisplay(comment.user)}
							</a>
							<time class="text-xs text-gray-500" datetime={comment.createdAt}>
								{formatDate(comment.createdAt)}
							</time>
						</div>
					</div>

					<!-- Row 2: Comment Content -->
					<div class="py-[15px]">
						<p class="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
							{comment.content}
						</p>
					</div>

					<!-- Row 3: Actions - Like (left) + Reply (right) -->
					<div class="flex items-center justify-between text-sm text-gray-500">
						<button
							type="button"
							class="flex items-center gap-1.5 hover:text-gray-700 transition-colors disabled:opacity-50"
							onclick={() => handleLikeComment(comment)}
							disabled={!walletAddress || likingCommentIds.has(comment.id)}
						>
							<svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
							</svg>
							<span>{comment.likes}</span>
						</button>
						<button type="button" class="hover:text-gray-700 transition-colors">
							{m.reply({})}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="py-4 text-center mb-8 text-gray-500">
			<p>{m.no_comments({})}</p>
		</div>
	{/if}

	<!-- Write Comment Section -->
	<div class="border-t border-gray-100 pt-6">
		<!-- User Info Row -->
		<div class="flex items-center gap-3 mb-3">
			<div class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-xs font-medium text-white">
				{userInitials}
			</div>
			<span class="text-sm font-medium text-gray-900">
				{userDisplay || m.anonymous({})}
			</span>
		</div>

		<!-- Comment Input -->
		<div class="rounded-lg p-3" class:flex={!isInputFocused} class:items-center={!isInputFocused} style="background-color: #F2F2F2;">
			<textarea
				bind:this={inputRef}
				bind:value={commentText}
				placeholder={m.write_comment({})}
				rows={isInputFocused ? 3 : 1}
				class="w-full resize-none rounded-lg border-0 text-[15px] text-gray-700 placeholder-gray-400 transition-all duration-200 focus:border-gray-300 focus:outline-none"
				class:bg-transparent={isInputFocused}
				disabled={isCommenting}
				onfocus={() => isInputFocused = true}
			></textarea>

			<!-- Actions Row (visible when focused) -->
			{#if isInputFocused}
				<div class="flex items-center justify-between mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
				<!-- Left: Formatting buttons -->
					<div class="flex items-center gap-1">
					<button
							type="button"
							onclick={() => insertFormatting('bold')}
							class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
							title={m.bold({})}
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8zm3-5v2h5a1 1 0 000-2H9zm0 8v2h6a1 1 0 000-2H9z"/>
							</svg>
						</button>
						<button
							type="button"
							onclick={() => insertFormatting('italic')}
							class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
							title={m.italic({})}
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M10 4v2h2.21l-3.42 12H6v2h8v-2h-2.21l3.42-12H18V4h-8z"/>
							</svg>
						</button>
					</div>

					<!-- Right: Cancel and Reply -->
					<div class="flex items-center gap-3">
					<button
							type="button"
							onclick={handleCancel}
							class="text-sm text-gray-500 hover:text-gray-700 transition-colors"
							disabled={isCommenting}
						>
							{m.cancel({})}
						</button>
						<button
							type="button"
							onclick={handleSubmit}
							disabled={isCommenting || !commentText.trim() || !walletAddress}
							class="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isCommenting ? m.posting({}) : m.reply({})}
						</button>
					</div>
				</div>

				<!-- Hint -->
				{#if !walletAddress}
					<p class="mt-2 text-xs text-gray-400">{m.please_connect_wallet({})}</p>
				{:else if !hasValidSessionKey}
					<p class="mt-2 text-xs text-amber-600">{m.enable_seamless_for_interaction({})}</p>
				{/if}
			{/if}
		</div>
	</div>
</section>

<style>
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes slide-in-from-top-1 {
		from { transform: translateY(-4px); }
		to { transform: translateY(0); }
	}
	.animate-in {
		animation: fade-in 0.2s ease-out, slide-in-from-top-1 0.2s ease-out;
	}
	.comment-item {
		padding-bottom: 1.25rem;
		border-bottom: 1px solid #f0f0f0;
	}
	.comment-item:last-child {
		border-bottom: none;
	}
</style>
