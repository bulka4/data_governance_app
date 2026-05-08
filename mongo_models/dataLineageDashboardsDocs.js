const mongoose = require('mongoose')

// linkedTo is a list with node's ids to which this node is linked
// value is a text dispalyed in a node
// x and y are coordinates used for positioning of nodes
// script is a script used for nodes of type = 'script' which will be displayed in a popup window
// type can be equal to 'table' or 'script'
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
        tableDescription: String,
        x: Number,
        y: Number,
        id: Number
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
    {collection: 'dataLineageDashboardsDocs'}
)

module.exports = mongoose.model('dataLineageDashboardsDocs', dataLineageSchema)