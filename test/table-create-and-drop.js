var assert = require("assert");
var DB = require("modelar").DB;
var Table = require("modelar").Table;
var config = require("./config/db");

describe("Table.prototype.create() and Table.prototype.drop()", function () {
    it("should create a new table and drop it as expected", function (done) {
        var db = new DB(config),
            table = new Table("articles").use(db);

        table.addColumn("id").primary().autoIncrement(100);
        table.addColumn("title", "varchar", 255).unique().notNull();
        table.addColumn("content", "varchar", 1024);

        table.create().then(function () {
            assert.equal(table.sql, [
                'create table "articles" (',
                '  "id" int,',
                '  "title" varchar(255) unique not null,',
                '  "content" varchar(1024),',
                '  primary key ("id")',
                ');',
                'begin',
                '  execute immediate \'drop sequence "articles_id_seq"\';',
                'exception',
                '  when others then',
                '    if sqlcode != -0942 then',
                '      dbms_output.put_line(sqlcode||\'---\'||sqlerrm);',
                '    end if;',
                'end;',
                '/',
                'create sequence "articles_id_seq" increment by 1 start with 100;',
                'create or replace trigger "articles_trigger" before insert on "articles" for each row',
                'begin',
                '  select "articles_id_seq".nextval into :new."id" from dual;',
                'end;'
            ].join("\n"));
        }).then(function () {
            return table.drop();
        }).then(function () {
            assert.equal(table.sql, "drop table \"articles\"");
            db.close();
            done();
        }).catch(function (err) {
            db.close();
            done(err);
        });
    });
});