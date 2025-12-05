import {TypeormDatabase} from '@subsquid/typeorm-store'
import {processor} from './processor'
import {Article, User, Evaluation, Comment, Follow} from './model'
import * as blogHub from './abi/BlogHub'

// 事件签名（从生成的 ABI 类型中获取）
const ARTICLE_PUBLISHED = blogHub.events.ArticlePublished.topic
const ARTICLE_EVALUATED = blogHub.events.ArticleEvaluated.topic
const COMMENT_ADDED = blogHub.events.CommentAdded.topic
const FOLLOW_STATUS_CHANGED = blogHub.events.FollowStatusChanged.topic

processor.run(new TypeormDatabase(), async (ctx) => {
    const articles: Article[] = []
    const articlesToUpdate = new Map<string, Article>()
    const evaluations: Evaluation[] = []
    const comments: Comment[] = []
    const follows: Follow[] = []
    const usersToUpdate = new Map<string, User>()

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
                const article = new Article({
                    id: event.articleId.toString(),
                    arweaveId: event.arweaveId,
                    author: user,
                    originalAuthor: event.originalAuthor || null,
                    title: event.title,
                    coverImage: event.coverImage || null,
                    categoryId: event.categoryId,
                    royaltyBps: 0, // 事件中不包含此字段，可通过合约查询或前端处理
                    likes: 0,
                    dislikes: 0,
                    totalTips: 0n,
                    createdAt: new Date(block.header.timestamp),
                    blockNumber: block.header.height,
                    txHash: log.transactionHash
                })
                articles.push(article)
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

                const evaluation = new Evaluation({
                    id: `${log.transactionHash}-${log.logIndex}`,
                    article: {id: event.articleId.toString()} as Article,
                    user: user,
                    score: Number(event.score),
                    amount: event.amountPaid,
                    createdAt: new Date(block.header.timestamp),
                    txHash: log.transactionHash
                })
                evaluations.push(evaluation)

                // 更新文章统计（需要先获取文章）
                const articleId = event.articleId.toString()
                let article = articles.find(a => a.id === articleId) 
                    || articlesToUpdate.get(articleId)
                if (!article) {
                    article = await ctx.store.get(Article, articleId)
                }
                if (article) {
                    if (event.score === 1) {
                        article.likes += 1
                    } else if (event.score === 2) {
                        article.dislikes += 1
                    }
                    if (event.amountPaid > 0n) {
                        article.totalTips += event.amountPaid
                    }
                    // 将修改后的文章加入更新队列
                    articlesToUpdate.set(articleId, article)
                }
            }

            // 处理评论事件
            if (log.topics[0] === COMMENT_ADDED) {
                const event = blogHub.events.CommentAdded.decode(log)
                
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
                    article: {id: event.articleId.toString()} as Article,
                    user: user,
                    content: event.content,
                    parentCommentId: event.parentCommentId > 0n ? event.parentCommentId : null,
                    likes: 0,
                    createdAt: new Date(block.header.timestamp),
                    txHash: log.transactionHash
                })
                comments.push(comment)
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
        }
    }

    // 批量保存
    await ctx.store.upsert([...usersToUpdate.values()])
    await ctx.store.insert(articles)
    await ctx.store.upsert([...articlesToUpdate.values()])  // 更新已存在文章的统计
    await ctx.store.insert(evaluations)
    await ctx.store.insert(comments)
    await ctx.store.upsert(follows)
})
