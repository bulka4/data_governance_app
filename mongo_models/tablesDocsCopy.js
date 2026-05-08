const mongoose = require('mongoose')

const col_schema = new mongoose.Schema({
    columnName: {
        type: String,
        required: true
    },
    foreignKey: {
        type: Boolean,
        default: false
    },
    primaryKey: {
        type: Boolean,
        default: false
    },
    columnDescription: {
        type: String
    },
    // columnDescription encoded (changed into a vector) using transformer model for checking sentence similarity
    columnDescriptionEncoded: {
        type: Array
    }
}, 
{_id: false})

const doc_schema = new mongoose.Schema({
    tableId: {
        type: Number,
        required: true
    },
    tableName: {
        type: String,
        required: true
    },
    tableDescription: {
        type: String
    },
    // tableDescription encoded (changed into a vector) using transformer model for checking sentence similarity
    tableDescriptionEncoded: {
        type: Array
    },
    columns: [col_schema]
}, 
{collection: 'tablesDocsCopy'})

module.exports = mongoose.model('tablesDocsCopy', doc_schema)