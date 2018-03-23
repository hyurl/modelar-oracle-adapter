import { trim } from "string-trimmer";
import { Adapter, DB, Table, Query, Model } from "modelar";
import {
    createPool,
    IPoolAttributes,
    IConnectionPool,
    IConnection,
    NUMBER,
    BIND_OUT
} from "oracledb";

function getId(target: any, sql: string): string {
    let matches = sql.match(/\sreturning\s(.+?)\sinto\s:id/i),
        id: string;

    if (matches) {
        id = trim(matches[1], '"');
    } else if (target instanceof Model) {
        id = target.primary;
    }

    return id;
}

export class OracleAdapter extends Adapter {
    backquote = "\"";
    connection: IConnection;
    inTransaction: boolean = false;

    static Pools: { [dsn: string]: IConnectionPool } = {};

    connect(db: DB): Promise<DB> {
        return new Promise((resolve: (pool: IConnectionPool) => void, reject) => {
            if (OracleAdapter.Pools[db.dsn] === undefined) {
                let i = db.dsn.indexOf("@"),
                    str = db.dsn.substring(i + 1),
                    config: IPoolAttributes = <any>Object.assign({}, db.config);

                config.poolMax = db.config.max;
                config.poolTimeout = db.config.timeout / 1000;
                config.connectString = str;

                createPool(config, (err, pool) => {
                    if (err) {
                        reject(err);
                    } else {
                        OracleAdapter.Pools[db.dsn] = pool;
                        resolve(pool);
                    }
                });
            } else {
                resolve(OracleAdapter.Pools[db.dsn]);
            }
        }).then(pool => {
            return <any>pool.getConnection();
        }).then((connection: IConnection) => {
            this.connection = connection;
            return db;
        });
    }

    query(db: DB, sql: string, bindings?: any[]): Promise<DB> {
        let params: { [param: string]: any } = {},
            returnId: string;

        // Replace ? to :{n} of the SQL.
        for (let i in bindings) {
            sql = sql.replace("?", ":param" + i);
            params["param" + i] = bindings[i];
        }

        // Return the record when inserting.
        if (db.command == "insert") {
            returnId = getId(db, sql);
            if (returnId) {
                sql += ` returning "${returnId}" into :id`;
                params["id"] = { type: NUMBER, dir: BIND_OUT };
            }
        }

        return this.connection.execute(sql, params, {
            autoCommit: !this.inTransaction
        }).then(res => {
            if (returnId) {
                let outBinds = <any>res.outBinds;
                db.insertId = outBinds.id[0];
            }

            if (res.rowsAffected) {
                db.affectedRows = res.rowsAffected;
            }

            if (res.rows && res.rows.length) {
                let data = [];
                for (let row of res.rows) {
                    let _data: { [field: string]: any } = {};
                    for (let i in res.metaData) {
                        _data[res.metaData[i].name] = row[i];
                    }
                    data.push(_data)
                }
                db.data = data;
            }
            return db;
        }) as Promise<DB>;
    }

    transaction(db: DB, cb: (db: DB) => void): Promise<DB> {
        this.inTransaction = true;
        let promise = Promise.resolve(db);

        if (typeof cb == "function") {
            return promise.then(db => {
                let res = cb.call(db, db);
                if (res.then instanceof Function) {
                    return res.then(() => db) as Promise<DB>;
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

    commit(db: DB): Promise<DB> {
        return this.connection.commit().then(() => {
            this.inTransaction = false;
            return db;
        }) as Promise<DB>;
    }

    rollback(db: DB): Promise<DB> {
        return this.connection.rollback().then(() => {
            this.inTransaction = false;
            return db;
        }) as Promise<DB>;
    }

    release(): void {
        if (this.connection) {
            this.connection.release();
            this.connection = null;
        }
    }

    close(): void {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    }

    static close(): void {
        for (let i in OracleAdapter.Pools) {
            OracleAdapter.Pools[i].close();
            delete OracleAdapter.Pools[i];
        }
    }

    getDDL(table: Table) {
        const numbers = ["int", "integer", "number"];
        let columns: string[] = [];
        let foreigns: string[] = [];
        let primary: string;

        for (let key in table.schema) {
            let field = table.schema[key];

            if (field.primary && field.autoIncrement) {
                if (!numbers.includes(field.type.toLowerCase())) {
                    field.type = "int";
                }

                table["_primary"] = field.name;
                table["_autoIncrement"] = field.autoIncrement;
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

        let sql = "create table " + table.backquote(table.name) +
            " (\n\t" + columns.join(",\n\t");

        if (primary)
            sql += ",\n\tprimary key(" + table.backquote(primary) + ")";

        if (foreigns.length)
            sql += ",\n\t" + foreigns.join(",\n\t");

        return sql += "\n)";
    }

    create(table: Table) {
        let ddl = table.getDDL();
        let increment: [number, number] = table["_autoIncrement"];

        return table.query(ddl).then(table => {
            if (increment) {
                let primary: string = table["_primary"],
                    seq = `${table.name}_${primary}_seq`,
                    delSeq = "begin\n" +
                        `\texecute immediate 'drop sequence "${seq}"';\n` +
                        `exception\n` +
                        `\twhen others then\n` +
                        `\t\tif sqlcode != -0942 then\n` +
                        `\t\t\tdbms_output.put_line(sqlcode||'---'||sqlerrm);\n` +
                        `\t\tend if;\n` +
                        `end;`,
                    createSeq = `create sequence "${seq}" increment by ${increment[1]} start with ${increment[0]}`,
                    createTrigger = `create or replace trigger "${table.name}_trigger" before insert on "${table.name}" for each row\n` +
                        `begin\n` +
                        `\tselect "${seq}".nextval into :new."${primary}" from dual;\n` +
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

    random(query: Query): Query {
        query["_orderBy"] = "dbms_random.value()";
        return query;
    }

    limit(query: Query, length: number, offset?: number): Query {
        if (!offset) {
            query["_limit"] = length;
        } else {
            query["_limit"] = [offset, length];
        }
        return query;
    }

    getSelectSQL(query: Query): string {
        let selects: string = query["_selects"],
            distinct: string = query["_distinct"],
            join: string = query["_join"],
            where: string = query["_where"],
            orderBy: string = query["_orderBy"],
            groupBy: string = query["_groupBy"],
            having: string = query["_having"],
            union: string = query["_union"],
            limit: number | [number, number] = <any>query["_limit"],
            isCount = (/count\(distinct\s\S+\)/i).test(selects),
            paginated = limit instanceof Array;

        distinct = distinct && !isCount ? "distinct " : "";
        where = where ? ` where ${where}` : "";
        orderBy = orderBy ? `order by ${orderBy}` : "";
        groupBy = groupBy ? ` group by ${groupBy}` : "";
        having = having ? ` having ${having}` : "";
        union = union ? ` union ${union}` : "";

        let sql = `select ${distinct}${selects} from ` +
            (!join ? query.backquote(query.table) : "") + join + where +
            orderBy + groupBy + having;

        if (limit) {
            if (paginated) {
                sql = `select * from (select tmp.*, rownum rn from (${sql}) tmp where rownum <= ${limit[0] + limit[1]}) where rn > ${limit[0]}`;
            } else {
                sql = `select * from (${sql}) where rownum <= ${limit}`;
            }
        }

        return sql + union;
    }
}