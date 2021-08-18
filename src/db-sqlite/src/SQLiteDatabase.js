const sqlite3 = require('sqlite3');
const SQLiteResult = require('./SQLiteResult');

const READ_ONLY_ERROR = new Error(
    'could not prepare statement (23 not authorized)');

function SQLiteDatabase(name) {
    this._db = new sqlite3.Database(name);
}

function runSelect(db, sql, args, cb) {
    db.all(sql, args, function (err, rows) {
        if (err) {
            return cb(new SQLiteResult(err));
        }
        const insertId = void 0;
        const rowsAffected = 0;
        const resultSet = new SQLiteResult(null, insertId, rowsAffected, rows);
        cb(resultSet);
    });
}

function runNonSelect(db, sql, args, cb) {
    db.run(sql, args, function (err) {
        if (err) {
            return cb(new SQLiteResult(err));
        }
        /* jshint validthis:true */
        const executionResult = this;
        const insertId = executionResult.lastID;
        const rowsAffected = executionResult.changes;
        const rows = [];
        const resultSet = new SQLiteResult(null, insertId, rowsAffected, rows);
        cb(resultSet);
    });
}

SQLiteDatabase.prototype.exec = function exec(queries, readOnly, callback) {

    const db = this._db;
    const len = queries.length;
    const results = new Array(len);

    let i = 0;

    function checkDone() {
        if (++i === len) {
            callback(null, results);
        } else {
            doNext();
        }
    }

    function onQueryComplete(i) {
        return function (res) {
            results[i] = res;
            checkDone();
        };
    }

    function doNext() {
        const query = queries[i];
        const sql = query.sql;
        const args = query.args;

        // TODO: It seems like the node-sqlite3 API either allows:
        // 1) all(), which returns results but not rowsAffected or lastID
        // 2) run(), which doesn't return results, but returns rowsAffected and lastID
        // So we try to sniff whether it's a SELECT query or not.
        // This is inherently error-prone, although it will probably work in the 99% case.

        const isSelect = /^\s*SELECT\b/i.test(sql);

        if (readOnly && !isSelect) {
            onQueryComplete(i)(new SQLiteResult(READ_ONLY_ERROR));
        } else if (isSelect) {
            runSelect(db, sql, args, onQueryComplete(i));
        } else {
            runNonSelect(db, sql, args, onQueryComplete(i));
        }
    }

    doNext();
};

module.exports = SQLiteDatabase;
