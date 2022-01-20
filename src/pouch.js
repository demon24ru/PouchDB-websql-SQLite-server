const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { reqCheckerUrl, request } = require('./reqCheckerUrl');

const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';

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
        this._idDevice = null;
        this.sync = null;
        this.idDBTokens = 'tokens';
        this.idDBdevice = 'device';
        this.url = 'http://192.168.6.37:5984';
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

        this.queueDB = new this.MPouchDB('queue');

        this.settingsDB = new this.MPouchDB('settings');

        this.queueRemotDB = new this.PouchDB(
            this.url + '/db/queue',
            { fetch: (url, opts) => this.fetchPouch.call(this, url, opts) }
        );

        this.init();
    }

    async init() {
        if (await this.getDeviceId()) {
            new reqCheckerUrl(this.url, () => {
                this.initReplication();
            });
        }
    }

    initReplication() {
        // do one way, one-off sync from the server until completion
        this.queueDB.replicate.from(this.queueRemotDB).on('complete', (info) => {
            // then two-way, continuous, retriable sync
            // handle complete
            console.log('PouchDB.replicate.from/complete', info);

            this.sync = this.queueDB.sync(this.queueRemotDB, {
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

    async getDeviceId() {
        if (this._idDevice)
            return this._idDevice;

        try {
            const res = await this.settingsDB.get(this.idDBdevice);
            this._idDevice = res.id;
        } catch (e) {}

        return this._idDevice;
    }

    async commissioning() {
        console.log('commissioning');
        if (!this._idDevice) {
            const res = await request(`${this.url}/commissioning`, {
                method: 'post',
                body: JSON.stringify({type: '4a3c1b63-79a8-40f3-ab5e-90837bdecee7'}),
                headers: {'Content-Type': 'application/json'}
            });

            try {
                const tokenData = await res.json();
                await this.setToken(tokenData);
                await this.settingsDB.post({_id: this.idDBdevice, id: tokenData.id});
                this._idDevice = tokenData.id;
            } catch (e) {
            }

            await this.init();
        }
    }

    async unCommissioning() {
        console.log('unCommissioning');
        if (this._idDevice) {
            if (this.sync)
                this.sync.cancel();

            try {
                await this.queueDB.destroy();
                this.queueDB = new this.MPouchDB('queue');

                await this.settingsDB.destroy();
                this.settingsDB = new this.MPouchDB('settings');

                this._idDevice = null;
                this._token = null;
            } catch (e) {}
        }
    }

    async getToken() {
        if (this._token === null) {
            try {
                const res = await this.settingsDB.get(this.idDBTokens);
                this._token = JSON.parse(decrypt(res.hash));
            } catch (e) {
                await this.unCommissioning();
            }
        }
        return this._token;
    }

    async setToken(v) {
        const doc = await this.settingsDB.get(this.idDBTokens)
            .catch(() =>
                this.settingsDB.post({_id: this.idDBTokens})
                    .then(res => ({
                        _id: this.idDBTokens,
                        _rev: res.rev
                    })));
        doc.hash = encrypt(JSON.stringify(v));
        await this.settingsDB.put(doc);
        this._token = v;
    }

    async fetchPouch(url, opts) {
        const headers = opts.headers;
        let tokens = await this.getToken();
        headers.set('Authorization', `Bearer ${tokens.token}`);
        console.log('get token %j', url, opts)
        let result = await fetch(url, opts);
        console.log('result %j', result, url);
        if (result.status === 401) {
            try {
                console.log(`get refreshToken ${this.url}/refresh`)
                const refrResult = await fetch(`${this.url}/refresh`, {
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
                headers.set('Authorization', `Bearer ${tokens.token}`);
                result = await fetch(url, opts);
            } catch (e) {
                throw new Error('Error refresh token');
            }
        }
        return result;
    }
 }

module.exports = new DB();
