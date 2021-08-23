
const PouchDB = require('pouchdb-core')
    .plugin(require('pouchdb-authentication'))
    .plugin(require('pouchdb-adapter-http'))
    .plugin(require('pouchdb-replication'))
    .plugin(require('pouchdb-mapreduce'))
    .plugin(require('pouchdb-find'))
    .plugin(require('pouchdb-adapter-sqlite-node'));

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
