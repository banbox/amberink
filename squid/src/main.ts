import {TypeormDatabase} from '@subsquid/typeorm-store'
import {processor} from './processor'
import {Article, User, Evaluation, Comment, Follow, Collection} from './model'
import * as blogHub from './abi/BlogHub'

// 事件签名（从生成的 ABI 类型中获取）
const ARTICLE_PUBLISHED = blogHub.events.ArticlePublished.topic
const ARTICLE_EVALUATED = blogHub.events.ArticleEvaluated.topic
const COMMENT_ADDED = blogHub.events.CommentAdded.topic
const COMMENT_LIKED = blogHub.events.CommentLiked.topic
const FOLLOW_STATUS_CHANGED = blogHub.events.FollowStatusChanged.topic
const ARTICLE_COLLECTED = blogHub.events.ArticleCollected.topic
const USER_PROFILE_UPDATED = blogHub.events.UserProfileUpdated.topic
const ARTICLE_EDITED = blogHub.events.ArticleEdited.topic

processor.run(new TypeormDatabase(), async (ctx) => {
    const articles: Article[] = []
    const articlesToUpdate = new Map<string, Article>()
    const evaluations: Evaluation[] = []
    const comments: Comment[] = []
    const commentsToUpdate = new Map<string, Comment>()
    const follows: Follow[] = []
    const collections: Collection[] = []
    const usersToUpdate = new Map<string, User>()
    const nextCommentIdByArticle = new Map<string, bigint>()

    const UNKNOWN_USER_ID = '0x0000000000000000000000000000000000000000'

    async function ensureUser(userId: string, timestamp: number): Promise<User> {
        const id = userId.toLowerCase()
        let user = usersToUpdate.get(id) ?? await ctx.store.get(User, id)
        if (!user) {
            user = new User({
                id,
                nickname: null,
                avatar: null,
                bio: null,
                totalArticles: 0,
                totalFollowers: 0,
                totalFollowing: 0,
                createdAt: new Date(timestamp),
            })
        }
        usersToUpdate.set(user.id, user)
        return user
    }

    // arweaveId -> Article 的缓存映射，用于在处理其他事件时快速查找
    const arweaveIdCache = new Map<string, Article>()
    // articleId -> arweaveId 的映射，用于通过链上 articleId 查找 arweaveId
    const articleIdToArweaveId = new Map<string, string>()

    async function ensureArticleByArweaveId(arweaveId: string, timestamp: number, blockHeight: number, txHash: string): Promise<Article> {
        let article = articles.find(a => a.id === arweaveId) ?? articlesToUpdate.get(arweaveId) ?? arweaveIdCache.get(arweaveId)
        if (!article) {
            article = await ctx.store.findOne(Article, {
                where: { id: arweaveId } as any,
                relations: { author: true }
            }) ?? undefined
        }
        if (article && (article.author as any) == null) {
            article.author = await ensureUser(UNKNOWN_USER_ID, timestamp)
            articlesToUpdate.set(arweaveId, article)
        }
        if (!article) {
            article = new Article({
                id: arweaveId,
                articleId: 0n,
                author: await ensureUser(UNKNOWN_USER_ID, timestamp),
                originalAuthor: null,
                title: '',
                summary: null,
                categoryId: 0n,
                royaltyBps: 0,
                collectPrice: 0n,
                maxCollectSupply: 0n,
                collectCount: 0n,
                originality: 0,
                totalTips: 0n,
                likeAmount: 0n,
                dislikeAmount: 0n,
                createdAt: new Date(timestamp),
                blockNumber: blockHeight,
                txHash,
            })
            articlesToUpdate.set(arweaveId, article)
        }
        arweaveIdCache.set(arweaveId, article)
        return article
    }

    async function getArticleByChainId(articleId: bigint, timestamp: number, blockHeight: number, txHash: string): Promise<Article | null> {
        const articleIdStr = articleId.toString()
        const cachedArweaveId = articleIdToArweaveId.get(articleIdStr)
        if (cachedArweaveId) {
            return ensureArticleByArweaveId(cachedArweaveId, timestamp, blockHeight, txHash)
        }
        const existingArticle = await ctx.store.findOne(Article, {
            where: { articleId } as any,
            relations: { author: true }
        })
        if (existingArticle) {
            articleIdToArweaveId.set(articleIdStr, existingArticle.id)
            arweaveIdCache.set(existingArticle.id, existingArticle)
            return existingArticle
        }
        return null
    }

    for (const block of ctx.blocks) {
        for (const log of block.logs) {
            
            if (log.topics[0] === ARTICLE_PUBLISHED) {
                const event = blogHub.events.ArticlePublished.decode(log)
                const user = await ensureUser(event.author, block.header.timestamp)
                user.totalArticles += 1

                // 创建文章（注意：royaltyBps 不在事件中，需要通过合约调用获取或设为默认值）
                // 使用 arweaveId 作为实体 ID（主键）
                // 文章内容固定路径: index.md，封面图片固定路径: coverImage
                const arweaveId = event.arweaveId
                const articleIdNum = event.articleId
                
                // 建立 articleId -> arweaveId 的映射
                articleIdToArweaveId.set(articleIdNum.toString(), arweaveId)
                
                let article = articlesToUpdate.get(arweaveId) || articles.find(a => a.id === arweaveId)
                if (!article) {
                    article = new Article({
                        id: arweaveId,  // 使用 arweaveId 作为主键
                        articleId: articleIdNum,  // 保存链上 articleId
                        author: user,
                        originalAuthor: event.originalAuthor || null,
                        title: event.title,
                        summary: event.summary || null,
                        categoryId: event.categoryId,
                        collectPrice: event.collectPrice,
                        maxCollectSupply: event.maxCollectSupply,
                        collectCount: 1n,
                        originality: Number(event.originality),
                        royaltyBps: 0, // 事件中不包含此字段，可通过合约查询或前端处理
                        totalTips: 0n,
                        likeAmount: 0n,
                        dislikeAmount: 0n,
                        createdAt: new Date(block.header.timestamp),
                        blockNumber: block.header.height,
                        txHash: log.transactionHash
                    })
                    articles.push(article)
                    arweaveIdCache.set(arweaveId, article)
                } else {
                    article.articleId = articleIdNum
                    article.author = user
                    article.originalAuthor = event.originalAuthor || null
                    article.title = event.title
                    article.summary = event.summary || null
                    article.categoryId = event.categoryId
                    article.collectPrice = event.collectPrice
                    article.maxCollectSupply = event.maxCollectSupply
                    article.collectCount = article.collectCount ?? 1n
                    article.originality = Number(event.originality)
                    article.createdAt = new Date(block.header.timestamp)
                    article.blockNumber = block.header.height
                    article.txHash = log.transactionHash
                    articlesToUpdate.set(arweaveId, article)
                    arweaveIdCache.set(arweaveId, article)
                }
            }

            if (log.topics[0] === ARTICLE_EVALUATED) {
                const event = blogHub.events.ArticleEvaluated.decode(log)
                const user = await ensureUser(event.user, block.header.timestamp)
                const article = await getArticleByChainId(event.articleId, block.header.timestamp, block.header.height, log.transactionHash)
                if (!article) {
                    console.warn(`Article not found for articleId ${event.articleId}, skipping evaluation event`)
                    continue
                }

                const evaluation = new Evaluation({
                    id: `${log.transactionHash}-${log.logIndex}`,
                    article: article,
                    user: user,
                    score: Number(event.score),
                    amount: event.amountPaid,
                    createdAt: new Date(block.header.timestamp),
                    txHash: log.transactionHash
                })
                evaluations.push(evaluation)

                // 更新文章统计（需要先获取文章）
                if (article) {
                    const evaluatorId = event.user.toLowerCase()
                    const authorId = (article.author as any)?.id?.toLowerCase()
                    const isSelfEvaluation = authorId != null && evaluatorId === authorId
                    if (event.amountPaid > 0n) {
                        article.totalTips += event.amountPaid

                        if (!isSelfEvaluation) {
                            if (event.score === 1) {
                                article.likeAmount += event.amountPaid
                            } else if (event.score === 2) {
                                article.dislikeAmount += event.amountPaid
                            }
                        }
                    }
                    // 将修改后的文章加入更新队列（使用 arweaveId 作为 key）
                    articlesToUpdate.set(article.id, article)
                }
            }

            if (log.topics[0] === COMMENT_ADDED) {
                const event = blogHub.events.CommentAdded.decode(log)
                const article = await getArticleByChainId(event.articleId, block.header.timestamp, block.header.height, log.transactionHash)
                if (!article) {
                    console.warn(`Article not found for articleId ${event.articleId}, skipping comment event`)
                    continue
                }
                const arweaveId = article.id
                let nextCommentId = nextCommentIdByArticle.get(arweaveId)
                if (nextCommentId == null) {
                    const last = await ctx.store.findOne(Comment, {
                        where: {article: {id: arweaveId} as any} as any,
                        order: {commentId: 'DESC'} as any,
                    })
                    nextCommentId = (last?.commentId ?? 0n) + 1n
                }
                const commentId = nextCommentId
                nextCommentIdByArticle.set(arweaveId, commentId + 1n)
                const user = await ensureUser(event.commenter, block.header.timestamp)

                const comment = new Comment({
                    id: `${arweaveId}-${log.transactionHash}-${log.logIndex}`,
                    commentId: commentId,
                    article: article,
                    user: user,
                    content: event.content,
                    parentCommentId: event.parentCommentId > 0n ? event.parentCommentId : null,
                    likes: 0,
                    createdAt: new Date(block.header.timestamp),
                    txHash: log.transactionHash
                })
                comments.push(comment)
            }

            if (log.topics[0] === COMMENT_LIKED) {
                const event = blogHub.events.CommentLiked.decode(log)
                const article = await getArticleByChainId(event.articleId, block.header.timestamp, block.header.height, log.transactionHash)
                if (!article) {
                    console.warn(`Article not found for articleId ${event.articleId}, skipping comment like event`)
                    continue
                }
                const arweaveId = article.id
                let comment = comments.find(c => (c.article as any)?.id === arweaveId && c.commentId === event.commentId)
                    ?? await ctx.store.findOne(Comment, { where: {article: {id: arweaveId} as any, commentId: event.commentId} as any })
                if (comment) {
                    comment.likes += 1
                    commentsToUpdate.set(comment.id, comment)
                }
                if (event.amountPaid > 0n) {
                    article.totalTips += event.amountPaid
                    articlesToUpdate.set(arweaveId, article)
                }
            }

            if (log.topics[0] === FOLLOW_STATUS_CHANGED) {
                const event = blogHub.events.FollowStatusChanged.decode(log)
                const followerUser = await ensureUser(event.follower, block.header.timestamp)
                const targetUser = await ensureUser(event.target, block.header.timestamp)

                const followId = `${event.follower.toLowerCase()}-${event.target.toLowerCase()}`
                let follow = await ctx.store.get(Follow, followId)
                
                // 更新用户关注统计
                if (!follow && event.isFollowing) {
                    // 新关注
                    followerUser.totalFollowing += 1
                    targetUser.totalFollowers += 1
                } else if (follow && follow.isActive !== event.isFollowing) {
                    // 状态变更
                    if (event.isFollowing) {
                        followerUser.totalFollowing += 1
                        targetUser.totalFollowers += 1
                    } else {
                        followerUser.totalFollowing = Math.max(0, followerUser.totalFollowing - 1)
                        targetUser.totalFollowers = Math.max(0, targetUser.totalFollowers - 1)
                    }
                }
                
                if (!follow) {
                    follow = new Follow({
                        id: followId,
                        follower: followerUser,
                        following: targetUser,
                        isActive: event.isFollowing,
                        createdAt: new Date(block.header.timestamp),
                        updatedAt: new Date(block.header.timestamp)
                    })
                } else {
                    follow.isActive = event.isFollowing
                    follow.updatedAt = new Date(block.header.timestamp)
                }
                follows.push(follow)
            }

            if (log.topics[0] === ARTICLE_COLLECTED) {
                const event = blogHub.events.ArticleCollected.decode(log)
                const article = await getArticleByChainId(event.articleId, block.header.timestamp, block.header.height, log.transactionHash)
                if (!article) {
                    console.warn(`Article not found for articleId ${event.articleId}, skipping collection event`)
                    continue
                }
                const user = await ensureUser(event.collector, block.header.timestamp)

                const collection = new Collection({
                    id: `${log.transactionHash}-${log.logIndex}`,
                    user: user,
                    article: article,
                    tokenId: event.tokenId,
                    amount: event.amount,
                    createdAt: new Date(block.header.timestamp),
                    txHash: log.transactionHash
                })
                collections.push(collection)
                article.collectCount = (article.collectCount ?? 0n) + 1n
                articlesToUpdate.set(article.id, article)
            }

            if (log.topics[0] === USER_PROFILE_UPDATED) {
                const event = blogHub.events.UserProfileUpdated.decode(log)
                const user = await ensureUser(event.user, block.header.timestamp)
                user.nickname = event.nickname || null
                user.avatar = event.avatar || null
                user.bio = event.bio || null
                user.profileUpdatedAt = new Date(block.header.timestamp)
            }

            if (log.topics[0] === ARTICLE_EDITED) {
                const event = blogHub.events.ArticleEdited.decode(log)
                const article = await getArticleByChainId(event.articleId, block.header.timestamp, block.header.height, log.transactionHash)
                if (!article) {
                    ctx.log.warn(`ArticleEdited: article not found for articleId ${event.articleId}`)
                    continue
                }
                article.title = event.title
                article.summary = event.summary || null
                article.originalAuthor = event.originalAuthor || null
                article.categoryId = event.categoryId
                article.editedAt = new Date(block.header.timestamp)
                articlesToUpdate.set(article.id, article)
            }
        }
    }

    // 批量保存
    await ctx.store.upsert([...usersToUpdate.values()])
    await ctx.store.upsert(articles)
    await ctx.store.upsert([...articlesToUpdate.values()])  // 更新已存在文章的统计
    await ctx.store.insert(evaluations)
    await ctx.store.insert(comments)
    await ctx.store.upsert([...commentsToUpdate.values()])
    await ctx.store.insert(collections)
    await ctx.store.upsert(follows)
})
