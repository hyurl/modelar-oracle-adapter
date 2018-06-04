# Modelar-Oracle-Adapter

**This is an adapter for [Modelar](https://github.com/hyurl/modelar) to** 
**connect Oracle database.**

## Prerequisites

- `NodeJS` version higher than 4.0.0.

## Install

```sh
npm install modelar-oracle-adapter --save
```

## How To Use

```javascript
const { DB } = require("modelar");
const { OracleAdapter } = require("modelar-oracle-adapter");

DB.setAdapter("oracle", OracleAdapter);

// then using the type 'oracle' in db.config
DB.init({
    type: "oracle",
    database: "XE",
    host: "127.0.0.1",
    port: 1521,
    user: "SYSTEM",
    password: "******"
});
```

## A Tip

Oracle database transfers identifiers to UPPER-CASE by default, but with this 
adapter, they will keep the case of which they're defined.

Be aware, the `db.insertId` will only be available with this adapter in three
cases:

- the object is a `Model` instance
- the table has a field name `id`
- manually add `returning <column_name> to :id` at the end of SQL statements.

If you have problems with installation, please prepare you machine as 
[node-orabledb documentation](https://github.com/oracle/node-oracledb/blob/master/INSTALL.md)
says. You could try to install `node-orabledb` before installing 
`modelar-oracle-adapter`, that may guarantee a successful installation.

Although this adapter supports NodeJS 4.X, but `node-orabledb` hasn't been 
pre-compiled for all versions of NodeJS (only tested in 6.X and 8.X), if you 
have installation problems, as I suggested above, go to the documentation for 
further help.