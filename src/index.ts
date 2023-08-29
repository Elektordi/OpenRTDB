import * as fs from 'fs';
import * as path from 'path';
import cors from 'cors'
import express from 'express'
import * as dotenv from 'dotenv'


dotenv.config()
const api_port = parseInt(process.env.API_PORT || "9000");
const data_dir = path.resolve(process.env.DATA_DIR || (__dirname + "/../data"));
const flush_interval = parseInt(process.env.FLUSH_INTERVAL || "60");

if(!fs.existsSync(data_dir)) {
    console.log(`${data_dir} did not exist and was created!`)
    fs.mkdirSync(data_dir);
}

export const app = express()
let database: any = {}
let database_changed: boolean = false;
let rules: any = {}

const database_path = path.resolve(data_dir, "database.json")
if(fs.existsSync(database_path)) {
    database = JSON.parse(fs.readFileSync(database_path, 'utf8'))
    console.log(`Database loaded from ${database_path}`)
} else {
    console.log(`${database_path} not found. Empty database created!`)
}

const rules_path = path.resolve(data_dir, "rules.json")
if(fs.existsSync(rules_path)) {
    rules = JSON.parse(fs.readFileSync(rules_path, 'utf8'))
    console.log(`Rules loaded from ${rules_path}`)
} else {
    console.log(`${rules_path} not found. Empty rules created!`)
}


app.use(express.json())
app.use(cors())

app.route("/")
    .get((req, res) => {
        res.json({ "OpenRTDB": { "ready": true, "version": process.env.npm_package_version } });
    })

app.route("/~rules")
    .get((req, res) => {
        res.json(rules);
    })
    .post((req, res) => {
        rules = req.body;
        fs.writeFile(rules_path+".tmp", JSON.stringify(rules), (err) => {
            if (err) console.log(`Failed to save rules to ${rules_path}.tmp : ${err}`);
            else fs.rename(rules_path+".tmp", rules_path, (err) => {
                if(err) console.log(`Failed to save rules to ${database_path} : ${err}`);
                else res.status(204).send();
            });
        });
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
            database_changed = true;
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
        database_changed = true;
        res.json(data);
    })

app.listen(api_port, () => {
    console.log(`API server running: http://127.0.0.1:${api_port}`)
})

setInterval(() => {
    if(!database_changed) return;
    database_changed = false;
    console.log("Saving database...");
    fs.writeFile(database_path+".tmp", JSON.stringify(database), (err) => {
        if(err) console.log(`Failed to save database to ${database_path}.tmp : ${err}`);
        else fs.rename(database_path+".tmp", database_path, (err) => {
            if(err) console.log(`Failed to save database to ${database_path} : ${err}`);
            else console.log(`Database saved to ${database_path}`);
        });
    });
}, flush_interval*1000)
