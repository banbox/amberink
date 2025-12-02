<script lang="ts">
	import { uploadArticle, uploadImage } from '$lib/arweave/upload'
	import type { ArticleMetadata } from '$lib/arweave/types'

	let title = $state('')
	let category = $state('')
	let author = $state('')
	let content = $state('')
	let postscript = $state('')
	let coverImageFile: File | null = $state(null)
	let coverImagePreview = $state<string | null>(null)
	let isSubmitting = $state(false)
	let submitStatus = $state<'idle' | 'success' | 'error'>('idle')
	let statusMessage = $state('')

	function handleCoverImageChange(e: Event) {
		const input = e.target as HTMLInputElement
		const file = input.files?.[0]

		if (file) {
			coverImageFile = file
			const reader = new FileReader()
			reader.onload = (event) => {
				coverImagePreview = event.target?.result as string
			}
			reader.readAsDataURL(file)
		}
	}

	function removeCoverImage() {
		coverImageFile = null
		coverImagePreview = null
	}

	async function handleSubmit() {
		if (!title.trim() || !content.trim()) {
			statusMessage = 'Please fill in title and content'
			submitStatus = 'error'
			return
		}

		isSubmitting = true
		submitStatus = 'idle'

		try {
			let coverImageHash: string | undefined

			if (coverImageFile) {
				coverImageHash = await uploadImage(coverImageFile, 'devnet')
			}

			const tags = category ? category.split(',').map((t) => t.trim()) : []

			const articleMetadata: Omit<ArticleMetadata, 'createdAt' | 'version'> = {
				title: title.trim(),
				summary: title.trim(),
				content: content.trim(),
				coverImage: coverImageHash,
				tags
			}

			const articleHash = await uploadArticle(articleMetadata, 'devnet')

			statusMessage = `Article published successfully! Hash: ${articleHash}`
			submitStatus = 'success'

			title = ''
			category = ''
			author = ''
			content = ''
			postscript = ''
			coverImageFile = null
			coverImagePreview = null
		} catch (error) {
			console.error('Publish error:', error)
			statusMessage = `Failed to publish: ${error instanceof Error ? error.message : 'Unknown error'}`
			submitStatus = 'error'
		} finally {
			isSubmitting = false
		}
	}
</script>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<header class="mb-12">
			<h1 class="mb-2 text-4xl font-light tracking-tight">Publish Article</h1>
			<p class="text-gray-500">Share your thoughts with the world</p>
		</header>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
			<div>
				<label for="title" class="block text-sm font-medium text-gray-700 mb-2">Title</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					placeholder="Enter article title"
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				/>
			</div>

			<div>
				<label for="category" class="block text-sm font-medium text-gray-700 mb-2">
					Category (comma-separated)
				</label>
				<input
					id="category"
					type="text"
					bind:value={category}
					placeholder="e.g. Technology, Design, Business"
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				/>
			</div>

			<div>
				<label for="author" class="block text-sm font-medium text-gray-700 mb-2">Author</label>
				<input
					id="author"
					type="text"
					bind:value={author}
					placeholder="Your name"
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-3">Cover Image</label>
				{#if coverImagePreview}
					<div class="space-y-3">
						<div class="relative overflow-hidden rounded-lg bg-gray-100">
							<img src={coverImagePreview} alt="Cover preview" class="h-64 w-full object-cover" />
						</div>
						<button
							type="button"
							onclick={removeCoverImage}
							class="text-sm text-gray-600 underline hover:text-gray-900"
							disabled={isSubmitting}
						>
							Remove image
						</button>
					</div>
				{:else}
					<label class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 px-6 py-10 transition-colors hover:border-gray-300">
						<svg class="mb-2 h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						<p class="text-sm font-medium text-gray-700">Upload cover image</p>
						<p class="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
						<input
							type="file"
							accept="image/*"
							onchange={handleCoverImageChange}
							class="hidden"
							disabled={isSubmitting}
						/>
					</label>
				{/if}
			</div>

			<div>
				<label for="content" class="block text-sm font-medium text-gray-700 mb-2">
					Content (Markdown supported)
				</label>
				<textarea
					id="content"
					bind:value={content}
					placeholder="Write your article content here..."
					rows={12}
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				/>
			</div>

			<div>
				<label for="postscript" class="block text-sm font-medium text-gray-700 mb-2">Postscript</label>
				<textarea
					id="postscript"
					bind:value={postscript}
					placeholder="Optional postscript or footer note..."
					rows={4}
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				/>
			</div>

			{#if submitStatus !== 'idle'}
				<div
					class={`rounded-lg px-4 py-3 text-sm ${
						submitStatus === 'success'
							? 'border border-green-200 bg-green-50 text-green-800'
							: 'border border-red-200 bg-red-50 text-red-800'
					}`}
				>
					{statusMessage}
				</div>
			{/if}

			<div class="flex gap-3">
				<button
					type="submit"
					disabled={isSubmitting}
					class="flex-1 rounded-lg bg-gray-900 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{isSubmitting ? 'Publishing...' : 'Publish Article'}
				</button>
				<button
					type="reset"
					onclick={() => {
						title = ''
						category = ''
						author = ''
						content = ''
						postscript = ''
						coverImageFile = null
						coverImagePreview = null
						submitStatus = 'idle'
					}}
					disabled={isSubmitting}
					class="rounded-lg border border-gray-200 px-6 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
				>
					Clear
				</button>
			</div>
		</form>
	</div>
</div>
