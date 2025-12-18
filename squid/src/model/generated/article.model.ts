import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, ManyToOne as ManyToOne_, Index as Index_, StringColumn as StringColumn_, IntColumn as IntColumn_, OneToMany as OneToMany_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"
import {User} from "./user.model"
import {Comment} from "./comment.model"
import {Evaluation} from "./evaluation.model"
import {Collection} from "./collection.model"

@Entity_()
export class Article {
    constructor(props?: Partial<Article>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    articleId!: bigint

    @Index_()
    @ManyToOne_(() => User, {nullable: true})
    author!: User

    @StringColumn_({nullable: true})
    originalAuthor!: string | undefined | null

    @StringColumn_({nullable: true})
    trueAuthor!: string | undefined | null

    @StringColumn_({nullable: false})
    title!: string

    @StringColumn_({nullable: true})
    summary!: string | undefined | null

    @StringColumn_({nullable: true})
    keywords!: string | undefined | null

    @BigIntColumn_({nullable: false})
    categoryId!: bigint

    @IntColumn_({nullable: false})
    royaltyBps!: number

    @BigIntColumn_({nullable: false})
    collectPrice!: bigint

    @BigIntColumn_({nullable: false})
    maxCollectSupply!: bigint

    @BigIntColumn_({nullable: false})
    collectCount!: bigint

    @IntColumn_({nullable: false})
    originality!: number

    @BigIntColumn_({nullable: false})
    totalTips!: bigint

    @BigIntColumn_({nullable: false})
    likeAmount!: bigint

    @BigIntColumn_({nullable: false})
    dislikeAmount!: bigint

    @OneToMany_(() => Comment, e => e.article)
    comments!: Comment[]

    @OneToMany_(() => Evaluation, e => e.article)
    evaluations!: Evaluation[]

    @OneToMany_(() => Collection, e => e.article)
    collections!: Collection[]

    @DateTimeColumn_({nullable: false})
    createdAt!: Date

    @DateTimeColumn_({nullable: true})
    editedAt!: Date | undefined | null

    @IntColumn_({nullable: false})
    blockNumber!: number

    @StringColumn_({nullable: false})
    txHash!: string
}
