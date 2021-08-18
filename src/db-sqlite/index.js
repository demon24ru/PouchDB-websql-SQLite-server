const mod = require('./src');

if (!process.nextTick) {
    process.nextTick = function (callback) {
        setTimeout(callback, 0)
    }
}

module.exports = mod;
