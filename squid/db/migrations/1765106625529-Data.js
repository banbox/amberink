module.exports = class Data1765106625529 {
    name = 'Data1765106625529'

    async up(db) {
        await db.query(`ALTER TABLE "article" DROP COLUMN "cover_image"`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "article" ADD "cover_image" text`)
    }
}
