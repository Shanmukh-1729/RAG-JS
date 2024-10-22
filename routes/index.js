const express = require('express');
const router = express.Router();

router.get('/home',(req,res)=>{
    res.send("Welcome to RAG Chatbot built with Express JS!")
})

module.exports = router;