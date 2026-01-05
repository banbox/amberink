import { getMutableFolderUrl, getStaticFolderUrl } from '$lib/arweave/folder';
import { ARTICLE_BY_ID_QUERY, type ArticleDetailData } from '$lib/graphql';
import type { Client } from '@urql/core';


/**
 * Process article content to replace relative image URLs with full Irys URLs
 * Handles two formats:
 * 1. Markdown: ![alt](filename.png) -> ![alt](https://{host}/mutable/{arweaveId}/filename.png)
 * 2. HTML: <img src="filename.jpg" ... /> -> <img src="https://{host}/mutable/{arweaveId}/filename.jpg" ... />
 * @param content - The markdown content
 * @param arweaveId - The article's arweave ID (manifest ID)
 * @param useMutable - Whether to use mutable URL (true for latest, false for specific version)
 */
export function processContentImages(content: string, arweaveId: string, useMutable = true): string {
    // Use getMutableFolderUrl/getStaticFolderUrl which handle devnet/mainnet correctly
    const baseUrl = useMutable
        ? getMutableFolderUrl(arweaveId)
        : getStaticFolderUrl(arweaveId);

    // Process Markdown image syntax: ![alt](relative-path)
    // Only replace if the path is relative (not starting with http://, https://, or /)
    let processed = content.replace(
        /!\[([^\]]*)\]\((?!https?:\/\/)(?!\/)([\w\-\.]+)\)/g,
        (_, alt, filename) => `![${alt}](${baseUrl}/${filename})`
    );

    // Process HTML img tags: <img src="relative-path" ... />
    // Only replace if src is relative (not starting with http://, https://, or /)
    processed = processed.replace(
        /<img\s+([^>]*?)src=["'](?!https?:\/\/)(?!\/)([^"']+)["']([^>]*?)>/gi,
        (_, before, filename, after) => `<img ${before}src="${baseUrl}/${filename}"${after}>`
    );

    return processed;
}

// Get gradient color based on score (0-10)
export function getScoreColor(score: number | null): string {
    if (score === null) return 'text-gray-400';
    if (score >= 8) return 'bg-gradient-to-r from-emerald-500 to-green-400 bg-clip-text text-transparent';
    if (score >= 6) return 'bg-gradient-to-r from-lime-500 to-emerald-400 bg-clip-text text-transparent';
    if (score >= 4) return 'bg-gradient-to-r from-amber-500 to-yellow-400 bg-clip-text text-transparent';
    if (score >= 2) return 'bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent';

    return 'bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent';
}

/**
 * Polls for article data with exponential backoff retry
 * Useful for newly published articles that may not be indexed yet
 */
export async function pollForArticleWithRetry(
    client: Client,
    articleId: string,
    maxRetryTime = 15000,
    retryDelays = [500, 1000, 1500, 2000, 2500, 3000, 3500]
): Promise<ArticleDetailData | null> {
    let totalWaitTime = 0;
    let retryIndex = 0;

    while (totalWaitTime < maxRetryTime) {
        try {
            const result = await client.query(ARTICLE_BY_ID_QUERY, { id: articleId }, { requestPolicy: 'network-only' }).toPromise();

            if (result.error) {
                console.warn('GraphQL query error:', result.error.message);
                // Return null on error so caller can decide what to do (e.g. use Irys data)
                return null;
            }

            const article = result.data?.articleById ?? null;
            if (article) {
                return article;
            }

            if (retryIndex < retryDelays.length) {
                const delay = retryDelays[retryIndex];
                if (totalWaitTime + delay > maxRetryTime) break;

                console.log(`Article not found in index, retrying in ${delay}ms... (attempt ${retryIndex + 1})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                totalWaitTime += delay;
                retryIndex++;
            } else {
                break;
            }
        } catch (e) {
            console.error('Failed to query article from Subsquid:', e);
            return null;
        }
    }
    return null;
}
