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

## How To Test

Since the Linux build version of `node-orabledb` on Travis-CI always failed 
to be run, if you want to test this package, you need to do the following 
steps manually in your computer.

### Prepare

Before testing this package, you must have an Oracle Database server installed 
in your machine, if you haven't, please visit the 
[Downloads](http://www.oracle.com/technetwork/database/enterprise-edition/downloads/index.html)
page for instructions, for a developer, the **Express Edition** is fine.

If you're not very familiar with Oracle Database, I suggest you do some 
research on it before doing the test and probably using it.

### Test

```sh
git clone https://github.com/hyurl/modelar-oracle-adapter
cd modelar-oracle-adapter
npm install
vim test/config/db.js # edit the configuration to connect your database server
npm run prepare # will create neccesary tables, once tables are created,
npm test # you can run test as many times as you want, even change node versions
```

I have tested this package in NodeJS 4, 6 and 8, but not 10, the 
`node-orabledb` hasn't had a pre-build for NodeJS 10 yet on the day I did the 
test, you may want to do the test yourself.