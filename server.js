`The main script which starts the application.`

if (process.env.NODE_ENV !== 'production'){
    require('dotenv').config()
}

const express = require('express')
const app = express()
const methodOverride = require('method-override')

const mongoose = require('mongoose')

const usersDocs = require('./models/usersDocs')
const usersDocsCopy = require('./models/usersDocsCopy')
const tablesDocs = require('./models/tablesDocs')
const tablesDocsCopy = require('./models/tablesDocsCopy')

const homePageRouter = require('./routes/home_page_route')
const tablesDocsRouter = require('./routes/tables_docs_route')
const loginRouter = require('./routes/login_route')
const dataLineageRouter = require('./routes/data_lineage_route')
const dataLineageDashboardsRouter = require('./routes/data_lineage_dashboards_route')

const flash = require('express-flash')
const session = require('express-session')
const initializePassport = require('./passport-config')
const passport = require('passport')

initializePassport(
    passport,
    async email => await usersDocs.findOne({email: email}),
    async id => await usersDocs.findById(id)
)


app.set('view engine', 'ejs')
// allow for linking .css files from 'public' folder to .ejs files
app.use(express.static('public'));
// express.urldencoded() and express.json() allows us to get access to req.body while sending a post request
app.use(express.urlencoded({extended: true, limit: '200mb'}))
app.use(express.json({limit: '200mb'}))

// this method override will allow us to use PUT method in 'form' html element
app.use(methodOverride('_method'))
// thanks to the flash we can access 'messages' variable inside ejs files
app.use(flash())
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {_expires: 30 * 60 * 1000} // session expires after 30 minutes and user needs to log in again
}))
app.use(passport.initialize())
app.use(passport.session())
// we will be using docsRouter under /docs url
app.use('/home', homePageRouter)
app.use('/tables_docs', tablesDocsRouter)
app.use('/data_lineage', dataLineageRouter)
app.use('/data_lineage_dashboards', dataLineageDashboardsRouter)
app.use('/', loginRouter)

app.get('/', checkNotAuthenticated, (req, res) => {
    res.redirect('/login')
})

// we want to use port 80 because then we don't need to write a port number in the url,
// so instead of writting url 'db_doc.com:port_number' we just need to write 'db_doc.com'
// app.listen(80)
app.listen(8080, '0.0.0.0')

// make a copy of the data in MongoDB once per week in case we accidentally loose the oryginal data
copyData(7 * 24)



// savingInterval argument indicates number of hours every which we will be creating a copy
// of the data from MongoDB 
async function copyData(savingInterval){
    await mongoose.connect('mongodb://127.0.0.1/db_doc')
    // await mongoose.connect('mongodb://localhost/db_doc')

    while (true){
        const collections = await mongoose.connection.db.listCollections().toArray()
            for (let [index, value] of collections.entries()){
                collections[index] = collections[index].name
            }

        for (let [collection, collection_copy, collection_copy_name] of [
            [tablesDocs, tablesDocsCopy, 'tablesDocsCopy'], 
            [usersDocs, usersDocsCopy, 'usersDocsCopy']
        ]){
            const data = await collection.find()

            // drop collections with a copy of a data if they exist
            if (collections.includes(collection_copy_name))
                mongoose.connection.db.dropCollection(collection_copy_name)

            // save a copy of a data
            collection_copy.insertMany(data)
        }

        await sleep(1000 * 60 * 60 * savingInterval)
    }
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// function for checking if user has logged in and is authenticated
function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/tables_docs/0/table')
    }

    next()
}