const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';
const defaultTokens = {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmaWx0ZXIiOnsiZGV2aWNlSWQiOiJiMjZhYzY5MC1lYTkyLTQ5NTItOTM0OC02N2E2MWVlNjE1ZmQifSwicGVybWlzc2lvbiI6eyJxdWV1ZSI6eyJjaGFuZ2UiOlsiZ2V0IiwicG9zdCIsInB1dCIsImRlbGV0ZSJdfX0sImlhdCI6MTY0MDY3Mzg5OSwiZXhwIjoxNjQzMjY1ODk5fQ.aZwUakKYxQYw6QDwHG9krVnUa371PHCnZdqIfjvGiTI',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmaWx0ZXIiOnsiZGV2aWNlSWQiOiJiMjZhYzY5MC1lYTkyLTQ5NTItOTM0OC02N2E2MWVlNjE1ZmQifSwicGVybWlzc2lvbiI6eyJxdWV1ZSI6eyJjaGFuZ2UiOlsiZ2V0IiwicG9zdCIsInB1dCIsImRlbGV0ZSJdfX0sImlhdCI6MTY0MDY3Mzg5OSwiZXhwIjoxOTU2MDMzODk5fQ.5Uhve7Ic3_In3HRoBHEm6RjwYHrHJDx5WCgqswI-7sQ'
};

const encrypt = (text) => {

    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

const decrypt = (hash) => {

    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, 'hex'));

    const decrpyted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);

    return decrpyted.toString();
};

class DB {
    constructor() {
        this._token = null;
        this.idDBTokens = 'tokens';
        this.PouchDB = require('pouchdb-core')
            .plugin(require('pouchdb-adapter-http'))
            .plugin(require('pouchdb-replication'))
            .plugin(require('pouchdb-mapreduce'))
            .plugin(require('pouchdb-find'))
            .plugin(require('pouchdb-adapter-sqlite-node'));

        this.MPouchDB = this.PouchDB.defaults({
            adapter: 'webSQL',
            auto_compaction: true,
            revs_limit: 3,
            prefix: 'pouch_'
        })

        this.replDB = new this.MPouchDB('queue');

        this.settings = new this.MPouchDB('settings');

        const url = new this.PouchDB('http://192.168.6.37:5984/db/queue',
            {
                fetch: (url, opts) => this.fetchPouch.call(this, url, opts)
            });

        // do one way, one-off sync from the server until completion
        this.replDB.replicate.from(url).on('complete', (info) => {
            // then two-way, continuous, retriable sync
            // handle complete
            console.log('PouchDB.replicate.from/complete', info);

            this.replDB.sync(url, {
                live: true,
                retry: true,
                back_off_function: function (delay) {
                    if (!delay) {
                        return 500 + Math.floor(Math.random() * 2000);
                    } else if (delay >= 90000) {
                        return 90000;
                    }
                    return delay * 3;
                }
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
    }

    async getToken() {
        if (this._token === null) {
            const res = await this.settings.get(this.idDBTokens)
                .catch(e =>this.setToken(defaultTokens)
                    .then(() => this.settings.get(this.idDBTokens)));
            this._token = JSON.parse(decrypt(res.hash));
        }
        return this._token;
    }

    async setToken(v) {
        const doc = await this.settings.get(this.idDBTokens)
            .catch(()=>this.settings.post({_id: this.idDBTokens})
                .then(res=>({
                    _id: this.idDBTokens,
                    _rev: res.rev
                })));
        doc.hash = encrypt(JSON.stringify(v));
        await this.settings.put(doc);
        this._token = v;
    }

    async fetchPouch(url, opts) {
        const headers = opts.headers;
        let tokens = await this.getToken();
        headers.set('Authorization', 'Bearer ' + tokens.token);
        console.log('get token %j', url, opts)
        let result = await fetch(url, opts);
        console.log('result %j', result, url);
        if (result.status === 401) {
            try {
                console.log('get refreshToken http://192.168.6.37:5984/refresh')
                const refrResult = await fetch('http://192.168.6.37:5984/refresh', {
                    method: 'post',
                    body: JSON.stringify({token: tokens.refreshToken}),
                    headers: {'Content-Type': 'application/json'}
                });
                console.log('refreshToken result %j', refrResult);
                if (!refrResult.ok) {
                    throw new Error();
                }
                tokens = await refrResult.json();
                await this.setToken(tokens);
                headers.set('Authorization', 'Bearer ' + tokens.token);
                result = await fetch(url, opts);
            } catch (e) {
                throw new Error('Error refresh token');
            }
        }
        return result;
    }
 }

module.exports = new DB();
