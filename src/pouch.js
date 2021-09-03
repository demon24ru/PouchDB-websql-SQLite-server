const crypto = require('crypto');

const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';
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

module.exports = class DB {
    constructor() {
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

        const url = new this.PouchDB('http://127.0.0.1:3001/companyCards',
            {
                fetch: async (url, opts) => {
                    const headers = opts.headers;
                    let tokens = await this.getTokens();
                    headers.set('Authorization', 'Bearer ' + tokens.accessToken);
                    let result = await this.PouchDB.fetch(url, opts);
                    if (result.status === 401) {
                        try {
                            const refrResult = await this.PouchDB.fetch('http://127.0.0.1:3001/refresh', {
                                method: 'post',
                                body: JSON.stringify({token: tokens.refreshToken}),
                                headers: {'Content-Type': 'application/json'}
                            });
                            tokens = await refrResult.json();
                            await this.setTokens(tokens);
                            headers.set('Authorization', 'Bearer ' + tokens.accessToken);
                            result = await this.PouchDB.fetch(url, opts);
                        } catch (e) {
                            throw new Error('Error refresh token');
                        }
                    }
                    return result;
                }
            });

        // do one way, one-off sync from the server until completion
        this.replDB.replicate.from(url).on('complete', function(info) {
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

    async getTokens() {
        const res = await this.settings.get('tokens')
            .catch(async e=>await this.setTokens({
                    accessToken: 'sdfsdfsdfsdfsdfsdf',
                    refreshToken: 'sdfsdfsdfsdfsdfsdfs'
                }).then(()=>this.settings.get('tokens')));
        return JSON.parse(decrypt(res.hash));
    }

    async setTokens(tokens) {
        const doc = await this.settings.get('tokens')
            .catch(async ()=>{
                const res = await this.settings.post({_id: 'tokens'});
                return { _id: res.id, _rev: res.rev }
            });
        doc.hash = encrypt(JSON.stringify(tokens));
        await this.settings.put(doc);
    }
 }
