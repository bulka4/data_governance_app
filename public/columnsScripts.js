// scroll tables list to the selected table
const selected_table_id = Number(window.location.href.split('/').slice(-2)[0].split('?')[0])
const selected_table_element = document.getElementById(`table_${selected_table_id}`)
selected_table_element.scrollIntoView()