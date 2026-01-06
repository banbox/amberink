<script lang="ts">
	import { getAvatarUrl } from '$lib/arweave';

	type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	interface Props {
		/** User object with id and optional avatar */
		user?: { id: string; avatar?: string | null } | null;
		/** Optional direct URL (used if provided, or fallback to user.avatar) */
		url?: string | null;
		/** Optional direct initials (used if provided, or fallback to user.id) */
		initials?: string | null;
		/** Avatar size preset */
		size?: AvatarSize;
		/** Additional CSS classes */
		class?: string;
	}

	let { user, url, initials: customInitials, size = 'sm', class: className = '' }: Props = $props();

	// Size mappings for Tailwind classes
	const sizeClasses: Record<AvatarSize, { container: string; text: string }> = {
		xs: { container: 'h-6 w-6', text: 'text-xs' },
		sm: { container: 'h-8 w-8', text: 'text-xs' },
		md: { container: 'h-10 w-10', text: 'text-sm' },
		lg: { container: 'h-12 w-12', text: 'text-sm' },
		xl: { container: 'h-20 w-20', text: 'text-2xl font-bold' }
	};

	const displayUrl = $derived(url ?? (user?.avatar ? getAvatarUrl(user.avatar) : null));
	const displayInitials = $derived(
		customInitials ?? 
		(user?.id ? user.id.slice(2, 4).toUpperCase() : '??')
	);
	const sizeClass = $derived(sizeClasses[size]);
</script>

{#if displayUrl}
	<img
		src={displayUrl}
		alt=""
		class="rounded-full object-cover {sizeClass.container} {className}"
	/>
{:else}
	<div
		class="flex items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-white {sizeClass.container} {sizeClass.text} {className}"
	>
		{displayInitials}
	</div>
{/if}
