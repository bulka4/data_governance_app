`This file is preparing data for the /data_lineage URL. It is creating documents in the dataLineageDocs collection in the mongodb database db_doc`
`A newer version of this script is data_lineage_dashboards_docs.js which additionally prepares data for Sisense (which tables are used for which dashboards).`


const SQLConnector = require('./SQLConnector')
const Docs = require('../models/dataLineageDocs')

// connecting with mongoose in this file is just for testing. I can remove it later on
const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1/db_doc')

test()

async function test(){
    // scripts_in_out[i][0] is an input table for the i-th script scripts_in_out[i][1] which
    // creates an output table called scripts_in_out[i][2]

    const scripts_in_out = await scriptsInOut()

    // final tables are tables which are not being an input for any script
    const final_tables = []
    for (let row of scripts_in_out){
        let table = row[2]
        let isFinalTable = true
        for (let row of scripts_in_out){
            if (row[0] == table) {
                isFinalTable = false
                break
            }
        }

        if (isFinalTable & !final_tables.includes(table)) final_tables.push(table)
    }

    for (let final_table of final_tables){
        let dataLineageId = await Docs.count({}) + 1
        createDataLineageDocs(
            final_table, 
            final_table, 
            scripts_in_out,
            dataLineageId
        )
    }

    console.log('done')
}

async function createDataLineageDocs(
    final_table, 
    data_lineage_name, 
    scripts_in_out,
    dataLineageId
){
    `This function creates a data lineage document which shows how a given table called final_table
    is being created. This document is being saved in the models/dataLineageDocs.js data model and it can be used by 
    routes/data_lineage_route.js and views/dataLineage.ejs files for creating data lineage visualizations`

    const data_lineage_doc = {
        dataLineageId: dataLineageId,
        dataLineageName: data_lineage_name,
        nodes: []
    }

    createNodes(data_lineage_doc, scripts_in_out, final_table)

    await Docs.insertMany(data_lineage_doc)
}

function createNodes(
    data_lineage_doc, 
    scripts_in_out, 
    table,
    first_iteration = true
){
    `This function creates nodes in the data_lineage_doc object (from the models/dataLineageDocs model)
    for scripts and source tables which are used to create the table indicated by the 'table' argument.
    
    scripts_in_out argument is an output from the scriptsInOut function`

    if (first_iteration){
        data_lineage_doc.nodes.push({
            value: table,
            type: 'table',
            linkedTo: []
        })
    }

    let script_name
    for (let row of scripts_in_out){
        if (row[2] == table){
            script_name = row[1]
            data_lineage_doc.nodes.push({
                value: script_name,
                type: 'script',
                script: row[3],
                linkedTo: [table]
            })
            break
        }
    }

    if (script_name == undefined) return

    let input_tables = []
    scripts_in_out.forEach((x) => {
        if (x[1] == script_name & !input_tables.includes(x[0]))
            input_tables.push(x[0])
    })

    for (let [i, input_table] of input_tables.entries()){
        data_lineage_doc.nodes.push({
            value: input_table,
            type: 'table',
            linkedTo: [script_name]
        })
    }

    for (let input_table of input_tables){
        createNodes(
            data_lineage_doc, 
            scripts_in_out, 
            input_table,
            first_iteration = false
        )
    }
}

async function scriptsInOut(){
    `This function creates a variable called scripts_in_out such that scripts_in_out[i][0] is an input table for the 
    i-th script called scripts_in_out[i][1] which inserts data into the scripts_in_out[i][2] output table`

    const [tables, views, procedures] = await getDbData()
    const scripts_in_out = []
    const views_names = views.map(x => x[0])

    // insert into the scripts_in_out data about procedures, what tables they take as input and what table they create
    for (let [procedure_name, script_clean, script_raw] of procedures){
        // script_clean is a script cleaned using the cleanCode function. It is needed to get list of input tables and an output table.
        // script_raw is an original script which will be saved in the scripts_in_out variable
        if (script_clean == undefined) continue
        if (!script_clean.includes('into') | !script_clean.includes('from')) continue

        const input_tables = []
        const output_table = script_clean.split('into ')[1].split(' ')[0]
        const script_words = script_clean.split(' ')
        
        if (!tables.includes(output_table) & !views_names.includes(output_table)) continue

        for(let [i, word] of script_words.entries()){
            if (['from', 'join'].includes(word)){
                if ((tables.includes(script_words[i + 1]) | views_names.includes(script_words[i + 1]))
                    & !input_tables.includes(script_words[i + 1]) 
                ){
                    input_tables.push(script_words[i + 1])
                }
            }
        }

        // if input tables contains output table than we can't create a data lineage graph for that procedure
        if (input_tables.includes(output_table)) continue

        for (let input_table of input_tables){
            scripts_in_out.push([input_table, procedure_name, output_table, script_raw])
        }
    }

    // insert into the scripts_in_out data about views, what tables they take as input and what table they create
    for (let [view_name, view_script_clean, view_script_raw] of views){
        // view_script_clean is a script cleaned using the cleanCode function. It is needed to get list of input tables and an output table.
        // view_script_raw is an original script which will be saved in the scripts_in_out variable
        if (view_script_clean == undefined) continue
        
        const input_tables = []
        const script_words = view_script_clean.split(' ')

        for(let [i, word] of script_words.entries()){
            if (['from', 'join'].includes(word)){
                if ((tables.includes(script_words[i + 1]) | views_names.includes(script_words[i + 1]))
                    & !input_tables.includes(script_words[i + 1]) 
                ){
                    input_tables.push(script_words[i + 1])
                }
            }
        }

        for (let input_table of input_tables){
            scripts_in_out.push([input_table, view_name, view_name, view_script_raw])
        }
    }

    return scripts_in_out
}

async function getDbData(){
    `This function returns 3 variables:
    - views - list of views
    - tables - list of tables
    - procedures - list of stored procedures. procedures[i][0] is a name of the i-th procedure and procedures[i][1]
                    is the script of that procedure. 

    It collects data from the whole server (from all databases)`

    let sql = new SQLConnector('DNAPROD', 'Stage')
    const databases = await sql.read_query("SELECT name FROM sys.databases")

    let tables = []
    let views = []
    let procedures = []

    for (let db of databases.recordset){
        // if (db.name != 'Stage') continue

        let tables_new = await sql.read_query(`use ${db.name} SELECT (SCHEMA_NAME(schema_id) + '.' + name) as tableName FROM sys.tables`)
        let views_new = await sql.read_query(
            `use ${db.name} 
            SELECT 
                (schema_name(v.schema_id) + '.' + v.name) as viewName,
                m.definition
            FROM 
                sys.views as v
                join sys.sql_modules as m on m.object_id = v.object_id`
        )
        let procedures_new = await sql.read_query(
            `use ${db.name}
            SELECT 
                (specific_catalog + '.' + specific_schema + '.' + specific_name) as 'procedureName',
                routine_definition as routineDefinition
            FROM 
                ${db.name}.INFORMATION_SCHEMA.ROUTINES
            WHERE 
                ROUTINE_TYPE = 'PROCEDURE'`
        )

        // change names into a lower case
        tables_new.recordset.forEach((record, i) => {tables_new.recordset[i] = (db.name + '.' + record.tableName).toLowerCase()})
        views_new.recordset.forEach((record, i) => {
            views_new.recordset[i] = [(db.name + '.' + record.viewName).toLowerCase(), cleanCode(record.definition.toLowerCase()), record.definition]
        })
        procedures_new.recordset.forEach((record, i) => {
            procedures_new.recordset[i] = [record.procedureName.toLowerCase(), cleanCode(record.routineDefinition), record.routineDefinition]
        })

        tables = tables.concat(tables_new.recordset)
        views = views.concat(views_new.recordset)
        procedures = procedures.concat(procedures_new.recordset)
    }

    return [tables, views, procedures]
}

function cleanCode(code){
    if (code != undefined){
        return code.toLowerCase()
            .replaceAll('\n', ' ')
            .replaceAll('\t', ' ')
            .replaceAll('\r', ' ')
            .replaceAll('[', '')
            .replaceAll(']', '')
    }
    else {
        return code
    }
}

Array.prototype.max = function() {
    return Math.max.apply(null, this);
};

Array.prototype.min = function() {
    return Math.min.apply(null, this);
};