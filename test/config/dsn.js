var URL = require("url6").default;
var db = require("./db");

var url = new URL();
url.protocol = db.type + ":";
url.username = db.user;
url.password = db.password;
url.hostname = db.host;
url.port = db.port;
url.pathname = "/" + db.database;

module.exports = url.toString();