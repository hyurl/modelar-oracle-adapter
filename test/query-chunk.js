var assert = require("assert");
var DB = require("modelar").DB;
var Query = require("modelar").Query;
var config = require("./config/db");
var co = require("co");

describe("Query.prototype.chunk()", function () {
    it("should get chunked users that suit the given condition", function (done) {
        var db = new DB(config),
            query = new Query("users").use(db),
            data = {
                name: "Ayon Lee",
                email: "i@hyurl.com",
                password: "123456",
                age: 20,
                score: 90
            },
            ids = [];

        co(function* () {
            for (var i = 0; i < 20; i++) {
                yield query.insert(data);
                ids.push(query.insertId);
            }

            var offset = 0,
                firstId = 0;

            yield query.whereIn("id", ids).orderBy("id").chunk(5, function (_data) {
                firstId = firstId || _data[0].id;

                var sql;

                if (offset) {
                    sql = 'select * from (select tmp.*, rownum "_rn" from (select * from "users" where "id" in (' + Array(20).fill("?").join(", ") + ') order by "id") tmp where rownum <= ' + (offset + 5) + ') where "_rn" > ' + offset;
                } else {
                    sql = 'select * from (select * from "users" where "id" in (' + Array(20).fill("?").join(", ") + ') order by "id") where rownum <= 5';
                }

                assert.equal(query.sql, sql);

                var expected = Array(5).fill({});

                for (var i in expected) {
                    expected[i] = Object.assign({
                        id: firstId + parseInt(i) + offset
                    }, data);
                }

                assert.deepStrictEqual(_data, expected);
                offset += 5;
            });
        }).then(function () {
            db.close();
            done();
        }).catch(function (err) {
            db.close();
            done(err);
        });
    });
});