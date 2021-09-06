const crypto = require('crypto');
const fetch = require('node-fetch');

const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';
const defaultTokens = {
    access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImRmZ2RmZ2RmZy1kZmdkZmdkZmctZGZnLWdmZ2ZnZi1mZGdkIiwiaWF0IjoxNjMwNzU3OTE2LCJleHAiOjE2MzA4NDM5MTZ9.PoO-1Hrnri185ZYDxmPMVF2aHU3k6tcJwV9vezuhQTM11',
    refresh: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImRmZ2RmZ2RmZy1kZmdkZmdkZmctZGZnLWdmZ2ZnZi1mZGdkIiwiaWF0IjoxNjMwNzU3OTE2fQ.iPD1hmiyHSNysUanbkBhMeEFQOA35r5SaWpw8ONLc4E'
};
const iv = crypto.randomBytes(16);

const encrypt = (text) => {

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

        const url = new this.PouchDB('http://127.0.0.1:3001/db/companyCards',
            {
                fetch: async (url, opts) => {
                    const headers = opts.headers;
                    let tokens = await this.getToken();
                    headers.set('Authorization', 'Bearer ' + tokens.access);
                    console.log('get token %j', url, opts)
                    let result = await this.PouchDB.fetch(url, opts);
                    console.log('result %j', result);
                    if (result.status === 401) {
                        try {
                            console.log('get refreshToken http://127.0.0.1:3001/refresh')
                            const refrResult = await fetch('http://127.0.0.1:3001/refresh', {
                                method: 'post',
                                body: JSON.stringify({token: tokens.refresh}),
                                headers: {'Content-Type': 'application/json'}
                            });
                            console.log('refreshToken result %j', refrResult);
                            if (!refrResult.ok) {
                                throw new Error();
                            }
                            tokens = await refrResult.json();
                            await this.setToken(tokens);
                            headers.set('Authorization', 'Bearer ' + tokens.access);
                            result = await this.PouchDB.fetch(url, opts);
                        } catch (e) {
                            throw new Error('Error refresh token');
                        }
                    }
                    return result;
                }
            });

        // do one way, one-off sync from the server until completion
        this.replDB.replicate.from(url).on('complete', (info) => {
            // then two-way, continuous, retriable sync
            // handle complete
            console.log('PouchDB.replicate.from/complete', info);
            this.replDB.sync(url, {
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
 }

module.exports = new DB();
