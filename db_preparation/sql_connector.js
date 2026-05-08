const sql = require('mssql/msnodesqlv8')

class SQLConnector {
    constructor(server, database){
        this.config = {
            database: database,
            server: server,
            driver: 'msnodesqlv8',
            options: {
                trustedConnection: true
            },
            requestTimeout: 60 // max time for how long we will wait for a server's response (in seconds I think)
        }
    }

    async createPool(){
        this.pool = await sql.connect(this.config)
    }

    async read_query(query){
        if (this.pool == undefined) await this.createPool()
        const result = await this.pool.request().query(query)
        return result
    }
}

module.exports = SQLConnector