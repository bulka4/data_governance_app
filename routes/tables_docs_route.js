const express = require('express')
const tablesDocs = require('../models/tablesDocs')
const dataLineageDashboardsDocs = require('../models/dataLineageDashboardsDocs')
const router = express.Router()
const Fuse = require('fuse.js')

const redis = require('redis')
const redis_client = redis.createClient()
redis_client.connect()


router.get('/', checkAuthenticated, async (req, res) => {
    res.redirect('/tables_docs/0/table')
})

// get request for viewing tables descriptions
router.get('/:id/table', checkAuthenticated, async (req, res) => {
    const table_id = req.params.id

    if (req.user.role == 'newUser'){
        res.render('newUser')
    } else {
        // readOnly indicates if user can only read documentation without editing
        let readOnly
        if (req.user.role == 'viewer') readOnly = true
        else if (req.user.role == 'designer') readOnly = false

        const searchedQuery = if_undefined(req.query.searchedQuery, '')
        const alert = if_undefined(req.query.alert, '')

        // load data about tables from redis if it's saved there. If not then load it from mongodb and save in redis
        const tables_docs = await LoadData(tablesDocs, 'tables_docs')

        // find for which table documentation is actually being displayed
        const selected_doc = find_doc(tables_docs, table_id)

        // sort documents such that at the top are documents with table or column description
        // with a meaning the most similar to the searched query from search engine
        const sortedDocs = await sortDocs(searchedQuery, tables_docs)

        res.render('table', {
            docs: sortedDocs,
            selected_doc: selected_doc,
            searchedQuery: searchedQuery,
            alert: alert,
            readOnly: readOnly
        })
    }
})


// get request for viewing columns descriptions
router.get('/:id/columns', checkAuthenticated, async (req, res) => {
    const table_id = req.params.id

    if (req.user.role == 'newUser') res.render('newUser')
    else {
        // readOnly indicates if user can only read documentation without editing
        let readOnly
        if (req.user.role == 'viewer') readOnly = true
        else if (req.user.role == 'designer') readOnly = false

        // load data about tables from redis if it's saved there. If not then load it from mongodb and save in redis
        const tables_docs = await LoadData(tablesDocs, 'tables_docs')

        const searchedQuery = if_undefined(req.query.searchedQuery, '')
        const selected_doc = find_doc(tables_docs, table_id)
        const sortedDocs = await sortDocs(searchedQuery, tables_docs)

        res.render('columns', {
            docs: sortedDocs,
            selected_doc: selected_doc,
            searchedQuery: searchedQuery,
            readOnly: readOnly
        })
    }
})

// put request for saving table description
router.put('/:id/table', async (req, res) => {
    const table_id = req.params.id
    const table_doc = await tablesDocs.findOne({tableId: table_id})
    const data_lineage_docs = await dataLineageDashboardsDocs.find()
    const searchedQuery = if_undefined(req.query.searchedQuery, '')
    const model = new Model()
    await model.load_model()

    // if there is too long word in a table description then show an alert
    for (let word of req.body.description.split(' ')){
        if (word.length > 50){
            if (searchedQuery != ''){
                res.redirect(`/tables_docs/${table_id}/table?searchedQuery=${searchedQuery}&alert=tooLongWord`)
                return
            }
            else {
                res.redirect(`/tables_docs/${table_id}/table?alert=tooLongWord`)
                return
            }
        }
    }

    table_doc.tableDescription = req.body.description
    table_doc.tableDescriptionEncoded = await encode(req.body.description, 5, model)
    
    await SaveData(tablesDocs, table_doc, 'tables_docs')
    
    // save table description in documents for data lineage graphs
    data_lineage_docs.forEach(doc => {
        const nodes = doc.nodes
        nodes.forEach(node => {
            if (node.type == 'table' & node.value == table_doc.tableName){
                node.tableDescription = req.body.description
            }
        })
    })
    await dataLineageDashboardsDocs.create(data_lineage_docs)

    if (searchedQuery != '')
        res.redirect(`/tables_docs/${table_id}/table?searchedQuery=${searchedQuery}`)
    else
        res.redirect(`/tables_docs/${table_id}/table`)
})

// put request for saving columns description
router.put('/:id/columns', async (req, res) => {
    const table_id = req.params.id
    const doc = await tablesDocs.findOne({tableId: table_id})
    const searchedQuery = if_undefined(req.query.searchedQuery, '')
    const model = new Model()
    
    await model.load_model()

    for (let column of doc.columns){
        column.foreignKey = false
        column.primaryKey = false
    }

    let column
    let index
    for (let [key, value] of Object.entries(req.body)){
        index = key.slice(-1)
        column = doc.columns[index]

        if (key.slice(0, -2) == 'column_description'){
            column.columnDescription = value
            column.columnDescriptionEncoded = await encode(value, 5, model)
        } else if (key.slice(0, -2) == 'foreignKey'){
            column.foreignKey = true
        } else if (key.slice(0, -2) == 'primaryKey'){
            column.primaryKey = true
        }
    }

    // await doc.save()
    await SaveData(tablesDocs, doc, 'tables_docs')

    if (searchedQuery != '')
        res.redirect(`/tables_docs/${table_id}/columns?searchedQuery=${searchedQuery}`)
    else
        res.redirect(`/tables_docs/${table_id}/columns`)
})

// post request for searching through tables and columns descriptions
// it redirects to the page with table description
router.post('/table/search', async (req, res) => {
    const searchedQuery = req.body.searchBar
    if (searchedQuery != '')
        res.redirect(`/tables_docs/${req.body.tableId}/table?searchedQuery=${searchedQuery}`)
    else
        res.redirect(`/tables_docs/${req.body.tableId}/table`)
})

// post request for searching through tables and columns descriptions
// it redirects to the page with columns description
router.post('/columns/search', async (req, res) => {
    const searchedQuery = req.body.searchBar
    if (searchedQuery != '')
        res.redirect(`/tables_docs/${req.body.tableId}/columns?searchedQuery=${searchedQuery}`)
    else
        res.redirect(`/tables_docs/${req.body.tableId}/columns`)
})



// model for search engine
class Model{
    async load_model(){
        // loading a model in the ONNX format prepared by the script ml_model/model_preparation.py
        const { AutoModel, AutoTokenizer, env } = await import('@xenova/transformers')
        // path indicating where is the model which we want to load
        env.localModelPath = __dirname + '/../ml_model/models/model'
        this.tokenizer = await AutoTokenizer.from_pretrained('')
        this.model = await AutoModel.from_pretrained('')
        
        return [this.model, this.tokenizer]
    }

    async encode(inputs){
        // encode input text
        inputs = await this.tokenizer(inputs)
        let result = await this.model(inputs)
        result = Array.from(result.last_hidden_state.data)

        //reshaping result into a matrix of shape (sequence_length, out_dim)
        // out_dim is a dimension of a vector returned by a model for each input token
        result.reshape(result.length / 768, 768)

        // mean pooling
        let sum = result[0]
        for (let row of result.slice(1)){
            sum = sum.map((num, idx) => {
                return num + row[idx]
            })
        }
        result = sum.map(value => value / result.length)

        return result
    }
}



// divide text into chunks consisting of chunkSize words and encode each of them
async function encode(text, chunkSize, model){
    let textEncoded = []

    if (text == '') {
        return textEncoded
    }
    else {
        const textSplitted = text.split(' ')
        // we divide table description into chunks each containing chunkSize words
        let textChunkEncoded
        for (let i = 0; i <= textSplitted.length; i += chunkSize){
            textChunkEncoded = await model.encode(textSplitted.slice(i, i + chunkSize).join(' '))
            textEncoded.push(textChunkEncoded)
        }

        return textEncoded
    }
}



// cosine similarity for checking how similar are 2 sentence embeddings
function cos_sim(A, B){
    if (A.length == 0 | B.length == 0) return 0

    var dotproduct = 0;
    var mA = 0;
    var mB = 0;

    for(var i = 0; i < A.length; i++) {
        dotproduct += A[i] * B[i];
        mA += A[i] * A[i];
        mB += B[i] * B[i];
    }

    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);
    var similarity = dotproduct / (mA * mB);

    return similarity;
}



// function for reshaping 1d array into 2d array
Array.prototype.reshape = function(rows, cols) {
    var copy = this.slice(0); // Copy all elements.
    this.length = 0; // Clear out existing array.
  
    for (var r = 0; r < rows; r++) {
        var row = [];
        for (var c = 0; c < cols; c++) {
            var i = r * cols + c;
            if (i < copy.length) {
            row.push(copy[i]);
            }
        }
        this.push(row);
    }
}



// sorting documents based on searched query typed in to search engine such that at the top there are
// the best matching documents. Matching is done based on:
// - how similar is a meaning of a table or column description to the searched query (semantic search)
// - tables and columns names (fuzzy match)
async function sortDocs(searchedQuery, docs){
    if (searchedQuery == '') return docs

    // fuzzy matching
    const fuse = new Fuse(docs, {keys: ['tableName'], includeScore: true, threshold: 1, findAllMatches:true, ignoreLocation: true})
    const result = fuse.search(searchedQuery)
    // fuzzy_scores[i] is a similarity score for the table with tableId = i.
    // Scores are numbers between 0 and 1. Higher number indicates better match.
    const fuzzy_scores = {}
    result.forEach(x => {
        fuzzy_scores[x.item.tableId] = 1 - x.score
    })

    // make sure that there is a fuzzy score for every document
    docs.forEach(doc => {
        if (isNaN(fuzzy_scores[doc.tableId])) fuzzy_scores[doc.tableId] = 0
    })

    // semantic search
    const model = new Model()
    await model.load_model()

    searchedQueryEncoded = await model.encode(searchedQuery)

    // semantic_scores[i] is a similarity score for the table with tableId = i
    // Scores are numbers between 0 and 1. Higher number indicates better match.
    const semantic_scores = {}

    docs.forEach((doc) => {
        semantic_scores[doc.tableId] = []
        if (doc.tableDescriptionEncoded.length == 0) semantic_scores[doc.tableId].push(0)
        else {
            doc.tableDescriptionEncoded.forEach(vector => {
                semantic_scores[doc.tableId].push(cos_sim(vector, searchedQueryEncoded))
            })
        }
        doc.columns.forEach(column => {
            if (column.columnDescriptionEncoded.length == 0) semantic_scores[doc.tableId].push(0)
            else {
                column.columnDescriptionEncoded.forEach(vector => {
                    semantic_scores[doc.tableId].push(cos_sim(vector, searchedQueryEncoded))
                })
            }
        })

        let max_score = Math.max(...semantic_scores[doc.tableId])
        if (isNaN(max_score))
            semantic_scores[doc.tableId] = 0
        else
            semantic_scores[doc.tableId] = max_score
    })

    // similarity_scores[i] is a similarity score for the table with tableId = i
    // calculated based on scores from both semantic search and fuzzy matching
    const similarity_scores = {}
    docs.forEach((doc) => {
        similarity_scores[doc.tableId] = semantic_scores[doc.tableId] + fuzzy_scores[doc.tableId]
    })

    const sortedDocs = docs.sort((a, b) => {
        if (similarity_scores[a.tableId] > similarity_scores[b.tableId]) return -1
        else if (similarity_scores[a.tableId] < similarity_scores[b.tableId]) return 1
        else return 0
    })

    return sortedDocs
}



function find_doc(docs, tableId){
    let selected_doc
    docs.forEach(doc => {
        if (doc.tableId == tableId){
            selected_doc = doc
        }
    })

    return selected_doc
}



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



async function LoadData(collection, redis_key){
    `This function loads data from the Redis for the key redis_key. If there is no data for that key in Redis
    then this function loads data from a MongoDB collection and saves it in redis for the key redis_key`

    let data = await redis_client.get(redis_key)
    if (data == null){
        data = await collection.find()

        // save data into redis
        redis_client.SETEX(redis_key, 2*60*60, JSON.stringify(data))
    } else {
        data = JSON.parse(data)
    }

    return data
}



async function SaveData(collection, document, redis_key){
    `When we are modifying a document (given by the argument 'document'), this function saves changes 
    in a MongoDB collection and also updates the whole collection data in Redis`

    await document.save()
    const data = await collection.find()
    redis_client.SETEX(redis_key, 2*60*60, JSON.stringify(data))
}


module.exports = router