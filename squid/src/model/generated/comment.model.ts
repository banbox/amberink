import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, ManyToOne as ManyToOne_, Index as Index_, StringColumn as StringColumn_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"
import {Article} from "./article.model"
import {User} from "./user.model"

@Entity_()
export class Comment {
    constructor(props?: Partial<Comment>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    commentId!: bigint

    @Index_()
    @ManyToOne_(() => Article, {nullable: true})
    article!: Article

    @Index_()
    @ManyToOne_(() => User, {nullable: true})
    user!: User

    @StringColumn_({nullable: false})
    content!: string

    @BigIntColumn_({nullable: true})
    parentCommentId!: bigint | undefined | null

    @IntColumn_({nullable: false})
    likes!: number

    @DateTimeColumn_({nullable: false})
    createdAt!: Date

    @StringColumn_({nullable: false})
    txHash!: string
}
