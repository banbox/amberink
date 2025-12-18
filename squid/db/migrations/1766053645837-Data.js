module.exports = class Data1766053645837 {
    name = 'Data1766053645837'

    async up(db) {
        await db.query(`ALTER TABLE "article" ADD "summary" text`)
        await db.query(`ALTER TABLE "article" ADD "keywords" text`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "article" DROP COLUMN "summary"`)
        await db.query(`ALTER TABLE "article" DROP COLUMN "keywords"`)
    }
}
