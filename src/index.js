const pouch = require('./pouch');

const express = require('express');
const app = express();

app.use(require('express-pouchdb')(pouch.MPouchDB));

// setTimeout(()=> pouch.commissioning(), 60*1000);
//
// setTimeout(()=> pouch.unCommissioning(), 5*60*1000);

app.listen(3001, ()=>{
    console.log('Listen on port 3001');
})
