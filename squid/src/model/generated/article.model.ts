import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, OneToMany as OneToMany_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"
import {User} from "./user.model"
import {Comment} from "./comment.model"
import {Evaluation} from "./evaluation.model"

@Entity_()
export class Article {
    constructor(props?: Partial<Article>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    arweaveId!: string

    @Index_()
    @ManyToOne_(() => User, {nullable: true})
    author!: User

    @StringColumn_({nullable: true})
    originalAuthor!: string | undefined | null

    @StringColumn_({nullable: false})
    title!: string

    @BigIntColumn_({nullable: false})
    categoryId!: bigint

    @IntColumn_({nullable: false})
    royaltyBps!: number

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

    @DateTimeColumn_({nullable: false})
    createdAt!: Date

    @IntColumn_({nullable: false})
    blockNumber!: number

    @StringColumn_({nullable: false})
    txHash!: string
}
