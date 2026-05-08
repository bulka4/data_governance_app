const mongoose = require('mongoose')

const nodeSchema = new mongoose.Schema(
    {
        value: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true
        },
        linkedTo: Array,
        script: String,
        x: Number,
        y: Number
    }
)

const dataLineageSchema = new mongoose.Schema(
    {
        dataLineageId: {
            type: Number,
            required: true
        },
        dataLineageName: {
            type: String,
            required: true
        },
        nodes: [nodeSchema]
    },
    {collection: 'dataLineageDocs'}
)

module.exports = mongoose.model('dataLineageDoc', dataLineageSchema)