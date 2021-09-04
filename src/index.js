const pouch = require('./pouch');

const express = require('express');
const app = express();

app.use(require('express-pouchdb')(pouch.MPouchDB));

app.listen(3000, ()=>{
    console.log('Listen on port 3000');
})
