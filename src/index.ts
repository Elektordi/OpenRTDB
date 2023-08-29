import * as fs from 'fs';
import * as path from 'path';
import cors from 'cors'
import express from 'express'
import * as dotenv from 'dotenv'
import { expressjwt } from 'express-jwt';
import jwt from 'jsonwebtoken';
import * as crypto from "crypto";


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
let jwtpublickey: crypto.KeyObject;
let jwtprivatekey: crypto.KeyObject;

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

const jwtkey_path = path.resolve(data_dir, "jwt.key")
if(!fs.existsSync(jwtkey_path)) {
    // @ts-ignore
    let jwtkey = crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { format: 'jwk' },
        privateKeyEncoding: { format: 'jwk' },
    });
    fs.writeFile(jwtkey_path, JSON.stringify(jwtkey), (err) => {
        if (err) console.log(`Failed to save key to ${jwtkey_path} : ${err}`);
    });
    console.log(`${jwtkey_path} not found. New JWT key created!`)
}
let jwtkey = JSON.parse(fs.readFileSync(jwtkey_path, 'utf8'))
jwtpublickey = crypto.createPublicKey({ key: jwtkey['publicKey'], format:'jwk' })
jwtprivatekey = crypto.createPrivateKey({ key: jwtkey['privateKey'], format:'jwk' })
console.log(`JWT key loaded from ${jwtkey_path}`)


app.use(express.json())
app.use(cors())
app.use(
  expressjwt({
    secret: jwtpublickey,
    algorithms: ["RS256"],
    credentialsRequired: false,
  })
);

app.route("/")
    .get((req, res) => {
        res.json({ "OpenRTDB": { "ready": true, "version": process.env.npm_package_version } });
    })

app.route("/.testtoken")
    .get((req, res) => {
        let token = jwt.sign(req.query, jwtprivatekey, {
            algorithm: 'RS256',
            expiresIn: '1h',
            issuer: 'openrtdb'
        });
        res.type("text").send(token);
    })

app.route("/.settings/rules.json")
    .get((req, res) => {
        res.json(rules);
    })
    .post((req, res) => {
        // Firebase client in test mode use PUT on this url, but with "Content-Type: text/plain" and "Authorization: Bearer owner"
        rules = req.body;
        if(!rules.hasOwnProperty("rules")) {
            throw new Error('Empty rules.');
        }

        fs.writeFile(rules_path+".tmp", JSON.stringify(rules["rules"]), (err) => {
            if (err) console.log(`Failed to save rules to ${rules_path}.tmp : ${err}`);
            else fs.rename(rules_path+".tmp", rules_path, (err) => {
                if(err) console.log(`Failed to save rules to ${database_path} : ${err}`);
                else res.json({"status":"ok"});
            });
        });
    })

app.route("/*.json")
    .get((req, res) => {
        let path = (req.params as string[])["0"].split("/").filter(s => s != '');
        let dbref = database;
        let rref = rules;
        let generic_values: any = {};
        let permitted = false;
        // @ts-ignore
        let auth = req.auth || null;
        while(path.length > 0) {
            let elem = path.shift() as string;
            if(rref) {
                let generic_elem = Object.keys(rref).find((x: string) => x.startsWith("$"));
                if(elem in rref) {
                    rref = rref[elem];
                } else if(generic_elem && generic_elem in rref) {
                    generic_values[generic_elem.replace("$", "")] = elem;
                    rref = rref[generic_elem];
                } else {
                    rref = null;
                }
                if(rref && ".read" in rref) {
                    let perm = false;
                    if(typeof rref[".read"] == 'boolean') {
                        perm = rref[".read"];
                    } else if(typeof rref[".read"] == 'string') {
                        let f = "return "+rref[".read"].replace("$", "generic.");
                        try {
                            perm = new Function("generic", "auth", "data", f)(generic_values, auth, dbref);
                        } catch (error) {
                            console.log(error);
                            perm = false;
                        }
                    }
                    if(!perm) {
                        permitted = false;
                        break
                    }
                    permitted = true;
                }
            }
            if(dbref && elem in dbref) {
                dbref = dbref[elem];
            } else {
                dbref = null;
            }
        }
        if(!permitted) {
            res.status(401).json({"error" : "Permission denied"});
            return;
        }
        res.json(dbref);
    })
    .post((req, res) => {
        let path = (req.params as string[])["0"].split("/").filter(s => s != '');
        let data = req.body;
        if(path.length == 0) {
            // TODO: Security
            database = data;
            database_changed = true;
            res.json(data);
            return;
        }
        let dbref = database;
        let lastref = null;
        let rref = rules;
        let generic_values: any = {};
        let permitted = false;
        // @ts-ignore
        let auth = req.auth || null;
        while(path.length > 0) {
            let elem = path.shift() as string;
            if(rref) {
                let generic_elem = Object.keys(rref).find((x: string) => x.startsWith("$"));
                if(elem in rref) {
                    rref = rref[elem];
                } else if(generic_elem && generic_elem in rref) {
                    generic_values[generic_elem.replace("$", "")] = elem;
                    rref = rref[generic_elem];
                } else {
                    rref = null;
                }
                if(rref && ".write" in rref) {
                    let perm = false;
                    if(typeof rref[".write"] == 'boolean') {
                        perm = rref[".write"];
                    } else if(typeof rref[".write"] == 'string') {
                        let f = "return "+rref[".write"].replace("$", "generic.");
                        let newData = data; // TODO
                        try {
                            perm = new Function("generic", "auth", "data", "newData", f)(generic_values, auth, dbref, newData);
                        } catch (error) {
                            console.log(error);
                            perm = false;
                        }
                    }
                    if(!perm) {
                        permitted = false;
                        break
                    }
                    permitted = true;
                }
            }
            if(path.length == 0) {
                if(!permitted) break;
                dbref[elem] = data;
                break;
            }
            if(!(elem in dbref)) {
                dbref[elem] = {};
            }
            dbref = dbref[elem];
        }
        if(!permitted) {
            res.status(401).json({"error" : "Permission denied"});
            return;
        }
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
