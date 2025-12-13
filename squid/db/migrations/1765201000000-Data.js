module.exports = class Data1765201000000 {
    name = 'Data1765201000000'

    async up(db) {
        await db.query(`ALTER TABLE "article" DROP COLUMN "likes"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "dislikes"`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "article" ADD "likes" integer`)
        await db.query(`UPDATE "article" SET "likes" = 0 WHERE "likes" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "likes" SET NOT NULL`)

        await db.query(`ALTER TABLE "article" ADD "dislikes" integer`)
        await db.query(`UPDATE "article" SET "dislikes" = 0 WHERE "dislikes" IS NULL`)
        await db.query(`ALTER TABLE "article" ALTER COLUMN "dislikes" SET NOT NULL`)
    }
}
