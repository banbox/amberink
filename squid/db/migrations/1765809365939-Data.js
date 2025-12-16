module.exports = class Data1765809365939 {
    name = 'Data1765809365939'

    async up(db) {
        await db.query(`ALTER TABLE "user" ADD "nickname" text`)
        await db.query(`ALTER TABLE "user" ADD "avatar" text`)
        await db.query(`ALTER TABLE "user" ADD "bio" text`)
        await db.query(`ALTER TABLE "user" ADD "profile_updated_at" TIMESTAMP WITH TIME ZONE`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "user" DROP COLUMN "nickname"`)
        await db.query(`ALTER TABLE "user" DROP COLUMN "avatar"`)
        await db.query(`ALTER TABLE "user" DROP COLUMN "bio"`)
        await db.query(`ALTER TABLE "user" DROP COLUMN "profile_updated_at"`)
    }
}
