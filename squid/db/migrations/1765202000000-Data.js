module.exports = class Data1765202000000 {
    name = 'Data1765202000000'

    async up(db) {
        await db.query(`ALTER TABLE "article" ADD "true_author" text`)

        await db.query(`ALTER TABLE "article" ADD "collect_price" numeric`)
        await db.query(`UPDATE "article" SET "collect_price" = 0 WHERE "collect_price" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "collect_price" SET NOT NULL`)

        await db.query(`ALTER TABLE "article" ADD "max_collect_supply" numeric`)
        await db.query(`UPDATE "article" SET "max_collect_supply" = 0 WHERE "max_collect_supply" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "max_collect_supply" SET NOT NULL`)

        await db.query(`ALTER TABLE "article" ADD "collect_count" numeric`)
        await db.query(`UPDATE "article" SET "collect_count" = 1 WHERE "collect_count" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "collect_count" SET NOT NULL`)

        await db.query(`ALTER TABLE "article" ADD "originality" integer`)
        await db.query(`UPDATE "article" SET "originality" = 0 WHERE "originality" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "originality" SET NOT NULL`)

        await db.query(`ALTER TABLE "collection" ADD "tx_hash" text`)
        await db.query(`UPDATE "collection" SET "tx_hash" = '' WHERE "tx_hash" IS NULL`)
        await db.query(`ALTER TABLE "collection" ALTER COLUMN "tx_hash" SET NOT NULL`)

        await db.query(`ALTER TABLE "comment" ADD "comment_id" numeric`)
        await db.query(`WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY article_id ORDER BY created_at, id) AS rn FROM "comment") UPDATE "comment" c SET "comment_id" = ranked.rn FROM ranked WHERE c.id = ranked.id`)
        await db.query(`UPDATE "comment" SET "comment_id" = 0 WHERE "comment_id" IS NULL`)
        await db.query(`ALTER TABLE "comment" ALTER COLUMN "comment_id" SET NOT NULL`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "article" DROP COLUMN "true_author"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "collect_price"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "max_collect_supply"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "collect_count"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "originality"`)

        await db.query(`ALTER TABLE "collection" DROP COLUMN "tx_hash"`)

        await db.query(`ALTER TABLE "comment" DROP COLUMN "comment_id"`)
    }
}
