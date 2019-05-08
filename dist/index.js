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
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var params, returnId, shouldRetry, i, originSql, returnRe, matches, res, options, err_1, outBinds, data, _i, _a, row, _data, i;
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        params = {}, returnId = false, shouldRetry = false;
                        for (i in bindings) {
                            sql = sql.replace("?", ":param" + i);
                            params["param" + i] = bindings[i];
                        }
                        originSql = sql;
                        if (db.command == "insert") {
                            returnRe = /\sreturning\s(.+?)\sinto\s:id/i, matches = void 0;
                            if (returnRe.test(sql)) {
                                params["id"] = { type: oracledb_1.NUMBER, dir: oracledb_1.BIND_OUT };
                                returnId = true;
                            }
                            else if (db instanceof modelar_1.Model) {
                                sql += " returning \"" + db.primary + "\" into :id";
                                params["id"] = { type: oracledb_1.NUMBER, dir: oracledb_1.BIND_OUT };
                                returnId = true;
                            }
                            else {
                                sql += " returning \"id\" into :id";
                                params["id"] = { type: oracledb_1.NUMBER, dir: oracledb_1.BIND_OUT };
                                returnId = true;
                                shouldRetry = true;
                            }
                        }
                        options = { autoCommit: !this.inTransaction };
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 7]);
                        return [4, this.connection.execute(sql, params, options)];
                    case 2:
                        res = _b.sent();
                        return [3, 7];
                    case 3:
                        err_1 = _b.sent();
                        if (!shouldRetry) return [3, 5];
                        delete params["id"];
                        returnId = false;
                        return [4, this.connection.execute(originSql, params, options)];
                    case 4:
                        res = _b.sent();
                        return [3, 6];
                    case 5: throw err_1;
                    case 6: return [3, 7];
                    case 7:
                        if (returnId) {
                            outBinds = res.outBinds;
                            db.insertId = outBinds["id"][0];
                        }
                        db.affectedRows = res.rowsAffected || 0;
                        if (res.rows && res.rows.length || db.command == "select") {
                            data = [];
                            for (_i = 0, _a = res.rows; _i < _a.length; _i++) {
                                row = _a[_i];
                                _data = {};
                                for (i in res.metaData) {
                                    _data[res.metaData[i].name] = row[i];
                                }
                                delete _data["_rn"];
                                data.push(_data);
                            }
                            db.data = data;
                        }
                        return [2, db];
                }
            });
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
            if (field.foreignKey && field.foreignKey.table) {
                var foreign = "constraint " + table.backquote(field.name + "_frk")
                    + " foreign key (" + table.backquote(field.name) + ")"
                    + " references " + table.backquote(field.foreignKey.table)
                    + " (" + table.backquote(field.foreignKey.field) + ")"
                    + " on delete " + field.foreignKey.onDelete;
                foreigns.push(foreign);
            }
            ;
            columns.push(column);
        }
        var sql = "create table " + table.backquote(table.name) +
            " (\n  " + columns.join(",\n  ");
        if (primary)
            sql += ",\n  primary key (" + table.backquote(primary) + ")";
        if (foreigns.length)
            sql += ",\n  " + foreigns.join(",\n  ");
        return sql += "\n)";
    };
    OracleAdapter.prototype.create = function (table) {
        var ddl = table.getDDL();
        var increment = table["_autoIncrement"];
        return table.query(ddl).then(function (table) {
            if (increment) {
                var primary = table["_primary"], seq = table.name + "_" + primary + "_seq", delSeq_1 = [
                    'begin',
                    "  execute immediate 'drop sequence \"" + seq + "\"';",
                    'exception',
                    '  when others then',
                    '    if sqlcode != -0942 then',
                    "      dbms_output.put_line(sqlcode||'---'||sqlerrm);",
                    '    end if;',
                    'end;'
                ].join("\n"), createSeq_1 = "create sequence \"" + seq + "\" increment by " + increment[1] + " start with " + increment[0], createTrigger_1 = [
                    "create or replace trigger \"" + table.name + "_trigger\" before insert on \"" + table.name + "\" for each row",
                    'begin',
                    "  select \"" + seq + "\".nextval into :new.\"" + primary + "\" from dual;",
                    'end;'
                ].join("\n");
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
        }).catch(function (err) {
            console.log(table);
            throw err;
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
            + join + where + groupBy + having + union + orderBy;
        if (limit) {
            if (paginated) {
                sql = "select * from (select tmp.*, rownum \"_rn\" from (" + sql + ") tmp where rownum <= " + (limit[0] + limit[1]) + ") where \"_rn\" > " + limit[0];
            }
            else {
                sql = "select * from (" + sql + ") where rownum <= " + limit;
            }
        }
        return sql;
    };
    OracleAdapter.Pools = {};
    return OracleAdapter;
}(modelar_1.Adapter));
exports.OracleAdapter = OracleAdapter;
exports.default = OracleAdapter;
//# sourceMappingURL=index.js.map