const express = require('express');
const app = express();
const port = 5000;

const indexRouter = require('./routes/index')
const queryRouter = require('./routes/uploadQuery')

app.use(express.json());

app.use('/',indexRouter);
app.use('/',queryRouter);

app.listen(port,()=>{
    console.log(`Server running at http://localhost:${port}`);
});