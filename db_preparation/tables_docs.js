`This file is loading list of tables and columns for which we will be able to add descriptions in the app. This data is saved in the tablesDocs mongodb collection.`

const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1/db_doc')
const tablesDocs = require('./../models/tablesDocs')
const SQLConnector = require('./SQLConnector')

clear_collection(tablesDocs)
load_tables()


async function clear_collection(collection){
    await collection.deleteMany({})
}

async function load_tables(){
    // create a list of all databases from the sql server
    const sql = new SQLConnector('DNAPROD', 'Stage')
    let databases = (await sql.read_query('select name from sys.databases')).recordset.map(record => record.name)
    databases = databases.filter(x => !['master', 'tempdb', 'msdb', 'Monitoring'].includes(x))

    // prepare list of tables from sql server
    let tables = []
    for (let database of databases){
        query = `use "${database}"
                SELECT 
                    concat_ws('.', table_catalog, table_schema, table_name) as table_name, 
                    column_name 
                FROM 
                    INFORMATION_SCHEMA.COLUMNS`

        const result = await sql.read_query(query)

        result.recordset.forEach((record) => {
            tables.push([record.table_name, record.column_name])
        })
    }

    // sort tables and columns names alphabetically
    tables = tables.sort((a, b) => {
        if (a[0].localeCompare(b[0], undefined, {sensitivity: 'base'}) == 0){
            return a[1].localeCompare(b[1], undefined, {sensitivity: 'base'})
        } else {
            return a[0].localeCompare(b[0], undefined, {sensitivity: 'base'})
        }
    })

    // insert documents into the MongoDB
    let actual_table_name = tables[0][0]
    let table_id = 0
    let docs = []
    let doc = {
        tableId: table_id,
        tableName: actual_table_name,
        columns: []
    }

    for (let [table_name, column_name] of tables){
        if (table_name == actual_table_name){
            doc.columns.push({columnName: column_name})
        } else {
            docs.push(doc)
            table_id += 1
            actual_table_name = table_name
            doc = {
                tableId: table_id,
                tableName: table_name,
                columns: [{columnName: column_name}]
            }
        }
    }

    await tablesDocs.insertMany(docs)
    process.exit()
}
