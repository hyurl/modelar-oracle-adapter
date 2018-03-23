const oracledb = require("oracledb");
const { Adapter, Model } = require("modelar");
const { trim } = require("string-trimmer");
const Pools = {};

function getId(target, sql) {
    let matches = sql.match(/\sreturning\s(.+?)\sinto\s:id/i), id;
    if (matches) {
        id = trim(matches[1], '"');
    } else if (target instanceof Model) {
        id = target._primary;
    }
    return id;
}

class OracleAdapter extends Adapter {
    constructor() {
        super();
        this.inTransaction = false;
        this.backquote = "\"";
    }

    /** Methods for DB */

    connect(db) {
        return new Promise((resolve, reject) => {
            if (Pools[db._dsn] === undefined) {
                var config = Object.assign({}, db._config),
                    i = db._dsn.indexOf("@"),
                    str = db._dsn.substring(i + 1);
                config.poolMax = config.max;
                config.poolTimeout = config.timeout / 1000;
                config.queueTimeout = config.timeout / 1000;
                config.connectString = str;
                oracledb.createPool(config, (err, pool) => {
                    if (err) {
                        reject(err);
                    } else {
                        Pools[db._dsn] = pool;
                        resolve(pool);
                    }
                });
            } else {
                resolve(Pools[db._dsn]);
            }
        }).then(pool => {
            return pool.getConnection();
        }).then(connection => {
            this.connection = connection;
            return db;
        });
    }

    query(db, sql, bindings) {
        let params = {}, returnId;

        // Replace ? to :{n} of the SQL.
        for (let i in bindings) {
            sql = sql.replace("?", ":param" + i);
            params["param" + i] = bindings[i];
        }
        // Return the record when inserting.
        if (db._command == "insert") {
            returnId = getId(db, sql);
            if (returnId) {
                sql += ` returning "${returnId}" into :id`;
                params["id"] = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
            }
        }

        return this.connection.execute(sql, params, {
            autoCommit: !this.inTransaction
        }).then(res => {
            if (returnId) {
                db.insertId = res.outBinds.id[0];
            }
            if (res.rowsAffected) {
                db.affectedRows = res.rowsAffected;
            }
            if (res.rows && res.rows.length) {
                db._data = [];
                for (let row of res.rows) {
                    let data = {};
                    for (let i in res.metaData) {
                        data[res.metaData[i].name] = row[i];
                    }
                    db._data.push(data)
                }
            }
            return db;
        });
    }

    transaction(db, callback = null) {
        this.inTransaction = true;
        let promise = Promise.resolve(db);

        if (typeof callback == "function") {
            return promise.then(db => {
                let res = callback.call(db, db);
                if (res.then instanceof Function) {
                    return res.then(() => db);
                } else {
                    return db;
                }
            }).then(db => {
                return this.commit(db);
            }).catch(err => {
                return this.rollback(db).then(() => {
                    throw err;
                });
            });
        } else {
            return promise;
        }
    }

    commit(db) {
        return this.connection.commit().then(() => {
            this.inTransaction = false;
            return db;
        });
    }

    rollback(db) {
        return this.connection.rollback().then(() => {
            this.inTransaction = false;
            return db;
        });
    }

    release() {
        if (this.connection) {
            this.connection.release();
            this.connection = null;
        }
    }

    close() {
        if (this.connection)
            this.connection.close();
    }

    static close() {
        for (let i in Pools) {
            Pools[i].close();
            delete Pools[i];
        }
    }

    /** Methods for Table */

    getDDL(table) {
        var numbers = ["int", "integer", "number"],
            columns = [],
            foreigns = [],
            primary,
            autoIncrement,
            sql;

        for (let field of table._fields) {
            if (field.primary && field.autoIncrement) {
                if (!numbers.includes(field.type.toLowerCase())) {
                    field.type = "int";
                }
                table._primary = field.name;
                table._autoIncrement = field.autoIncrement;
            }
            if (field.length instanceof Array) {
                field.type += "(" + field.length.join(",") + ")";
            } else if (field.length) {
                field.type += "(" + field.length + ")";
            }

            let column = table.backquote(field.name) + " " + field.type;

            if (field.primary)
                primary = field.name;
            if (field.default === null)
                column += " default null";
            else if (field.default !== undefined)
                column += " default " + table.quote(field.default);
            if (field.notNull)
                column += " not null";
            if (field.unsigned)
                column += " unsigned";
            if (field.unique)
                column += " unique";
            if (field.comment)
                column += " comment " + table.quote(field.comment);
            if (field.foreignKey.table) {
                let foreign = `foreign key (${table.backquote(field.name)})` +
                    " references " + table.backquote(field.foreignKey.table) +
                    " (" + table.backquote(field.foreignKey.field) + ")" +
                    " on delete " + field.foreignKey.onDelete;
                foreigns.push(foreign);
            };
            columns.push(column);
        }

        sql = "create table " + table.backquote(table._table) +
            " (\n\t" + columns.join(",\n\t");

        if (primary)
            sql += ",\n\tprimary key(" + table.backquote(primary) + ")";

        if (foreigns.length)
            sql += ",\n\t" + foreigns.join(",\n\t");

        return sql += "\n)";
    }

    create(table) {
        var ddl = table.getDDL();
        return table.query(ddl).then(table => {
            if (table._autoIncrement) {
                var delSeq = "begin\n" +
                    `\texecute immediate 'drop sequence "${table._table}_${table._primary}_seq"';\n` +
                    `exception\n` +
                    `\twhen others then\n` +
                    `\t\tif sqlcode != -0942 then\n` +
                    `\t\t\tdbms_output.put_line(sqlcode||'---'||sqlerrm);\n` +
                    `\t\tend if;\n` +
                    `end;`,
                    createSeq = `create sequence "${table._table}_${table._primary}_seq" increment by ${table._autoIncrement[1]} start with ${table._autoIncrement[0]}`,
                    createTrigger = `create or replace trigger "${table._table}_trigger" before insert on "${table._table}" for each row\n` +
                        `begin\n` +
                        `\tselect "${table._table}_${table._primary}_seq".nextval into :new."${table._primary}" from dual;\n` +
                        `end;`;
                return table.query(delSeq).then(table => {
                    return table.query(createSeq);
                }).then(table => {
                    return table.query(createTrigger);
                }).then(table => {
                    table.sql = `${ddl};\n${delSeq}\n/\n${createSeq};\n${createTrigger}`;
                    return table;
                });
            } else {
                return table;
            }
        });
    }

    /** Methods for Query */

    random(query) {
        query._orderBy = "dbms_random.value()";
        return query;
    }

    limit(query, length, offset = 0) {
        if (offset === 0) {
            query._limit = length;
        } else {
            query._limit = [offset, length];
        }
        return query;
    }

    getSelectSQL(query) {
        var isCount = (/count\(distinct\s\S+\)/i).test(query._selects),
            paginated = query._limit instanceof Array,
            sql = "select " +
                (query._distinct && !isCount ? "distinct " : "") +
                query._selects + " from " +
                (!query._join ? query.backquote(query._table) : "") +
                query._join +
                (query._where ? " where " + query._where : "") +
                (query._orderBy ? " order by " + query._orderBy : "") +
                (query._groupBy ? " group by " + query._groupBy : "") +
                (query._having ? "having " + query._having : "");

        if (query._limit) {
            if (paginated) {
                sql = `select * from (select tmp.*, rownum rn from (${sql}) tmp where rownum <= ${query._limit[1] + query._limit[0]}) where rn > ${query._limit[0]}`;
            } else {
                sql = `select * from (${sql}) where rownum <= ${query._limit}`;
            }
        }

        return sql += (query._union ? " union " + query._union : "");
    }
}
OracleAdapter.OracleAdapter = OracleAdapter;

module.exports = OracleAdapter;