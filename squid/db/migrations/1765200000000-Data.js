module.exports = class Data1765200000000 {
    name = 'Data1765200000000'

    async up(db) {
        await db.query(`ALTER TABLE "article" ADD "like_amount" numeric`)
        await db.query(`UPDATE "article" SET "like_amount" = 0 WHERE "like_amount" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "like_amount" SET NOT NULL`)

        await db.query(`ALTER TABLE "article" ADD "dislike_amount" numeric`)
        await db.query(`UPDATE "article" SET "dislike_amount" = 0 WHERE "dislike_amount" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "dislike_amount" SET NOT NULL`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "article" DROP COLUMN "like_amount"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "dislike_amount"`)

        await db.query(`ALTER TABLE "article" ADD "likes" integer`)
        await db.query(`UPDATE "article" SET "likes" = 0 WHERE "likes" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "likes" SET NOT NULL`)

        await db.query(`ALTER TABLE "article" ADD "dislikes" integer`)
        await db.query(`UPDATE "article" SET "dislikes" = 0 WHERE "dislikes" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "dislikes" SET NOT NULL`)
    }
}
