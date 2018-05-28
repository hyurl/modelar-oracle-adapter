"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var modelar_1 = require("modelar");
var oracledb_1 = require("oracledb");
var assign = require("lodash/assign");
var OracleAdapter = (function (_super) {
    tslib_1.__extends(OracleAdapter, _super);
    function OracleAdapter() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.backquote = "\"";
        _this.inTransaction = false;
        return _this;
    }
    OracleAdapter.prototype.connect = function (db) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (OracleAdapter.Pools[db.dsn] === undefined) {
                var config = assign({}, db.config);
                config.poolMax = db.config.max;
                config.poolTimeout = Math.round(db.config.timeout / 1000);
                if (!db.config["connectionString"]) {
                    config.connectString = db.config["connectionString"];
                }
                else {
                    var i = db.dsn.indexOf("@"), str = db.dsn.substring(i + 1);
                    config.connectString = str;
                }
                oracledb_1.createPool(config, function (err, pool) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        OracleAdapter.Pools[db.dsn] = pool;
                        resolve(pool);
                    }
                });
            }
            else {
                resolve(OracleAdapter.Pools[db.dsn]);
            }
        }).then(function (pool) {
            return pool.getConnection();
        }).then(function (connection) {
            _this.connection = connection;
            return db;
        });
    };
    OracleAdapter.prototype.query = function (db, sql, bindings) {
        var params = {}, returnId;
        for (var i in bindings) {
            sql = sql.replace("?", ":param" + i);
            params["param" + i] = bindings[i];
        }
        if (db.command == "insert") {
            var matches = sql.match(/\sreturning\s(.+?)\sinto\s:id/i);
            if (matches) {
                params["id"] = { type: oracledb_1.NUMBER, dir: oracledb_1.BIND_OUT };
                returnId = true;
            }
            else if (db instanceof modelar_1.Model) {
                sql += " returning \"" + db.primary + "\" into :id";
                params["id"] = { type: oracledb_1.NUMBER, dir: oracledb_1.BIND_OUT };
                returnId = true;
            }
        }
        return this.connection.execute(sql, params, {
            autoCommit: !this.inTransaction
        }).then(function (res) {
            if (returnId) {
                var outBinds = res.outBinds;
                db.insertId = outBinds.id[0];
            }
            if (res.rowsAffected) {
                db.affectedRows = res.rowsAffected;
            }
            if (res.rows && res.rows.length) {
                var data = [];
                for (var _i = 0, _a = res.rows; _i < _a.length; _i++) {
                    var row = _a[_i];
                    var _data = {};
                    for (var i in res.metaData) {
                        _data[res.metaData[i].name] = row[i];
                    }
                    data.push(_data);
                }
                db.data = data;
            }
            return db;
        });
    };
    OracleAdapter.prototype.transaction = function (db, cb) {
        var _this = this;
        this.inTransaction = true;
        var promise = Promise.resolve(db);
        if (typeof cb == "function") {
            return promise.then(function (db) {
                var res = cb.call(db, db);
                if (res.then instanceof Function) {
                    return res.then(function () { return db; });
                }
                else {
                    return db;
                }
            }).then(function (db) {
                return _this.commit(db);
            }).catch(function (err) {
                return _this.rollback(db).then(function () {
                    throw err;
                });
            });
        }
        else {
            return promise;
        }
    };
    OracleAdapter.prototype.commit = function (db) {
        var _this = this;
        return this.connection.commit().then(function () {
            _this.inTransaction = false;
            return db;
        });
    };
    OracleAdapter.prototype.rollback = function (db) {
        var _this = this;
        return this.connection.rollback().then(function () {
            _this.inTransaction = false;
            return db;
        });
    };
    OracleAdapter.prototype.release = function () {
        if (this.connection) {
            this.connection.release();
            this.connection = null;
        }
    };
    OracleAdapter.prototype.close = function () {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    };
    OracleAdapter.close = function () {
        for (var i in OracleAdapter.Pools) {
            OracleAdapter.Pools[i].close();
            delete OracleAdapter.Pools[i];
        }
    };
    OracleAdapter.prototype.getDDL = function (table) {
        var numbers = ["int", "integer", "number"];
        var columns = [];
        var foreigns = [];
        var primary;
        for (var key in table.schema) {
            var field = table.schema[key];
            if (field.primary && field.autoIncrement) {
                if (numbers.indexOf(field.type.toLowerCase()) === -1) {
                    field.type = "int";
                }
                table["_primary"] = field.name;
                table["_autoIncrement"] = field.autoIncrement;
            }
            var type = field.type;
            if (field.length instanceof Array) {
                type += "(" + field.length.join(",") + ")";
            }
            else if (field.length) {
                type += "(" + field.length + ")";
            }
            var column = table.backquote(field.name) + " " + type;
            if (field.primary)
                primary = field.name;
            if (field.unique)
                column += " unique";
            if (field.unsigned)
                column += " unsigned";
            if (field.notNull)
                column += " not null";
            if (field.default === null)
                column += " default null";
            else if (field.default !== undefined)
                column += " default " + table.quote(field.default);
            if (field.comment)
                column += " comment " + table.quote(field.comment);
            if (field.foreignKey.table) {
                var foreign = "foreign key (" + table.backquote(field.name) + ")" +
                    " references " + table.backquote(field.foreignKey.table) +
                    " (" + table.backquote(field.foreignKey.field) + ")" +
                    " on delete " + field.foreignKey.onDelete;
                foreigns.push(foreign);
            }
            ;
            columns.push(column);
        }
        var sql = "create table " + table.backquote(table.name) +
            " (\n\t" + columns.join(",\n\t");
        if (primary)
            sql += ",\n\tprimary key(" + table.backquote(primary) + ")";
        if (foreigns.length)
            sql += ",\n\t" + foreigns.join(",\n\t");
        return sql += "\n)";
    };
    OracleAdapter.prototype.create = function (table) {
        var ddl = table.getDDL();
        var increment = table["_autoIncrement"];
        return table.query(ddl).then(function (table) {
            if (increment) {
                var primary = table["_primary"], seq = table.name + "_" + primary + "_seq", delSeq_1 = "begin\n" +
                    ("\texecute immediate 'drop sequence \"" + seq + "\"';\n") +
                    "exception\n" +
                    "\twhen others then\n" +
                    "\t\tif sqlcode != -0942 then\n" +
                    "\t\t\tdbms_output.put_line(sqlcode||'---'||sqlerrm);\n" +
                    "\t\tend if;\n" +
                    "end;", createSeq_1 = "create sequence \"" + seq + "\" increment by " + increment[1] + " start with " + increment[0], createTrigger_1 = "create or replace trigger \"" + table.name + "_trigger\" before insert on \"" + table.name + "\" for each row\n" +
                    "begin\n" +
                    ("\tselect \"" + seq + "\".nextval into :new.\"" + primary + "\" from dual;\n") +
                    "end;";
                return table.query(delSeq_1).then(function (table) {
                    return table.query(createSeq_1);
                }).then(function (table) {
                    return table.query(createTrigger_1);
                }).then(function (table) {
                    table.sql = ddl + ";\n" + delSeq_1 + "\n/\n" + createSeq_1 + ";\n" + createTrigger_1;
                    return table;
                });
            }
            else {
                return table;
            }
        });
    };
    OracleAdapter.prototype.random = function (query) {
        query["_orderBy"] = "dbms_random.value()";
        return query;
    };
    OracleAdapter.prototype.limit = function (query, length, offset) {
        if (!offset) {
            query["_limit"] = length;
        }
        else {
            query["_limit"] = [offset, length];
        }
        return query;
    };
    OracleAdapter.prototype.getSelectSQL = function (query) {
        var selects = query["_selects"], distinct = query["_distinct"], join = query["_join"], where = query["_where"], orderBy = query["_orderBy"], groupBy = query["_groupBy"], having = query["_having"], union = query["_union"], limit = query["_limit"], isCount = (/count\(distinct\s\S+\)/i).test(selects), paginated = limit instanceof Array;
        distinct = distinct && !isCount ? "distinct " : "";
        where = where ? " where " + where : "";
        orderBy = orderBy ? " order by " + orderBy : "";
        groupBy = groupBy ? " group by " + groupBy : "";
        having = having ? " having " + having : "";
        union = union ? " union " + union : "";
        var sql = "select " + distinct + selects + " from "
            + (!join ? query.backquote(query.table) : "")
            + join + where + orderBy + groupBy + having;
        if (limit) {
            if (paginated) {
                sql = "select * from (select tmp.*, rownum rn from (" + sql + ") tmp where rownum <= " + (limit[0] + limit[1]) + ") where rn > " + limit[0];
            }
            else {
                sql = "select * from (" + sql + ") where rownum <= " + limit;
            }
        }
        return sql + union;
    };
    OracleAdapter.Pools = {};
    return OracleAdapter;
}(modelar_1.Adapter));
exports.OracleAdapter = OracleAdapter;
//# sourceMappingURL=index.js.map