const mongoose = require('mongoose');

require('dotenv').config();

const connectDB = async () =>{
    try{
        await mongoose.connect(process.env.MONGO_URI)
        //     {
        //     useNewUrlParser : true,
        //     // useUnifiedTopology : true
        // }
        console.log("Created Connection to DB!")
    }catch(err){
        console.error(err);
        // throw err;
        process.exit(1);
    }
};

module.exports = connectDB;