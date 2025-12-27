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
			articleId
			author {
				id
				nickname
				avatar
			}
			originalAuthor
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
			articleId
			author {
				id
				nickname
				avatar
			}
			originalAuthor
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
 * Note: id is now arweaveId (Irys mutable folder manifest ID)
 * Cover image is accessed via id/coverImage path in Irys mutable folder
 */
export interface ArticleData {
	id: string;  // arweaveId (Irys mutable folder manifest ID, used as primary key)
	articleId: string;  // 链上 articleId（用于合约交互）
	author: {
		id: string;
		nickname?: string | null;
		avatar?: string | null;
	};
	originalAuthor: string | null;
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
			articleId
			author {
				id
				nickname
				avatar
			}
			originalAuthor
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
					nickname
					avatar
				}
				content
				parentCommentId
				likes
				createdAt
				txHash
			}
			collections(orderBy: amount_DESC) {
				id
				user {
					id
					nickname
					avatar
				}
				tokenId
				amount
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
		nickname?: string | null;
		avatar?: string | null;
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
/**
 * Collection data from GraphQL
 */
export interface CollectionData {
	id: string;
	user: {
		id: string;
		nickname?: string | null;
		avatar?: string | null;
	};
	tokenId: string;
	amount: string;
	createdAt: string;
	txHash: string;
}

/**
 * Article detail data from GraphQL
 * Note: id is now arweaveId (Irys mutable folder manifest ID)
 * Cover image is accessed via id/coverImage path in Irys mutable folder
 */
export interface ArticleDetailData {
	id: string;  // arweaveId (Irys mutable folder manifest ID, used as primary key)
	articleId: string;  // 链上 articleId（用于合约交互）
	author: {
		id: string;
		nickname?: string | null;
		avatar?: string | null;
	};
	originalAuthor: string | null;
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
	collections: CollectionData[];
}

// ============================================================
//                  User & Following Queries
// ============================================================

/**
 * Get user profile by address
 */
export const USER_BY_ID_QUERY = gql`
	query UserById($id: String!) {
		userById(id: $id) {
			id
			nickname
			avatar
			bio
			totalArticles
			totalFollowers
			totalFollowing
			createdAt
			profileUpdatedAt
		}
	}
`;

/**
 * Get articles by author with pagination
 */
export const ARTICLES_BY_AUTHOR_QUERY = gql`
	query ArticlesByAuthor($authorId: String!, $limit: Int!, $offset: Int!) {
		articles(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { author: { id_eq: $authorId } }
		) {
			id
			articleId
			author {
				id
				nickname
				avatar
			}
			originalAuthor
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
 * Get users that the current user is following
 */
export const USER_FOLLOWING_QUERY = gql`
	query UserFollowing($userId: String!, $limit: Int!, $offset: Int!) {
		follows(
			orderBy: updatedAt_DESC
			limit: $limit
			offset: $offset
			where: { follower: { id_eq: $userId }, isActive_eq: true }
		) {
			id
			following {
				id
				nickname
				avatar
				totalArticles
				totalFollowers
			}
			createdAt
			updatedAt
		}
	}
`;

/**
 * Get followers of a user
 */
export const USER_FOLLOWERS_QUERY = gql`
	query UserFollowers($userId: String!, $limit: Int!, $offset: Int!) {
		follows(
			orderBy: updatedAt_DESC
			limit: $limit
			offset: $offset
			where: { following: { id_eq: $userId }, isActive_eq: true }
		) {
			id
			follower {
				id
				nickname
				avatar
				totalArticles
				totalFollowers
			}
			createdAt
			updatedAt
		}
	}
`;

/**
 * Check if current user follows a target user
 */
export const CHECK_FOLLOW_STATUS_QUERY = gql`
	query CheckFollowStatus($followerId: String!, $followingId: String!) {
		follows(
			where: { 
				follower: { id_eq: $followerId }, 
				following: { id_eq: $followingId },
				isActive_eq: true
			}
			limit: 1
		) {
			id
			isActive
		}
	}
`;

// ============================================================
//                  Library Queries (Evaluations)
// ============================================================

/**
 * Get user's liked articles (score = 1)
 */
export const USER_LIKED_ARTICLES_QUERY = gql`
	query UserLikedArticles($userId: String!, $limit: Int!, $offset: Int!) {
		evaluations(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { user: { id_eq: $userId }, score_eq: 1 }
		) {
			id
			article {
				id
				articleId
				author {
					id
					nickname
					avatar
				}
				originalAuthor
				title
				categoryId
				likeAmount
				dislikeAmount
				totalTips
				createdAt
			}
			amount
			createdAt
		}
	}
`;

/**
 * Get user's disliked articles (score = 2)
 */
export const USER_DISLIKED_ARTICLES_QUERY = gql`
	query UserDislikedArticles($userId: String!, $limit: Int!, $offset: Int!) {
		evaluations(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { user: { id_eq: $userId }, score_eq: 2 }
		) {
			id
			article {
				id
				articleId
				author {
					id
					nickname
					avatar
				}
				originalAuthor
				title
				categoryId
				likeAmount
				dislikeAmount
				totalTips
				createdAt
			}
			amount
			createdAt
		}
	}
`;

/**
 * Get user's collected articles (NFT collections)
 */
export const USER_COLLECTED_ARTICLES_QUERY = gql`
	query UserCollectedArticles($userId: String!, $limit: Int!, $offset: Int!) {
		collections(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { user: { id_eq: $userId } }
		) {
			id
			article {
				id
				articleId
				author {
					id
					nickname
					avatar
				}
				originalAuthor
				title
				categoryId
				likeAmount
				dislikeAmount
				totalTips
				createdAt
			}
			tokenId
			amount
			createdAt
		}
	}
`;

/**
 * Get user's commented articles
 */
export const USER_COMMENTED_ARTICLES_QUERY = gql`
	query UserCommentedArticles($userId: String!, $limit: Int!, $offset: Int!) {
		comments(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { user: { id_eq: $userId } }
		) {
			id
			commentId
			content
			article {
				id
				articleId
				author {
					id
					nickname
					avatar
				}
				originalAuthor
				title
				categoryId
				likeAmount
				dislikeAmount
				totalTips
				createdAt
			}
			likes
			createdAt
		}
	}
`;

// ============================================================
//                  Type Definitions
// ============================================================

export interface UserData {
	id: string;
	nickname: string | null;
	avatar: string | null;
	bio: string | null;
	totalArticles: number;
	totalFollowers: number;
	totalFollowing: number;
	createdAt: string;
	profileUpdatedAt: string | null;
}

export interface FollowData {
	id: string;
	following?: {
		id: string;
		nickname?: string | null;
		avatar?: string | null;
		totalArticles: number;
		totalFollowers: number;
	};
	follower?: {
		id: string;
		nickname?: string | null;
		avatar?: string | null;
		totalArticles: number;
		totalFollowers: number;
	};
	createdAt: string;
	updatedAt: string;
}

export interface EvaluationWithArticle {
	id: string;
	article: ArticleData;
	amount: string;
	createdAt: string;
}

export interface CollectionWithArticle {
	id: string;
	article: ArticleData;
	tokenId: string;
	amount: string;
	createdAt: string;
}

export interface CommentWithArticle {
	id: string;
	commentId: string;
	content: string;
	article: ArticleData;
	likes: number;
	createdAt: string;
}

// ============================================================
//                  Session Key Transaction Queries
// ============================================================

/**
 * Get transactions by user wallet address with pagination
 */
export const USER_TRANSACTIONS_QUERY = gql`
	query UserTransactions($userId: String!, $limit: Int!, $offset: Int!) {
		transactions(
			orderBy: createdAt_DESC
			limit: $limit
			offset: $offset
			where: { user: { id_eq: $userId } }
		) {
			id
			user {
				id
			}
			sessionKey
			target
			method
			value
			feeAmount
			blockNumber
			createdAt
			txHash
		}
	}
`;

/**
 * Transaction data from GraphQL
 */
export interface TransactionData {
	id: string;
	user: {
		id: string;
	};
	sessionKey: string;
	target: string;
	method: string;
	value: string;
	feeAmount: string;
	blockNumber: number;
	createdAt: string;
	txHash: string;
}
