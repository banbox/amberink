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
			trueAuthor
			title
			categoryId
			collectPrice
			maxCollectSupply
			collectCount
			originality
			likeAmount
			dislikeAmount
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
			trueAuthor
			title
			categoryId
			collectPrice
			maxCollectSupply
			collectCount
			originality
			likeAmount
			dislikeAmount
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
	trueAuthor: string | null;
	title: string;
	categoryId: string;
	collectPrice: string;
	maxCollectSupply: string;
	collectCount: string;
	originality: number;
	likeAmount: string;
	dislikeAmount: string;
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
 * Get single article by ID with comments
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
			trueAuthor
			title
			categoryId
			royaltyBps
			collectPrice
			maxCollectSupply
			collectCount
			originality
			likeAmount
			dislikeAmount
			totalTips
			createdAt
			blockNumber
			txHash
			comments(orderBy: createdAt_DESC) {
				id
				commentId
				user {
					id
				}
				content
				parentCommentId
				likes
				createdAt
				txHash
			}
		}
	}
`;

/**
 * Comment data from GraphQL
 */
export interface CommentData {
	id: string;
	commentId: string;
	user: {
		id: string;
	};
	content: string;
	parentCommentId: string | null;
	likes: number;
	createdAt: string;
	txHash: string;
}

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
	trueAuthor: string | null;
	title: string;
	categoryId: string;
	royaltyBps: number;
	collectPrice: string;
	maxCollectSupply: string;
	collectCount: string;
	originality: number;
	likeAmount: string;
	dislikeAmount: string;
	totalTips: string;
	createdAt: string;
	blockNumber: number;
	txHash: string;
	comments: CommentData[];
}
