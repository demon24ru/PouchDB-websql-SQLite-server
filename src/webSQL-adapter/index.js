const WebSqlPouchCore = require('pouchdb-adapter-websql-core');
let sqlDB = null

function createOpenDBFunction (opts) {
    return function (name, version, description, size) {
        // The SQLite Plugin started deviating pretty heavily from the
        // standard openDatabase() function, as they started adding more features.
        // It's better to just use their "new" format and pass in a big ol'
        // options object. Also there are many options here that may come from
        // the PouchDB constructor, so we have to grab those.
        const isRemoteDB = /^\s*http\b/i.test(name);
        name = (name || 'test') + (!isRemoteDB ? '.db': '');

        const openOpts = Object.assign({}, opts, {
            name: name,
            version: version,
            description: description,
            size: size
        })
        function onError (err) {
            console.error(err)
            if (typeof opts.onError === 'function') {
                opts.onError(err)
            }
        }
        console.log('Open SQLite %j', openOpts.name);
        return sqlDB.openDatabase(openOpts.name, openOpts.version, openOpts.description, openOpts.size, null, onError)
    }
}

function webSQLPouch (opts, callback) {
    const websql = createOpenDBFunction(opts)
    const _opts = Object.assign({
        websql: websql
    }, opts)

    WebSqlPouchCore.call(this, _opts, callback)
}

webSQLPouch.valid = function () {
    // if you're using ReactNative, we assume you know what you're doing because you control the environment
    return true
}

// no need for a prefix in ReactNative (i.e. no need for `_pouch_` prefix
webSQLPouch.use_prefix = false

function webSQLPlugin (PouchDB) {
    PouchDB.adapter('webSQL', webSQLPouch, true)
}

function createPlugin (db) {
    sqlDB = db
    return webSQLPlugin
}

module.exports = createPlugin
