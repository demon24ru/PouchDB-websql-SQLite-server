const SQLDB = require('./db-sqlite');
const SQLDBAdapterFactory = require('./webSQL-adapter');
const SQLiteAdapter = SQLDBAdapterFactory(SQLDB);
const PouchDB = require('pouchdb');

PouchDB.plugin(SQLiteAdapter);
const MPouchDB = PouchDB.defaults({
    adapter: 'webSQL',
    prefix: 'pouch_'
})
const express = require('express');
const app = express();

app.use(require('express-pouchdb')(MPouchDB));

app.listen(3000, ()=>{
    console.log('Listen on port 3000');
})
