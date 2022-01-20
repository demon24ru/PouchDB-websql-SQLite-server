const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class HTTPResponseError extends Error {
    constructor(response, ...args) {
        super(`HTTP Error Response: ${response.status} ${response.statusText}`, ...args);
        this.response = response;
    }
}

const request = async (url, opt) => {
    const response = await fetch(url, opt);
    if (response.ok) {
        // response.status >= 200 && response.status < 300
        return response;
    } else {
        throw new HTTPResponseError(response);
    }
}

class reqCheckerUrl {

    constructor(url, fn) {
        this.stopTimer();
        this.url = url;
        if (typeof fn === 'function') {
            this.fn = fn;
        }
        this.startTimer();
    }

    getCounters () {
        request(this.url)
            .then(() => {
                console.log(this.url + '->', true);
                this.stopTimer();
                if (this.fn)
                    this.fn();
            })
            .catch((err) => {
                console.log(this.url + '->', false, err);
                this.startTimer(60*1000)
            })
    }

    stopTimer () {
        if (this.interval) {
            clearTimeout(this.interval);
        }
    }

    startTimer (n) {
        this.stopTimer();
        this.interval = setTimeout(() => {
            this.getCounters();
        }, n || 2000)
    }
}

module.exports = {
    request,
    reqCheckerUrl
};
