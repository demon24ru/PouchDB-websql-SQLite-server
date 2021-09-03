
const PouchDB = require('pouchdb-core')
    .plugin(require('pouchdb-adapter-http'))
    .plugin(require('pouchdb-replication'))
    .plugin(require('pouchdb-mapreduce'))
    .plugin(require('pouchdb-find'))
    .plugin(require('pouchdb-adapter-sqlite-node'));

const MPouchDB = PouchDB.defaults({
    adapter: 'webSQL',
    auto_compaction: true,
    revs_limit: 3,
    prefix: 'pouch_'
})

const replDB = new MPouchDB('queue');

const url = new PouchDB('http://127.0.0.1:3001/companyCards',
    {
        fetch: (url, opts) => {
            const headers = opts.headers;
            headers.set('Authorization', 'Bearer ' + 'sdfsdfsdfsdfsdfsdfsdfsdfsdfsdfsdfsdfsfd');
            return PouchDB.fetch(url, opts);
        }
    });

// do one way, one-off sync from the server until completion
replDB.replicate.from(url).on('complete', function(info) {
    // then two-way, continuous, retriable sync
    // handle complete
    console.log('PouchDB.replicate.from/complete', info);
        replDB.sync(url, {
            live: true,
            retry: true,
        }).on('change', function (info) {
            // handle change
            console.log('PouchDB.sync/change', JSON.stringify(info, null,2));
        }).on('error', function (err) {
            // handle error
            console.log('PouchDB.sync/error', err);
        });

}).on('error', function (err) {
    // handle error
    console.log('PouchDB.replicate.from/error', err);
});

const settings = new MPouchDB('settings');

const express = require('express');
const app = express();

app.use(require('express-pouchdb')(MPouchDB));

app.listen(3000, ()=>{
    console.log('Listen on port 3000');
})
