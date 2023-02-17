import cors from 'cors'
import express from 'express'

import { config } from '~/config'


const app = express()

app.use(express.json())
app.use(cors())

app.get('/', (req, res) => {
    res.json({ "Hello": "World" });
})

app.listen(config.API_PORT, () => {
    console.log(`API server running: http://127.0.0.1:${config.API_PORT}`)
})

