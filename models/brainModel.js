const { Schema, model } = require("mongoose");
require('dotenv').config();

const brainSchema = new Schema({
    brain_name : {type:String,required:true},
    brain_id : {type:Schema.Types.ObjectId, required:true},
    filename : {type:String, required:true},
    text : {type:String,required:true},
    embedding : {type:[Number],required:true}
})

const Brain  = model('Brain',brainSchema,'Brains');

module.exports = Brain;