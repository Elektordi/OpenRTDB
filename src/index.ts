import cors from 'cors'
import express from 'express'

import { config } from '~/config'


export const app = express()
let database: any = {}

app.use(express.json())
app.use(cors())

app.get('/', (req, res) => {
    res.json({ "Hello": "World" });
})

app.route("/*.json")
    .get((req, res) => {
        let path = (req.params as string[])["0"].split("/").filter(s => s != '');
        let dbref = database;
        while(path.length > 0) {
            let elem = path.shift() as string;
            if(elem in dbref) {
                dbref = dbref[elem];
            } else {
                dbref = null;
                break;
            }
        }
        res.json(dbref);
    })
    .post((req, res) => {
        let path = (req.params as string[])["0"].split("/").filter(s => s != '');
        let data = req.body;
        if(path.length == 0) {
            database = data;
            res.json(data);
            return;
        }
        let dbref = database;
        while(path.length > 1) {
            let elem = path.shift() as string;
            if(!(elem in dbref)) {
                dbref[elem] = {};
            }
            dbref = dbref[elem];
        }
        dbref[path[0]] = data;
        res.json(data);
    })

app.listen(config.API_PORT, () => {
    console.log(`API server running: http://127.0.0.1:${config.API_PORT}`)
})

