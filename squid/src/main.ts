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

    async function ensureUser(userId: string, block: any): Promise<User> {
        const id = userId.toLowerCase()
        let user = usersToUpdate.get(id)
        if (!user) {
            user = await ctx.store.get(User, id)
        }
        if (!user) {
            user = new User({
                id,
                totalArticles: 0,
                totalFollowers: 0,
                totalFollowing: 0,
                createdAt: new Date(block.header.timestamp),
            })
        }
        usersToUpdate.set(user.id, user)
        return user
    }

    async function ensureArticle(articleId: string, block: any, log: any): Promise<Article> {
        let article = articles.find(a => a.id === articleId) || articlesToUpdate.get(articleId)
        if (!article) {
            article = await ctx.store.get(Article, articleId)
        }
        if (article && (article.author as any) == null) {
            article.author = await ensureUser(UNKNOWN_USER_ID, block)
            articlesToUpdate.set(articleId, article)
        }
        if (!article) {
            const unknownUser = await ensureUser(UNKNOWN_USER_ID, block)
            article = new Article({
                id: articleId,
                arweaveId: '',
                author: unknownUser,
                originalAuthor: null,
                trueAuthor: null,
                title: '',
                categoryId: 0n,
                royaltyBps: 0,
                collectPrice: 0n,
                maxCollectSupply: 0n,
                collectCount: 0n,
                originality: 0,
                totalTips: 0n,
                likeAmount: 0n,
                dislikeAmount: 0n,
                createdAt: new Date(block.header.timestamp),
                blockNumber: block.header.height,
                txHash: log.transactionHash,
            })
            articlesToUpdate.set(articleId, article)
        }
        return article
    }

    for (const block of ctx.blocks) {
        for (const log of block.logs) {
            
            // 处理文章发布事件
            if (log.topics[0] === ARTICLE_PUBLISHED) {
                const event = blogHub.events.ArticlePublished.decode(log)
                
                // 获取或创建用户
                let user = usersToUpdate.get(event.author.toLowerCase())
                if (!user) {
                    user = await ctx.store.get(User, event.author.toLowerCase())
                }
                if (!user) {
                    user = new User({
                        id: event.author.toLowerCase(),
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                }
                user.totalArticles += 1
                usersToUpdate.set(user.id, user)

                // 创建文章（注意：royaltyBps 不在事件中，需要通过合约调用获取或设为默认值）
                // arweaveId 现在是 Irys 可变文件夹的 manifest ID
                // 文章内容固定路径: index.md，封面图片固定路径: coverImage
                const articleId = event.articleId.toString()
                let article = articlesToUpdate.get(articleId) || articles.find(a => a.id === articleId)
                if (!article) {
                    article = new Article({
                        id: articleId,
                        arweaveId: event.arweaveId,
                        author: user,
                        originalAuthor: event.originalAuthor || null,
                        title: event.title,
                        trueAuthor: event.trueAuthor.toLowerCase(),
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
                } else {
                    article.arweaveId = event.arweaveId
                    article.author = user
                    article.originalAuthor = event.originalAuthor || null
                    article.title = event.title
                    article.trueAuthor = event.trueAuthor.toLowerCase()
                    article.categoryId = event.categoryId
                    article.collectPrice = event.collectPrice
                    article.maxCollectSupply = event.maxCollectSupply
                    article.collectCount = article.collectCount ?? 1n
                    article.originality = Number(event.originality)
                    article.createdAt = new Date(block.header.timestamp)
                    article.blockNumber = block.header.height
                    article.txHash = log.transactionHash
                    articlesToUpdate.set(articleId, article)
                }
            }

            // 处理评价事件
            if (log.topics[0] === ARTICLE_EVALUATED) {
                const event = blogHub.events.ArticleEvaluated.decode(log)
                
                // 确保用户存在
                let user = usersToUpdate.get(event.user.toLowerCase())
                if (!user) {
                    user = await ctx.store.get(User, event.user.toLowerCase())
                }
                if (!user) {
                    user = new User({
                        id: event.user.toLowerCase(),
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                    usersToUpdate.set(user.id, user)
                }

                const articleId = event.articleId.toString()
                const article = await ensureArticle(articleId, block, log)

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
                    // 将修改后的文章加入更新队列
                    articlesToUpdate.set(articleId, article)
                }
            }

            // 处理评论事件
            if (log.topics[0] === COMMENT_ADDED) {
                const event = blogHub.events.CommentAdded.decode(log)

                const articleId = event.articleId.toString()
                const article = await ensureArticle(articleId, block, log)

                let nextCommentId = nextCommentIdByArticle.get(articleId)
                if (nextCommentId == null) {
                    const last = await ctx.store.findOne(Comment, {
                        where: {article: {id: articleId} as any} as any,
                        order: {commentId: 'DESC'} as any,
                    })
                    nextCommentId = (last?.commentId ?? 0n) + 1n
                }
                const commentId = nextCommentId
                nextCommentIdByArticle.set(articleId, commentId + 1n)
                
                // 确保用户存在
                let user = usersToUpdate.get(event.commenter.toLowerCase())
                if (!user) {
                    user = await ctx.store.get(User, event.commenter.toLowerCase())
                }
                if (!user) {
                    user = new User({
                        id: event.commenter.toLowerCase(),
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                    usersToUpdate.set(user.id, user)
                }

                const comment = new Comment({
                    id: `${event.articleId.toString()}-${log.transactionHash}-${log.logIndex}`,
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

            // 处理评论点赞事件
            if (log.topics[0] === COMMENT_LIKED) {
                const event = blogHub.events.CommentLiked.decode(log)

                const articleId = event.articleId.toString()
                await ensureArticle(articleId, block, log)
                let comment = comments.find(c => (c.article as any)?.id === articleId && c.commentId === event.commentId)
                if (!comment) {
                    comment = await ctx.store.findOne(Comment, {
                        where: {article: {id: articleId} as any, commentId: event.commentId} as any,
                    })
                }
                if (comment) {
                    comment.likes += 1
                    commentsToUpdate.set(comment.id, comment)
                }

                let article = articles.find(a => a.id === articleId)
                    || articlesToUpdate.get(articleId)
                if (!article) {
                    article = await ctx.store.get(Article, articleId)
                }
                if (article && event.amountPaid > 0n) {
                    article.totalTips += event.amountPaid
                    articlesToUpdate.set(articleId, article)
                }
            }

            // 处理关注事件
            if (log.topics[0] === FOLLOW_STATUS_CHANGED) {
                const event = blogHub.events.FollowStatusChanged.decode(log)
                
                // 确保 follower 用户存在
                let followerUser = usersToUpdate.get(event.follower.toLowerCase())
                if (!followerUser) {
                    followerUser = await ctx.store.get(User, event.follower.toLowerCase())
                }
                if (!followerUser) {
                    followerUser = new User({
                        id: event.follower.toLowerCase(),
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                }

                // 确保 target 用户存在
                let targetUser = usersToUpdate.get(event.target.toLowerCase())
                if (!targetUser) {
                    targetUser = await ctx.store.get(User, event.target.toLowerCase())
                }
                if (!targetUser) {
                    targetUser = new User({
                        id: event.target.toLowerCase(),
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                }

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
                
                usersToUpdate.set(followerUser.id, followerUser)
                usersToUpdate.set(targetUser.id, targetUser)

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

            // 处理收藏事件
            if (log.topics[0] === ARTICLE_COLLECTED) {
                const event = blogHub.events.ArticleCollected.decode(log)

                const articleId = event.articleId.toString()
                const article = await ensureArticle(articleId, block, log)

                // 确保用户存在
                let user = usersToUpdate.get(event.collector.toLowerCase())
                if (!user) {
                    user = await ctx.store.get(User, event.collector.toLowerCase())
                }
                if (!user) {
                    user = new User({
                        id: event.collector.toLowerCase(),
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                    usersToUpdate.set(user.id, user)
                }

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

                // 更新文章收藏计数
                if (article) {
                    article.collectCount = (article.collectCount ?? 0n) + 1n
                    articlesToUpdate.set(articleId, article)
                }
            }

            // 处理用户资料更新事件
            if (log.topics[0] === USER_PROFILE_UPDATED) {
                const event = blogHub.events.UserProfileUpdated.decode(log)
                
                const userId = event.user.toLowerCase()
                let user = usersToUpdate.get(userId)
                if (!user) {
                    user = await ctx.store.get(User, userId)
                }
                if (!user) {
                    user = new User({
                        id: userId,
                        totalArticles: 0,
                        totalFollowers: 0,
                        totalFollowing: 0,
                        createdAt: new Date(block.header.timestamp)
                    })
                }
                
                // 更新用户资料字段
                user.nickname = event.nickname || null
                user.avatar = event.avatar || null
                user.bio = event.bio || null
                user.profileUpdatedAt = new Date(block.header.timestamp)
                
                usersToUpdate.set(user.id, user)
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
