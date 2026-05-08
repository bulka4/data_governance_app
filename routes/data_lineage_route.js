`This file is creating the router used in the /data_lineage URL`

const express = require('express')
const Docs = require('../models/dataLineageDocs')
const router = express.Router()

router.get('/', checkAuthenticated, async (req, res) => {
    const searchedQuery = if_undefined(req.query.searchedQuery, '')
    let docs = await Docs.find()

    // select only those docs which matches searchedQuery
    if (searchedQuery != '')
        docs = docs.filter(doc => {
            if (doc.dataLineageName.includes(searchedQuery)) return true
            else {
                const nodes_matching_query = doc.nodes.filter(node => {
                    return node.value.includes(searchedQuery)
                })
                
                if (nodes_matching_query.length > 0) return true
            } 
        })

    // order alphabetically docs so they are displayed in that order on a website
    docs = docs.sort((a, b) => {
        if (a.dataLineageName < b.dataLineageName) return -1
        else if (a.dataLineageName > b.dataLineageName) return 1
        else return 0
    })

    res.render('dataLineage', {
        docs: docs,
        selectedDoc: undefined,
        searchedQuery: searchedQuery,
        actualUrl: req.url
    })
})

router.get('/get_data', async (req, res) => {
    const data = await Docs.find()
    res.send(data)
})

router.get('/:id', checkAuthenticated, async (req, res) => {
    const searchedQuery = if_undefined(req.query.searchedQuery, '')
    let docs = await Docs.find()

    // select only those docs which matches searchedQuery
    if (searchedQuery != '')
        docs = docs.filter(doc => {
            if (doc.dataLineageName.includes(searchedQuery)) return true
            else {
                const nodes_matching_query = doc.nodes.filter(node => {
                    return node.value.includes(searchedQuery)
                })
                
                if (nodes_matching_query.length > 0) return true
            } 
        })

    const dataLineageId = req.params.id
    const selectedDoc = find_selected_doc(docs, dataLineageId)

    // order alphabetically docs so they are displayed in that order on a website
    docs = docs.sort((a, b) => {
        if (a.dataLineageName < b.dataLineageName) return -1
        else if (a.dataLineageName > b.dataLineageName) return 1
        else return 0
    })

    res.render('dataLineage', {
        docs: docs,
        selectedDoc: selectedDoc,
        searchedQuery: searchedQuery,
        actualUrl: req.url
    })
})

// post request for saving data about new positions of nodes and links after dragging them
router.post('/save_data', async (req, res) => {
    const node = req.body

    await Docs.updateOne(
        {
            'nodes._id': node._id
        }, 
        {
            'nodes.$': node
        }
    )

    res.redirect('back')
})

router.post('/delete_node', async (req, res) => {
    const node = req.body

    // remove the node
    await Docs.updateOne(
        {
            'nodes._id': node._id
        }, 
        {
            $pull: {nodes: {_id: node._id}}
        }
    )

    // remove links to this node
    await Docs.updateMany(
        {
            'nodes.linkedTo': node.value
        },
        {
            $pull: {'nodes.$[].linkedTo': node.value}
        }
    )

    res.redirect('back')
})

// post request for creating a new node
router.post('/:id/createNode', async (req, res) => {
    const node = {
        value: req.body.nodeName,
        type: req.body.nodeType,
        linkedTo: [],
        x: 1.38,
        y: -15.75
    }
    const dataLineageId = req.params.id

    await Docs.updateOne(
        {
            dataLineageId: dataLineageId
        },
        {
            $push: {nodes: node}
        }
    )

    res.redirect('back')
})

router.post('/search', async (req, res) => {
    const actualUrl = req.body.actualUrl.split('?')[0]
    const searchedQuery = req.body.searchBar

    if (searchedQuery != '')
        res.redirect(`/data_lineage${actualUrl}?searchedQuery=${searchedQuery}`)
    else
        res.redirect(`/data_lineage${actualUrl}`)
})


function if_undefined(x, y){
    if (x != undefined) return x
    else return y
}

// check if user is authenticated (if he has logged in)
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }

    return res.redirect('/login')
}

function find_selected_doc(docs, dataLineageId){
    let selected_doc
    docs.forEach(doc => {
        if (doc.dataLineageId == dataLineageId){
            selected_doc = doc
        }
    })

    return selected_doc
}

module.exports = router