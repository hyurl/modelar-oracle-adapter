var assert = require("assert");
var Query = require("modelar").Query;

describe("Query.prototype.limit()", function () {
    describe("limit(length: number)", function () {
        it("should generate SQL with a limit clause", function () {
            var query = new Query().select("*").from("users").limit(10);
            assert.equal(query.getSelectSQL(), 'select * from (select * from "users") where rownum <= 10');
        });
    });

    describe("limit(length: number, offset: number)", function () {
        it("should generate SQL with a limit clause along with an offset", function () {
            var query = new Query().select("*").from("users").limit(10, 31);
            assert.equal(query.getSelectSQL(), 'select * from (select tmp.*, rownum "_rn" from (select * from "users") tmp where rownum <= 41) where "_rn" > 31');
        });
    });
})