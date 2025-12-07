/**
 * GraphQL queries for SubSquid
 */
import { gql } from '@urql/svelte';

/**
 * Get articles with pagination and optional category filter
 * Note: coverImage is no longer stored on-chain, use arweaveId/coverImage path to access cover
 */
export const ARTICLES_QUERY = gql`
	query Articles($limit: Int!, $offset: Int!, $categoryId: BigInt) {
		articles(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { categoryId_eq: $categoryId }
		) {
			id
			arweaveId
			author {
				id
			}
			originalAuthor
			title
			categoryId
			likes
			dislikes
			totalTips
			createdAt
			blockNumber
			txHash
		}
	}
`;

/**
 * Get all articles (no category filter)
 * Note: coverImage is no longer stored on-chain, use arweaveId/coverImage path to access cover
 */
export const ALL_ARTICLES_QUERY = gql`
	query AllArticles($limit: Int!, $offset: Int!) {
		articles(orderBy: createdAt_DESC, limit: $limit, offset: $offset) {
			id
			arweaveId
			author {
				id
			}
			originalAuthor
			title
			categoryId
			likes
			dislikes
			totalTips
			createdAt
			blockNumber
			txHash
		}
	}
`;

/**
 * Get article count for a category
 */
export const ARTICLE_COUNT_QUERY = gql`
	query ArticleCount($categoryId: BigInt) {
		articlesConnection(where: { categoryId_eq: $categoryId }) {
			totalCount
		}
	}
`;

/**
 * Get total article count
 */
export const TOTAL_ARTICLE_COUNT_QUERY = gql`
	query TotalArticleCount {
		articlesConnection {
			totalCount
		}
	}
`;

/**
 * Article data from GraphQL
 * Note: Cover image is accessed via arweaveId/coverImage path in Irys mutable folder
 */
export interface ArticleData {
	id: string;
	arweaveId: string;  // Irys mutable folder manifest ID
	author: {
		id: string;
	};
	originalAuthor: string | null;
	title: string;
	categoryId: string;
	likes: number;
	dislikes: number;
	totalTips: string;
	createdAt: string;
	blockNumber: number;
	txHash: string;
}

export interface ArticlesQueryResult {
	articles: ArticleData[];
}

export interface ArticleCountResult {
	articlesConnection: {
		totalCount: number;
	};
}

/**
 * Get single article by ID
 * Note: coverImage is no longer stored on-chain, use arweaveId/coverImage path to access cover
 */
export const ARTICLE_BY_ID_QUERY = gql`
	query ArticleById($id: String!) {
		articleById(id: $id) {
			id
			arweaveId
			author {
				id
			}
			originalAuthor
			title
			categoryId
			royaltyBps
			likes
			dislikes
			totalTips
			createdAt
			blockNumber
			txHash
		}
	}
`;

/**
 * Article detail data from GraphQL
 * Note: Cover image is accessed via arweaveId/coverImage path in Irys mutable folder
 */
export interface ArticleDetailData {
	id: string;
	arweaveId: string;  // Irys mutable folder manifest ID
	author: {
		id: string;
	};
	originalAuthor: string | null;
	title: string;
	categoryId: string;
	royaltyBps: number;
	likes: number;
	dislikes: number;
	totalTips: string;
	createdAt: string;
	blockNumber: number;
	txHash: string;
}
