import { Arg, Field, InputType, ObjectType, Query, Resolver, Int } from 'type-graphql'
import type { EntityManager } from 'typeorm'
import { Article } from '../../model'

@InputType()
export class SearchArticlesInput {
    @Field({ nullable: true })
    query?: string

    @Field(() => Int, { nullable: true })
    categoryId?: number

    @Field(() => Int, { nullable: true })
    originality?: number

    @Field(() => Int, { nullable: true })
    minLikeAmount?: number

    @Field(() => Int, { nullable: true })
    limit?: number

    @Field(() => Int, { nullable: true })
    offset?: number

    @Field({ nullable: true })
    orderBy?: string

    @Field({ nullable: true })
    orderDirection?: string
}

@ObjectType()
export class SearchArticleResult {
    @Field()
    id!: string

    @Field()
    articleId!: string

    @Field()
    title!: string

    @Field({ nullable: true })
    summary?: string

    @Field({ nullable: true })
    keywords?: string

    @Field()
    categoryId!: string

    @Field()
    originality!: number

    @Field()
    likeAmount!: string

    @Field()
    dislikeAmount!: string

    @Field()
    totalTips!: string

    @Field()
    collectCount!: string

    @Field()
    createdAt!: Date

    @Field({ nullable: true })
    authorId?: string

    @Field({ nullable: true })
    authorNickname?: string
}

@ObjectType()
export class SearchArticlesResponse {
    @Field(() => [SearchArticleResult])
    articles!: SearchArticleResult[]

    @Field(() => Int)
    total!: number
}

@Resolver()
export class SearchResolver {
    constructor(private tx: () => Promise<EntityManager>) {}

    @Query(() => SearchArticlesResponse)
    async searchArticles(
        @Arg('input') input: SearchArticlesInput
    ): Promise<SearchArticlesResponse> {
        const manager = await this.tx()
        
        const {
            query,
            categoryId,
            originality,
            minLikeAmount,
            limit = 20,
            offset = 0,
            orderBy = 'createdAt',
            orderDirection = 'DESC'
        } = input

        // Build the query
        let qb = manager.createQueryBuilder(Article, 'article')
            .leftJoinAndSelect('article.author', 'author')

        // Full-text search across title, summary, keywords
        if (query && query.trim()) {
            const searchTerm = `%${query.trim().toLowerCase()}%`
            qb = qb.where(
                '(LOWER(article.title) LIKE :searchTerm OR LOWER(article.summary) LIKE :searchTerm OR LOWER(article.keywords) LIKE :searchTerm)',
                { searchTerm }
            )
        }

        // Filter by categoryId
        if (categoryId !== undefined && categoryId !== null) {
            qb = qb.andWhere('article.categoryId = :categoryId', { categoryId: BigInt(categoryId) })
        }

        // Filter by originality
        if (originality !== undefined && originality !== null) {
            qb = qb.andWhere('article.originality = :originality', { originality })
        }

        // Filter by minimum like amount
        if (minLikeAmount !== undefined && minLikeAmount !== null) {
            qb = qb.andWhere('article.likeAmount >= :minLikeAmount', { minLikeAmount: BigInt(minLikeAmount) })
        }

        // Get total count before pagination
        const total = await qb.getCount()

        // Apply ordering
        const validOrderFields = ['createdAt', 'likeAmount', 'totalTips', 'collectCount']
        const orderField = validOrderFields.includes(orderBy) ? orderBy : 'createdAt'
        const direction = orderDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
        qb = qb.orderBy(`article.${orderField}`, direction)

        // Apply pagination
        qb = qb.skip(offset).take(Math.min(limit, 100))

        const articles = await qb.getMany()

        return {
            articles: articles.map(article => ({
                id: article.id,
                articleId: article.articleId.toString(),
                title: article.title,
                summary: article.summary || undefined,
                keywords: article.keywords || undefined,
                categoryId: article.categoryId.toString(),
                originality: article.originality,
                likeAmount: article.likeAmount.toString(),
                dislikeAmount: article.dislikeAmount.toString(),
                totalTips: article.totalTips.toString(),
                collectCount: article.collectCount.toString(),
                createdAt: article.createdAt,
                authorId: (article.author as any)?.id,
                authorNickname: (article.author as any)?.nickname
            })),
            total
        }
    }
}
