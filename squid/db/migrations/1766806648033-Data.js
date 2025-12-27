module.exports = class Data1766806648033 {
    name = 'Data1766806648033'

    async up(db) {
        await db.query(`CREATE TABLE "transaction" ("id" character varying NOT NULL, "session_key" text NOT NULL, "target" text NOT NULL, "method" text NOT NULL, "value" numeric NOT NULL, "fee_amount" numeric NOT NULL, "block_number" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "tx_hash" text NOT NULL, "user_id" character varying, CONSTRAINT "PK_89eadb93a89810556e1cbcd6ab9" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_b4a3d92d5dde30f3ab5c34c586" ON "transaction" ("user_id") `)
        await db.query(`ALTER TABLE "transaction" ADD CONSTRAINT "FK_b4a3d92d5dde30f3ab5c34c5862" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`DROP TABLE "transaction"`)
        await db.query(`DROP INDEX "public"."IDX_b4a3d92d5dde30f3ab5c34c586"`)
        await db.query(`ALTER TABLE "transaction" DROP CONSTRAINT "FK_b4a3d92d5dde30f3ab5c34c5862"`)
    }
}
