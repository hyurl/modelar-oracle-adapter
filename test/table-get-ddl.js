var assert = require("assert");
var Table = require("modelar").Table;

describe("Table.prototype.getDDL()", function () {
    it("should generate DDL as expected", function () {
        var table = new Table("articles");

        table.addColumn("id").primary().autoIncrement();
        table.addColumn("title", "varchar", 255).unique().notNull();
        table.addColumn("content", "varchar", 1024);
        table.addColumn("user_id", "int").default(null).foreignKey("users", "id");

        assert.equal(table.getDDL(), [
            'create table "articles" (',
            '  "id" int,',
            '  "title" varchar(255) unique not null,',
            '  "content" varchar(1024),',
            '  "user_id" int default null,',
            '  primary key ("id"),',
            '  constraint "user_id_frk" foreign key ("user_id") references "users" ("id") on delete set null',
            ')'
        ].join("\n"));
    });
});