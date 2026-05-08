`This file is preparing data for the data_lineage_dashboards URL. It will create documents in the dataLineageDashboardsDocs collection in the db_doc mongo database`
`This is a newer version of the data_lineage_docs.js script which additionally prepares data for Sisense (which tables are used for which dashboards).`

require('dotenv').config()
const Docs = require('../models/dataLineageDashboardsDocs')
const tablesDocs = require('../models/tablesDocs')
const SQLConnector = require('./SQLConnector')

// connecting with mongoose in this file is just for testing. I can remove it later on
const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1/db_doc')

class Sisense {
    constructor(){
        this.platform = 'https://rws.sisense.com'
        this.headers = new Headers({
            'Content-Type': 'application/json',
            'authorization': 'Bearer ' + process.env.SISENSE_API_TOKEN_PROD
        })
    }

    async getCubesData(){
        const response = await fetch(this.platform + '/api/v2/datamodels/schema', {
            method: 'get',
            headers: this.headers
        })
    
        // data models represent elasticubes
        const data_models = await response.json()

        return data_models
    }
}


createDataLineageDashboardsDocs()


async function createDataLineageDashboardsDocs(){
    // clear the collection
    await Docs.deleteMany({})

    // get data about elasticubes from Sisense
    const sisense = new Sisense()
    const cubes_data = await sisense.getCubesData()

    const data_lineage_dashboards_docs = []

    console.log('started loading data from dnaprod')
    const [tables_names, views, procedures, jobs_steps] = await getDbData()
    console.log('finished loading data from dnaprod')
    const views_names_lowercase = views.map(x => x[0].toLowerCase())
    const tables_names_lowercase = tables_names.map(x => x.toLowerCase())

    const scripts_in_out = scriptsInOut(tables_names_lowercase, views_names_lowercase, views, procedures, jobs_steps)

    // for each elasticube we create one document which will be saved in the dataLineageDashboardsDocs mongodb collection
    for (let [i, cube_data] of cubes_data.entries()){
        if (cube_data == undefined) continue
        // if (!['WordsPerHour_v3', 'LO Dashboard'].includes(cube_data.title)) continue

        const dashboard_title = cube_data.title

        // doc is a document which will be saved in a database
        const doc = {
            dataLineageId: i,
            dataLineageName: dashboard_title,
            nodes: []
        }

        const datasets = cube_data.datasets
        // cube_tables represents tables from Sisense elasticube
        const cube_tables = []

        datasets.forEach(dataset => {
            if (dataset.connection == undefined) return
            if (dataset.connection.provider != 'sql') return

            const schema = dataset.schema

            for (let cube_table of schema.tables){
                const database = dataset.connection.parameters.Database
                const table_schema = dataset.connection.schema

                let import_query

                if (cube_table.configOptions == undefined){
                    import_query = 'select * from ' + database + '.' + table_schema + '.' + `${cube_table.id}`
                }
                else if (cube_table.configOptions.importQuery == undefined){
                    import_query = 'select * from ' + database + '.' + table_schema + '.' + `${cube_table.id}`
                }
                else {
                    import_query = cube_table.configOptions.importQuery
                }

                if (import_query == undefined) return

                cube_tables.push([cube_table.name, import_query, database])
            }
        })
        
        // for each cube_table we will create a seperate data lineage graph (set of connected nodes)
        let final_table_node_id = 0
        for (let [cube_table_name, import_query, database] of cube_tables){
            // preparing list of tables which are used as input for creating the cube_table
            let input_tables = findInOutTables(
                import_query, 
                cube_table_name, 
                tables_names_lowercase, 
                views_names_lowercase, 
                false,
                database
            )

            // each node has following attributes:
            // - 'linkedTo': list with node's ids to which this node is linked
            // - 'value': text dispalyed in a node
            // - 'x' and 'y': coordinates used for positioning of nodes
            // - 'script': script used for nodes of type = 'script' which will be displayed in a popup window
            // - 'type': can be equal to 'table' or 'script'
            const cube_table_node = {
                value: cube_table_name,
                type: 'table',
                linkedTo: [],
                id: final_table_node_id
            }
            doc.nodes.push(cube_table_node)

            doc.nodes.push({
                value: cube_table_name,
                type: 'script',
                linkedTo: [final_table_node_id],
                script: import_query,
                id: final_table_node_id + 1
            })

            for (let [j, input_table] of input_tables.entries()){
                doc.nodes.push({
                    value: input_table,
                    type: 'table',
                    linkedTo: [final_table_node_id + 1],
                    id: final_table_node_id + 2 + j
                })
            }

            for (let [j, input_table] of input_tables.entries()){
                await createNodes(
                    doc, 
                    scripts_in_out,
                    cube_table_node,
                    input_table,
                    final_table_node_id + 2 + j
                )
            }

            // check how many nodes is in this data lineage graph. We need to know this in order to determine what
            // will be the nodes' ids for the next data lineage graph, for the next cube_table_name
            const nodes_levels = createNodesLevels(doc, cube_table_node)

            let graph_no_nodes = 0
            nodes_levels.forEach(level => {
                graph_no_nodes += level.flat().length
            })

            final_table_node_id += graph_no_nodes
        }

        data_lineage_dashboards_docs.push(doc)
    }
    await Docs.insertMany(data_lineage_dashboards_docs)

    console.log('done')
}

async function createNodes(
    data_lineage_doc, 
    scripts_in_out, 
    final_table_node,
    table_name,
    node_id
){
    `This function creates nodes in the data_lineage_doc object (from the models/dataLineageDashboardsDocs model)
    for scripts and source tables which are used to create the table called table_name. This table is represented 
    by a node with id = node_id.

    data_lineage_doc argument is a document from a mongodb for which we are creating nodes
    
    scripts_in_out argument is an output from the scriptsInOut function
    
    final_table_node argument is a node at the end of a data lineage graph (most to the right) for which we are currently creating nodes`

    // check how many nodes is currently in the given data lineage graph. We need to know this in order to determine what
    // will be the nodes' ids

    const nodes_levels = createNodesLevels(data_lineage_doc, final_table_node)
    let graph_no_nodes = 0
    nodes_levels.forEach(level => {
        graph_no_nodes += level.flat().length
    })

    // create node for a script which creates node with a value table_name
    let script_name
    for (let row of scripts_in_out){
        if (row[2].toLowerCase() == table_name.toLowerCase()){
            script_name = row[1]
            data_lineage_doc.nodes.push({
                value: script_name,
                type: 'script',
                script: row[3],
                linkedTo: [node_id],
                id: final_table_node.id + graph_no_nodes
            })
            break
        }
    }

    // if the table called table_name is not being created by any script then stop execuitng this function
    if (script_name == undefined){
        return
    }

    // save data about the source script in the tablesDocs data model
    await tablesDocs.updateOne({tableName: table_name}, {$set: {sourceScript: script_name}})

    let input_tables = []
    scripts_in_out.forEach((x) => {
        if (
            x[1].toLowerCase() == script_name.toLowerCase() 
            & !input_tables.includes(x[0])
        )
            input_tables.push(x[0])
    })

    for (let [i, input_table] of input_tables.entries()){
        data_lineage_doc.nodes.push({
            value: input_table,
            type: 'table',
            linkedTo: [final_table_node.id + graph_no_nodes],
            id: final_table_node.id + graph_no_nodes + 1 + i
        })
    }

    for (let [i, input_table] of input_tables.entries()){
        await createNodes(
            data_lineage_doc, 
            scripts_in_out, 
            final_table_node,
            input_table,
            final_table_node.id + graph_no_nodes + 1 + i
        )
    }
}

function createNodesLevels(data_lineage_doc, final_node, nodes_levels = []){
    `This function is used in the replaceNodes function.
    
    It creates a list of lists of nodes for each level which is called nodes_levels. One level is a 
    vertical set of nodes in a graph on a website (set of nodes with the same x coordinate).

    nodes_levels[i][0] is a list of tables which are inputs for the nodes_levels[i - 1][0] procedure
    nodes_levels[i][1] is a list of tables which are inputs for the nodes_levels[i - 1][1] procedure
    and so on`

    if (nodes_levels.length == 0){
        for (let node of data_lineage_doc.nodes){
            if (node.linkedTo.length == 0){
                nodes_levels = [[[final_node]]]
            }
        }
        createNodesLevels(data_lineage_doc, final_node, nodes_levels)
    } else {
        // check if now is a level with tables
        if (nodes_levels.length % 2 == 0){
            let previous_level_procedures = nodes_levels.slice(-1)[0]
            const new_level = []

            for (let procedure of previous_level_procedures){
                let linked_nodes = findInputNodes(procedure, data_lineage_doc)
                // new_level.push(linked_nodes)

                // push only those nodes which are tables, not scripts (views tables and scripts has the same name)
                new_level.push(linked_nodes.filter(x => x.type == 'table'))
            }

            nodes_levels.push(new_level)
            createNodesLevels(data_lineage_doc, final_node, nodes_levels)
        } else {
            //  this is a level with procedures
            const new_level = []
            for (let table_node of nodes_levels.slice(-1)[0].flat()){
                let linked_nodes = findInputNodes(table_node, data_lineage_doc)
                if (linked_nodes.length > 0) {
                    // new_level.push(linked_nodes[0])

                    // push only those nodes which are tables, not scripts (views tables and scripts has the same name)
                    new_level.push(linked_nodes.filter(x => x.type == 'script')[0])
                }
            }

            if (new_level.length > 0){
                nodes_levels.push(new_level)
                createNodesLevels(data_lineage_doc, final_node, nodes_levels)
            }
        }
    }

    return nodes_levels
}

function findInputNodes(node, data_lineage_doc){
    `This function finds all nodes which are linked to a given node`
    
    const linked_nodes = []
    for (let node2 of data_lineage_doc.nodes){
        // we need to make sure that nodes types are different because view scripts and tables nodes have the same value
        if (node2.linkedTo.includes(node.id) & node2.type != node.type) linked_nodes.push(node2)
    }

    return linked_nodes
}

function scriptsInOut(tables_names_lowercase, views_names_lowercase, views, procedures, jobs_steps){
    `This function creates a matrix of the following format:
    [
        [input_table, script_name, output_table, script]
        ,...
    ]

    Every row of this matrix indicates which table was taken as an input for a given script and which table is an output of that script. 
    That means that a given script is selecting data from the input table and is creating the output table.
    
    It is using data from all the stored procedures, views definitions and jobs steps from a whole sql server (all databases).
    
    input tables names, scripts names and output tables names contain only lower case letters and there is no special characters.
    Only a script (indicated by scripts_in_out[i][3]) contains capital letters and special characters as it is an original script`

    const scripts_in_out = []

    // insert into the scripts_in_out data about procedures, what tables they take as input and what table they create
    for (let [procedure_name, script] of procedures){
        if (script == undefined) continue

        const database_name = procedure_name.split('.')[0]
        const [input_tables, output_table] = findInOutTables(script, procedure_name, tables_names_lowercase, views_names_lowercase, true, database_name)

        if (input_tables == undefined | output_table == undefined) continue

        for (let input_table of input_tables){
            scripts_in_out.push([input_table, procedure_name, output_table, script])
        }
    }

    // insert into the scripts_in_out data about views, what tables they take as input and what table they create
    for (let [view_name, view_script] of views){
        if (view_script == undefined) continue

        const database_name = view_name.split('.')[0]
        const input_tables = findInOutTables(view_script, view_name, tables_names_lowercase, views_names_lowercase, false, database_name)

        if (input_tables == undefined) continue
        if (input_tables.includes(view_name)){
            console.log(`the view ${view_name} is taking as input itself`)
            continue
        }

        for (let input_table of input_tables){
            scripts_in_out.push([input_table, view_name, view_name, view_script])
        }
    }

    // insert into the scripts_in_out data about jobs steps, what tables they take as input and what table they create
    for (let [job_step_name, script] of jobs_steps){
        if (script == undefined) continue

        const [input_tables, output_table] = findInOutTables(script, job_step_name, tables_names_lowercase, views_names_lowercase, true)

        if (input_tables == undefined | output_table == undefined) continue

        for (let input_table of input_tables){
            scripts_in_out.push([input_table, job_step_name, output_table, script])
        }
    }

    return scripts_in_out
}

function findInOutTables(
    script, 
    script_name, 
    tables_names_lowercase, 
    views_names_lowercase, 
    find_output_table = false, 
    database = undefined
){
    `This function is finding a list of names of tables from which given sql script is selecting data.
    
    If find_output_table = true then this function also selects name of a table which is being populated by given sql script
    
    Argument tables is a list with names of all the tables from a sql server
    
    Argument views_names is a list with names of all the views from a sql server
    
    Argument database is a namse of a database used in the script. It is needed to match tables from the script with tables
    in the tables_names_lowercase argument.`

    const script_no_comments = removeCommentedLines(script)
    const script_words = removeSpecialCharacters(script_no_comments).split(' ').filter(word => word != '')
    const script_words_lowercase = script_words.map(word => word.toLowerCase())
    let input_tables = []
    let output_table
    let database_lowercase

    if (database != undefined) database_lowercase = database.toLowerCase()
    
    for(let [i, word] of script_words_lowercase.entries()){
        if (word == 'use'){
            if (i == script_words.length) continue

            database = script_words[i + 1]
            database_lowercase = script_words_lowercase[i + 1]
        }
        else if (['from', 'join'].includes(word)){
            if (script_words_lowercase[i - 1] == 'delete') continue
            else if (i == script_words.length) continue

            let table_name_lowercase = addDatabaseName(script_words_lowercase[i + 1], database_lowercase)
            let table_name = addDatabaseName(script_words[i + 1], database)

            if ((tables_names_lowercase.includes(table_name_lowercase) | views_names_lowercase.includes(table_name_lowercase))
                & !input_tables.includes(table_name) 
            ){
                input_tables.push(table_name)
            }
        }
        else if (word == 'into') {
            if (i == script_words.length) continue

            let table_name_lowercase = addDatabaseName(script_words_lowercase[i + 1], database_lowercase)
            let table_name = addDatabaseName(script_words[i + 1], database)

            if (tables_names_lowercase.includes(table_name_lowercase) | views_names_lowercase.includes(table_name_lowercase)){
                if (output_table == undefined){
                    output_table = table_name
                }
                else {
                    console.log(`the procedure ${script_name} is populating more than one table`)
                    if (find_output_table){
                        return [undefined, undefined]
                    } else {
                        return undefined
                    }
                }
            }
        }
    }

    // if input tables contains output table than we can't create a data lineage graph for that procedure
    if (output_table != undefined){
        if (input_tables.filter(
            table_name => table_name.toLowerCase() == output_table.toLowerCase()
            ).length > 0
        ){
            console.log(`the script ${script_name} is populating a table which is used as an input`)
            if (find_output_table){
                return [undefined, undefined]
            } else {
                return undefined
            }
        }
    }

    if (find_output_table){
        return [input_tables, output_table]
    } else {
        return input_tables
    }
}

function removeCommentedLines(script){
    `This function is removing commented lined from a sql script`

    const script_lines = script.split('\n')
    const lines_to_remove = []

    script_lines.forEach((line, i) => {
        if (line.includes('--')){
            lines_to_remove.push(i)
        } 
        else if (line.includes('/*')){
            while (!script_lines[i].includes('*/')){
                lines_to_remove.push(i)
                i += 1
                if (i >= script_lines.length - 1) break
            }
            if (i <= script_lines.length - 1)
                lines_to_remove.push(i)
            else
                lines_to_remove.push(script_lines.length - 1)
        }
    })

    lines_to_remove.sort((a, b) => a - b)
    lines_to_remove.forEach((line_index, i) => script_lines.splice(line_index - i, 1))

    return script_lines.join('\n')
}

function addDatabaseName(table_name, database){
    `add a database name to the table name if it's not there`

    if (table_name == undefined) return table_name

    if (table_name.split('.').length == 2 & database != undefined)
        return table_name = database + '.' + table_name
    else return table_name
}

async function getDbData(){
    `This function returns 4 variables:
    - views - list of views
    - tables - list of tables
    - procedures - list of stored procedures. procedures[i][0] is a name of the i-th procedure and procedures[i][1] is a sript. 
    - jobs_steps - list of jobs_steps. jobs_steps[i][0] is a name of a job together with a name of a step of a format '{job_name}_step_{step_name}'
                and jobs_steps[i][1] is a script

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

        tables_new = tables_new.recordset.map(record => removeSpecialCharacters(db.name + '.' + record.tableName))
        views_new = views_new.recordset.map(record => 
            [removeSpecialCharacters(db.name + '.' + record.viewName), record.definition]
        )
        procedures_new = procedures_new.recordset.map(record => 
            [removeSpecialCharacters(record.procedureName), record.routineDefinition]
        )

        tables = tables.concat(tables_new)
        views = views.concat(views_new)
        procedures = procedures.concat(procedures_new)
    }

    let jobs_steps = await sql.read_query(
        `SELECT 
            j.name + '_step_' + s.step_name AS jobStepName,
            s.command AS script
        FROM 
            msdb.dbo.sysjobs AS j
        INNER JOIN 
            msdb.dbo.sysjobsteps AS s ON j.job_id = s.job_id
        WHERE 
            j.enabled = 1
            AND s.subsystem = 'TSQL'`
    )
    jobs_steps = jobs_steps.recordset.map(record => [removeSpecialCharacters(record.jobStepName), record.script])


    return [tables, views, procedures, jobs_steps]
}

function removeSpecialCharacters(code){
    if (code != undefined){
        return code
            .replaceAll('\n', ' ')
            .replaceAll('\t', ' ')
            .replaceAll('\r', ' ')
            .replaceAll('[', '')
            .replaceAll(']', '')
            .replaceAll(`"`, '')
    }
    else {
        return code
    }
}