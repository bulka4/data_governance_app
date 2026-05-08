const tablesDocs = require('./models/tablesDocs')
const mongoose = require('mongoose')

mongoose.connect('mongodb://127.0.0.1/db_doc')

// insertTestData()
removeTestData()


async function insertTestData(){
    const docs = await tablesDocs.find()
    const model = new Model()

    await model.load_model('./ml_model/models/model')

    console.log(docs.length)

    for (let [i, doc] of docs.entries()){
        if (i % 100 == 0 | i == docs.length - 1) console.log(`added ${i} descriptions`)

        doc.tableDescription += ' something'.repeat(100)
        doc.tableDescriptionEncoded = encode(doc.tableDescription, 5, model)

        await doc.save()
    }

    throw new Error('script executed')
}


async function removeTestData(){
    const docs = await tablesDocs.find()
    const model = new Model()

    await model.load_model('./ml_model/models/model')

    for (let [i, doc] of docs.entries()){
        if (i % 100 == 0 | i == docs.length - 1) console.log(`added ${i} descriptions`)

        doc.tableDescription = ''
        doc.tableDescriptionEncoded = encode(doc.tableDescription, 5, model)

        await doc.save()
    }

    throw new Error('script executed')
}


// model for search engine
class Model{
    async load_model(path){
        // loading a model in the ONNX format prepared by the script ml_model/model_preparation.py
        const { AutoModel, AutoTokenizer, env } = await import('@xenova/transformers')
        // path indicating where is the model which we want to load
        env.localModelPath = path
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
            // console.log(textSplitted.slice(i, i + chunkSize))
            textChunkEncoded = await model.encode(textSplitted.slice(i, i + chunkSize).join(' '))
            textEncoded.push(textChunkEncoded)
        }

        return textEncoded
    }
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