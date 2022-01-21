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

    #token;
    #idDevice;
    sync;
    #idDBTokens;
    #idDBdevice;
    #url;
    #queueDBName;
    #settingsDBName;
    #PouchDB;
    MPouchDB
    queueDB;
    settingsDB;
    #queueRemotDB;
    fn;
    debug;

    constructor() {
        this.#idDBTokens = 'tokens';
        this.#idDBdevice = 'device';
        this.#url = 'http://192.168.6.37:5984';
        this.#queueDBName = 'queue';
        this.#settingsDBName = 'settings';
        this.#PouchDB = require('pouchdb-core')
            .plugin(require('pouchdb-adapter-http'))
            .plugin(require('pouchdb-replication'))
            .plugin(require('pouchdb-mapreduce'))
            .plugin(require('pouchdb-find'))
            .plugin(require('pouchdb-adapter-sqlite-node'));

        this.MPouchDB = this.#PouchDB.defaults({
            adapter: 'webSQL',
            auto_compaction: true,
            revs_limit: 3,
            prefix: 'pouch_'
        })

        this.queueDB = new this.MPouchDB(this.#queueDBName);

        this.settingsDB = new this.MPouchDB(this.#settingsDBName);

        this.#queueRemotDB = new this.#PouchDB(
            `${this.#url}/db/${this.#queueDBName}`,
            { fetch: (url, opts) => this.fetchPouch.call(this, url, opts) }
        );

        this.init();
    }

    setConfig({ fn, debug }) {
        if (typeof fn === 'function')
            this.fn = fn;
        if (debug)
            this.debug = !!debug;
    }

    async init() {
        if (await this.getDeviceId()) {
            new reqCheckerUrl(
                this.#url,
                () => {
                    this.initReplication();
                },
                this.debug
            );
        }
    }

    initReplication() {
        // do one way, one-off sync from the server until completion
        this.queueDB.replicate.from(this.#queueRemotDB).on('complete', (info) => {
            // then two-way, continuous, retriable sync
            // handle complete
            this.debug && console.log('PouchDB.replicate.from/complete', info);

            this.sync = this.queueDB.sync(this.#queueRemotDB, {
                live: true,
                retry: true,
                back_off_function: (delay) => {
                    if (!delay) {
                        return 500 + Math.floor(Math.random() * 2000);
                    } else if (delay >= 90000) {
                        return 90000;
                    }
                    return delay * 3;
                }
            }).on('change', (info) => {
                // handle change
                this.debug && console.log('PouchDB.sync/change', JSON.stringify(info, null,2));
                if (this.fn)
                    this.fn(info);
            }).on('error', (err) => {
                // handle error
                this.debug && console.log('PouchDB.sync/error', err);
            });

        }).on('error', (err) => {
            // handle error
            this.debug && console.log('PouchDB.replicate.from/error', err);
        });
    }

    async getDeviceId() {
        if (this.#idDevice)
            return this.#idDevice;

        try {
            const res = await this.settingsDB.get(this.#idDBdevice);
            this.#idDevice = res.id;
        } catch (e) {}

        this.debug && console.log('getDeviceId', this.#idDevice);
        return this.#idDevice;
    }

    async commissioning() {
        this.debug && console.log('commissioning');
        if (!this.#idDevice) {
            const res = await request(`${this.#url}/commissioning`, {
                method: 'post',
                body: JSON.stringify({type: '4a3c1b63-79a8-40f3-ab5e-90837bdecee7'}),
                headers: {'Content-Type': 'application/json'}
            });

            try {
                const tokenData = await res.json();
                await this.setToken(tokenData);
                await this.settingsDB.post({_id: this.#idDBdevice, id: tokenData.id});
                this.#idDevice = tokenData.id;
            } catch (e) {
            }

            await this.init();
        }
        return this.getDeviceId();
    }

    async decommissioning() {
        this.debug && console.log('unCommissioning');
        if (this.#idDevice) {
            if (this.sync)
                this.sync.cancel();

            try {
                await this.queueDB.destroy();
                this.queueDB = new this.MPouchDB(this.#queueDBName);

                await this.settingsDB.destroy();
                this.settingsDB = new this.MPouchDB(this.#settingsDBName);

                this.#idDevice = null;
                this.#token = null;
            } catch (e) {}
        }
    }

    async getToken() {
        if (this.#token === null) {
            try {
                const res = await this.settingsDB.get(this.#idDBTokens);
                this.#token = JSON.parse(decrypt(res.hash));
            } catch (e) {
                await this.unCommissioning();
            }
        }
        return this.#token;
    }

    async setToken(v) {
        const doc = await this.settingsDB.get(this.#idDBTokens)
            .catch(() =>
                this.settingsDB.post({_id: this.#idDBTokens})
                    .then(res => ({
                        _id: this.#idDBTokens,
                        _rev: res.rev
                    })));
        doc.hash = encrypt(JSON.stringify(v));
        await this.settingsDB.put(doc);
        this.#token = v;
    }

    async fetchPouch(url, opts) {
        const headers = opts.headers;
        let tokens = await this.getToken();
        headers.set('Authorization', `Bearer ${tokens.token}`);
        this.debug && console.log('get token %j', url, opts)
        let result = await fetch(url, opts);
        this.debug && console.log('result %j', result, url);
        if (result.status === 401) {
            try {
                this.debug && console.log(`get refreshToken ${this.#url}/refresh`)
                const refrResult = await fetch(`${this.#url}/refresh`, {
                    method: 'post',
                    body: JSON.stringify({token: tokens.refreshToken}),
                    headers: {'Content-Type': 'application/json'}
                });
                this.debug && console.log('refreshToken result %j', refrResult);
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
