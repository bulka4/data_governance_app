const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    role: {
        type: String,
        default: 'newUser'
    }
}, 
{collection: 'usersDocs'})

module.exports = mongoose.model('usersDocs', userSchema)