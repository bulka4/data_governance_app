`This file contains scripts used in the views/dataLineage.ejs file`


// check what is the id of the currently displaying data lineage document
const currentDataLineageId = Number(window.location.href.split('/').slice(-1)[0].split('?')[0])
const dataLineageGraph = document.querySelector('#dataLineageGraph')

getData().then(dataLineageDocs => {
    createVisualization(dataLineageDocs)
})

// dataLineageDocs argument is created by getData function and it contains data about data lineage
// documentation needed for creating a visualization
async function createVisualization(dataLineageDocs){
    const graph_width = dataLineageGraph.offsetWidth
    const graph_height = dataLineageGraph.offsetHeight

    // links defines which nodes are connected with arrows
    const links = []
    let currentDataLineageDoc
    
    for (let data_lineage_doc of dataLineageDocs){
        if (data_lineage_doc.dataLineageId == currentDataLineageId)
            currentDataLineageDoc = data_lineage_doc
    }

    const nodes = currentDataLineageDoc.nodes
    for (let node1 of nodes){
        for (let node2 of nodes){
            // we don't want to join together nodes of the same type (view scripts and tables nodes has the same value)
            if (node1.linkedTo.includes(node2.value) & node1.type != node2.type) 
                links.push({source: node1._id, target: node2._id})
        }
    }

    // change position of nodes
    replaceNodes(
        currentDataLineageDoc, 
        graph_width,
        graph_height
    )

    const simulation = d3
        .forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d._id).strength(0))

    const zoom = d3.zoom()
        .on('zoom', handleZoom)

    const svg = d3
        .create("svg")
            .attr('width', '100%')
            .attr('height', '100%')
            .attr("style", "font: 12px sans-serif;")
            .attr("viewBox", [0, 0, graph_width, graph_height])
            .call(zoom)

    // define style for arrows (markers)
    svg
        .append("defs")
        .append("marker")
            .attr("id", 'arrow')
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 5)
            .attr("refY", -0.5)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
        .append("path")
            .attr("fill", 'black')
            .attr("d", "M0,-5L10,0L0,5")

    // links between nodes
    const link = svg
        .append("g")
            .attr('class', 'links')
            .attr("fill", "none")
            .attr("stroke-width", 1.5)
        .selectAll("path")
        .data(links)
        .join("path")
            .attr("stroke", 'black')
            .attr("marker-end", d => `url(${new URL(`#arrow`, location)})`)

    // nodes with names of tables, systems, scripts etc
    const node = svg
        .append("g")
            .attr('class', 'nodes')
            .attr("fill", "currentColor")
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .classed('node', true)
        .call(drag(simulation))

    // we add rectangles as a background for a text
    node
        .append("rect")
            .attr("fill", d => {
                if (d.type == 'system') return 'blue'
                else if (d.type == 'table') return 'red'
                else if (d.type == 'script') return 'green'
            })
            .attr("x", 5)
            .attr("y", "-0.9em")
            .classed('background', true)

    // adding text to the nodes
    node
        .append("text")
            .attr("x", 8)
            .attr("y", "0.3em")
            .style("font-size", "1.5em")
        .text(d => d.value)
            .attr('color', 'white')
        .classed('nodeText', true)

    // adding the 'X' for the buttons for removing nodes
    node
        .append('text')
            .attr("y", "0.3em")
            .style("font-size", "1.5em")
        .text('X')
        .classed('closeBtnText', true)

    // adding a rectangle as a button for removing nodes
    node
        .append("rect")
            .attr("y", "-0.8em")
            .attr('width', 20)
            .attr('fill', 'transparent')
            .attr('stroke', 'black')
            .attr('stroke-width', '1px')
        .classed('closeBtn', true)

    // adding 'i' for buttons for showing more info about nodes
    node
        .append('text')
            .attr("y", "0.3em")
            .style("font-size", "1.5em")
        .text('i')
        .classed('infoBtnText', true)

    // adding a rectangle as a button for showing more info about nodes
    node
        .append("rect")
            .attr("y", "-0.8em")
            .attr('width', 20)
            .attr('fill', 'transparent')
            .attr('stroke', 'black')
            .attr('stroke-width', '1px')
        .classed('infoBtn', true)

    // change position of nodes and shape of arrows connecting them when user is dragging nodes
    simulation.on("tick", async () => {
        link.attr("d", linkArc)
        node.attr("transform", d => `translate(${d.x},${d.y})`)
    })

    // add the graph with nodes to the website
    // if there is already a graph then remove it before adding a new one
    const graph = Object.assign(svg.node())
    if (dataLineageGraph.childNodes.length > 0) {
        let oldGraph = dataLineageGraph.querySelector('svg')
        dataLineageGraph.removeChild(oldGraph)
    }
    dataLineageGraph.appendChild(graph)

    // we need to change sizes and positions of different elements of a visualization after appending it
    // to the page so we can check what are the sizes of different text elements
    adjustVisualization(node)
}

function replaceNodes(
    data_lineage_doc,
    data_lineage_graph_width,
    data_lineage_graph_heigth,
    // below arguments are needed only for next iterations. User don't need to pass them when calling this function.
    min_y_coordinate = undefined,
    output_table_node = undefined,
    input_tables_nodes = undefined,
    script_node = undefined,
    nodes_levels = undefined,
    output_table_level_nr = 0
){
    `This function works in iterations. In each iteration we are creating one segment. A segment is a set of output table, a script which
    creates that output table and input tables which are an input for that script
    
    max_level_width argument indicates a maximum width of a nodes level. Those are the nodes with the same x coordinate`

    // check if this is the first iteration
    if (output_table_node == undefined){
        nodes_levels = createNodesLevels(data_lineage_doc)

        // calculate width of each level (level is a set of nodes with the same x coordinate)
        const levels_width = []
        for (let [i, level] of nodes_levels.entries()){
            const level_nodes = level.flat()
            const level_nodes_values = []
            
            level_nodes.forEach(node => {
                level_nodes_values.push(node.value)
            })

            // check what is a width of the level. This is the maximum width of a single node in that level.
            // It depends on a number of characters in this node value
            let level_width = level_nodes_values[0].length * 10
            level_nodes_values.forEach(value => {
                if (value.length * 10 > level_width) level_width = value.length * 10
            })
            if (i != 0) level_width += 100
            levels_width.push(level_width)
        }

        const max_x_coordinate = data_lineage_graph_width
        min_y_coordinate = 20

        // initial position of nodes
        for (let [i, level] of nodes_levels.entries()){
            for (let [j, node] of level.flat().entries()){
                node.x = max_x_coordinate - levels_width.slice(0, i + 1).reduce((previous_value, current_value) => previous_value + current_value)
                node.y = min_y_coordinate
            }
        }

        output_table_node = nodes_levels[output_table_level_nr][0][0]
        input_tables_nodes = nodes_levels[output_table_level_nr + 2][0]
        script_node = nodes_levels[output_table_level_nr + 1][0]
    } 

    // check if this is the end of iterations
    if (output_table_level_nr == nodes_levels.length - 1) return

    // replace input tables nodes which are being created by some script
    for (let [i, input_table_node] of input_tables_nodes.entries()){
        let source_script = findInputNodes(input_table_node, data_lineage_doc)[0]

        if (source_script == undefined) continue

        // check what is the minimal y coordinate for input tables for the next segment (next iteration)
        let new_min_y_coordinate = -Infinity
        nodes_levels[output_table_level_nr + 4].flat().forEach(node => {
            if (node.y > new_min_y_coordinate) new_min_y_coordinate = node.y + 40
        })
        // input tables for the next segment (next iteration)
        let new_input_tables_nodes = findInputNodes(source_script, data_lineage_doc)

        replaceNodes(
            data_lineage_doc,
            data_lineage_graph_width,
            data_lineage_graph_heigth,
            new_min_y_coordinate,
            input_table_node,
            new_input_tables_nodes,
            source_script,
            nodes_levels,
            output_table_level_nr + 2
        )
    }

    // replace input tables nodes which are not being created by any script
    for (let [i, input_table_node] of input_tables_nodes.entries()){
        let source_script = findInputNodes(input_table_node, data_lineage_doc)[0]
        if (source_script != undefined) continue

        input_table_node.y = min_y_coordinate

        // check if the node is not to close to other nodes in the same level. If yes then move it
        let closest_node = findClosestNode(input_table_node, data_lineage_doc)

        if (closest_node == undefined) continue
        while (Math.abs(closest_node.y - input_table_node.y) < 40){
            input_table_node.y = closest_node.y + 40
            closest_node = findClosestNode(input_table_node, data_lineage_doc)
        }
    }

    // check what is the biggest and lowest y coordinate of input tables nodes so we can correctly set up y coordinate
    // for the script and output tables nodes
    let input_tables_max_y = input_tables_nodes[0].y
    let input_tables_min_y = input_tables_nodes[0].y
    input_tables_nodes.forEach(node => {
        if (node.y > input_tables_max_y) input_tables_max_y = node.y
        if (node.y < input_tables_min_y) input_tables_min_y = node.y
    })

    // replace the script node
    script_node.y = input_tables_max_y - (input_tables_max_y - input_tables_min_y) / 2

    // replace the output table node
    output_table_node.y = script_node.y
}

function createNodesLevels(data_lineage_doc, nodes_levels = []){
    `This function is used in the replaceNodes function.
    
    It creates a list of lists of nodes for each level which is called nodes_levels. One level is a 
    vertical set of nodes in a graph on a website (set of nodes with the same x coordinate).

    nodes_levels[i][0] is a list of tables which are inputs for the nodes_levels[i - 1][0] procedure
    nodes_levels[i][1] is a list of tables which are inputs for the nodes_levels[i - 1][1] procedure
    and so on`

    if (nodes_levels.length == 0){
        for (let node of data_lineage_doc.nodes){
            if (node.linkedTo.length == 0){
                nodes_levels = [[[node]]]
            }
        }
        createNodesLevels(data_lineage_doc, nodes_levels)
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
            createNodesLevels(data_lineage_doc, nodes_levels)
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
                createNodesLevels(data_lineage_doc, nodes_levels)
            }
        }
    }

    return nodes_levels
}

function findClosestNode(node, data_lineage_doc){
    `This function finds the closest node in the same level (level contains nodes with the same x coordinate)`

    let closest_node
    for (let node2 of data_lineage_doc.nodes){
        if (closest_node == undefined){
            if (
                node2.value != node.value
                & node2.x == node.x
            )
                closest_node = node2
        } else if (
            node2.value != node.value 
            & Math.abs(node2.y - node.y) < Math.abs(closest_node.y - node.y)
            & node2.x == node.x
        ) 
            closest_node = node2
    }

    return closest_node
}

function findInputNodes(node, data_lineage_doc){
    `This function finds all nodes which are linked to a given node`
    
    const linked_nodes = []
    for (let node2 of data_lineage_doc.nodes){
        // we need to make sure that nodes types are different because view scripts and tables nodes have the same value
        if (node2.linkedTo.includes(node.value) & node2.type != node.type) linked_nodes.push(node2)
    }

    return linked_nodes
}

// function for changing sizes and positions of different elements of a visualization
function adjustVisualization(node){
    // add to the nodes data attribute called 'bbox' with info about the text element size 
    // so we can make rectangles have the same size
    node
        .selectAll(".nodeText")
        .each(function(d) { 
            d.bbox = this.getBBox()
        })

    // resize rectangles so they match the text size
    node
        .selectAll(".background")
            .attr('width', d => d.bbox.width + 5)
            .attr('height', d => d.bbox.height + 3)

    // resize and change position of a button for removing node and add event listener for removing a node
    node
        .selectAll(".closeBtn")
            .attr("x", d => d.bbox.width + 10)
            .attr('height', d => d.bbox.height)
        .on('click', (event, data) => {
            fetch(`/data_lineage/delete_node`, {
                method: 'post',
                body: JSON.stringify(data),
                headers: new Headers({
                    'Content-Type': 'application/json'
                })
            })
        })
    
    // resize and change position of a 'X' in a button for removing node
    node
        .selectAll('.closeBtnText')
            .attr("x", d => d.bbox.width + 14)

    // resize and change position of a button for showing more info about node
    // and add event listener for displaying a pop up window with more info about node
    node
        .selectAll(".infoBtn")
            .attr("x", d => d.bbox.width + 30)
            .attr('height', d => d.bbox.height)
        .on('click', async (event, nodeData) => {
            let popUpWindow
            if (nodeData.type == 'table'){
                popUpWindow = document.querySelector('#tableAdditionalInfo')
                popUpWindow.classList.remove('hide')
                popUpWindow.classList.add('show')
                popUpWindow.style.overflowY = 'auto'
                popUpWindow.style.display = 'block'
            } 
            else if (nodeData.type == 'script') {
                popUpWindow = document.querySelector('#scriptAdditionalInfo')
                popUpWindow.classList.remove('hide')
                popUpWindow.classList.add('show')
                popUpWindow.style.overflowY = 'auto'
                popUpWindow.style.display = 'block'

                // add script text to the popup window
                const modal_body = popUpWindow.querySelector('.modal-body')
                modal_body.textContent = nodeData.script
            }
        })
    
    // resize and change position of a 'i' in a button for showing more info about nodes
    node
        .selectAll('.infoBtnText')
            .attr("x", d => d.bbox.width + 38)
}

// function for changing arrows shape when user is dragging nodes
function linkArc(d) {
    const r = Math.hypot(d.target.x - d.source.x, d.target.y - d.source.y)
    return `
        M${d.source.x + d.source.bbox.width + 50},${d.source.y}
        A${r},${r} 0 0,1 ${d.target.x},${d.target.y}
    `
}

async function getData(){
    const response = await fetch('/data_lineage/get_data', {
        method: 'get',
        headers: new Headers({
            'Content-Type': 'application/json'
        })
    })
    const dataLineageDocs = await response.json()
    
    return dataLineageDocs
}

// function for changing coordinates x and y of nodes when user is dragging them
function drag(simulation) {

    function dragstarted(event, d){
        if (!event.active) simulation.alphaTarget(0.3).restart()
    }

    function dragged(event, d) {
        d.x = event.x
        d.y = event.y
    }

    async function dragended(event, d) {
        // get data about nodes and links from given document by making a http request
        let dataLineageDocs = await getData()
        // load data for currently displayed data lineage document
        let displayedDocument
        for (let document of dataLineageDocs){
            if (document.dataLineageId == currentDataLineageId){
                displayedDocument = document
            }
        }
        
        // check if some node is close to the dragged node, if yes then link them
        for (let node of displayedDocument.nodes){
            if (node._id != d._id & Math.abs(node.x - d.x) < 50 & Math.abs(node.y - d.y) < 20){
                // check if nodes are already linked, if yes then remove that link
                // if not then create a new link between those nodes
                if (d.linkedTo.includes(node.value)) d.linkedTo = d.linkedTo.filter((x) => {return x != node.value})
                else if (!node.linkedTo.includes(d.value)) d.linkedTo.push(node.value)

                // move the dragged node back to his old position
                for (let [index, node] of displayedDocument.nodes.entries()){
                    if (node._id == d._id) {
                        d.x = displayedDocument.nodes[index].x
                        d.y = displayedDocument.nodes[index].y
                    }
                }
            }
        }

        // update info about the node's position in a database
        fetch(`/data_lineage/save_data`, {
                method: 'post',
                body: JSON.stringify(d),
                headers: new Headers({
                    'Content-Type': 'application/json'
                })
        }).then(async () => {
            dataLineageDocs = await getData()
            createVisualization(dataLineageDocs)
            // updateVisualization(dataLineageDocs)
        })
    }

    return d3.drag()
        .on('start', dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
}

function handleZoom(e){
    // transform nodes
    d3.select('svg')
        .select('g.nodes')
        .attr('transform', e.transform)

    // transform links
    d3.select('svg')
        .select('g.links')
        .attr('transform', e.transform)
}

// add event listener for closing a popup window with a sql script
const scriptAdditionalInfo = document.querySelector('#scriptAdditionalInfo')
scriptAdditionalInfo.querySelector('.close').addEventListener('click', x => {
    scriptAdditionalInfo.classList.add('hide')
    scriptAdditionalInfo.classList.remove('show')
})

// add event listener for closing a popup window with a table description
const tableAdditionalInfo = document.querySelector('#tableAdditionalInfo')
tableAdditionalInfo.querySelector('.close').addEventListener('click', x => {
    tableAdditionalInfo.classList.add('hide')
    tableAdditionalInfo.classList.remove('show')
})



// // dataLineageDocs argument is created by getData function and it contains data about data lineage
// // documentation needed for creating a visualization
// async function updateVisualization(dataLineageDocs){
//     let links = []
//     let nodes
//     for (let document of dataLineageDocs){
//         if (document.dataLineageId == currentDataLineageId){
//             nodes = document.nodes
//             for (let node1 of nodes){
//                 for (let node2 of nodes){
//                     if (node1.linkedTo.includes(node2.value) & node1.type != node2.type) 
//                         links.push({source: node1._id, target: node2._id})
//                 }
//             }
//         }
//     }

//     const simulation = d3
//         .forceSimulation(nodes)
//         .force("link", d3.forceLink(links).id(d => d._id).strength(0))

//     // const svg = d3
//     //     .select("svg")
//     //         .attr("viewBox", [-width / 2, -height / 2, width, height])
//     //         .attr("width", width)
//     //         .attr("height", height)
//     //         .attr("style", "max-width: 100%; height: auto; font: 12px sans-serif;")

//     // define style for arrows (markers)
//     // svg
//     //     .append("defs")
//     //     .append("marker")
//     //         .attr("id", 'arrow')
//     //         .attr("viewBox", "0 -5 10 10")
//     //         .attr("refX", 5)
//     //         .attr("refY", -0.5)
//     //         .attr("markerWidth", 6)
//     //         .attr("markerHeight", 6)
//     //         .attr("orient", "auto")
//     //     .append("path")
//     //         .attr("fill", 'black')
//     //         .attr("d", "M0,-5L10,0L0,5")

//     // links between nodes
//     const link = svg
//         // .append("g")
//         //     .attr("fill", "none")
//         //     .attr("stroke-width", 1.5)
//         .selectAll("path")
//         .data(links)
//         .join("path")
//             .attr("stroke", 'black')
//             .attr("marker-end", d => `url(${new URL(`#arrow`, location)})`)

//     // nodes with names of tables, systems, scripts etc
//     const node = svg
//         // .append("g")
//         //     .attr("fill", "currentColor")
//         //     .attr("stroke-linecap", "round")
//         //     .attr("stroke-linejoin", "round")
//         .selectAll("g")
//         .data(nodes)
//         .join("g")
//         .classed('node', true)
//         .call(drag(simulation))

//     // we add rectangles as a background for a text
//     // node
//     //     .append("rect")
//     //         .attr("fill", d => {
//     //             if (d.type == 'system') return 'blue'
//     //             else if (d.type == 'table') return 'red'
//     //             else if (d.type == 'script') return 'green'
//     //         })
//     //         .attr("x", 5)
//     //         .attr("y", "-0.9em")
//     //         .classed('background', true)

//     // adding text to the nodes
//     // node
//     //     .append("text")
//     //         .attr("x", 8)
//     //         .attr("y", "0.3em")
//     //         .style("font-size", "1.5em")
//     //     .text(d => d.value)
//     //     .classed('nodeText', true)

//     // adding the 'X' for the buttons for removing nodes
//     // node
//     //     .append('text')
//     //         .attr("y", "0.3em")
//     //         .style("font-size", "1.5em")
//     //     .text('X')
//     //     .classed('closeBtnText', true)

//     // adding a rectangle as a button for removing nodes
//     // node
//     //     .append("rect")
//     //         .attr("y", "-0.8em")
//     //         .attr('width', 20)
//     //         .attr('fill', 'transparent')
//     //         .attr('stroke', 'black')
//     //         .attr('stroke-width', '1px')
//     //     .classed('closeBtn', true)

//     // adding 'i' for buttons for showing more info about nodes
//     // node
//     //     .append('text')
//     //         .attr("y", "0.3em")
//     //         .style("font-size", "1.5em")
//     //     .text('i')
//     //     .classed('infoBtnText', true)

//     // adding a rectangle as a button for showing more info about nodes
//     // node
//     //     .append("rect")
//     //         .attr("y", "-0.8em")
//     //         .attr('width', 20)
//     //         .attr('fill', 'transparent')
//     //         .attr('stroke', 'black')
//     //         .attr('stroke-width', '1px')
//     //     .classed('infoBtn', true)

//     // add the graph with nodes to the website
//     // const graph = Object.assign(svg.node())
//     // const dataLineageGraph = document.querySelector('#dataLineageGraph')
//     // dataLineageGraph.appendChild(graph)

//     // we need to change sizes and positions of different elements of a visualization after appending it
//     // to the page so we can check what are the sizes of different text elements
//     // adjustVisualization(node, link)

//     // return [simulation, node, link]
// }