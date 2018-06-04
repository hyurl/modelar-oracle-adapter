var DB = require("modelar").DB;
var OracleAdapter = require("../../").default;

module.exports = {
    type: "oracle",
    database: "XE",
    host: "127.0.0.1",
    port: 1521,
    user: "travis",
    password: "travis"
};

DB.setAdapter("oracle", OracleAdapter);
DB.init(module.exports);