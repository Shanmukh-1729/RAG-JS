const express = require('express');
const app = express();
const port = 5000;
const connectDB = require('./config/database');
const indexRouter = require('./routes/index')
const queryRouter = require('./routes/uploadQuery')

app.use(express.json());

connectDB();

app.use('/',indexRouter);
app.use('/',queryRouter);

app.listen(port,()=>{
    console.log(`Server running at http://localhost:${port}`);
});