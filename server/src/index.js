const express = require('express')
const path = require('path')
const attachWebSocket = require('./websocket')

const app = express()
app.use(express.static(path.join(__dirname, '../../client')))

const server = app.listen(8000, _ => {
    console.log('Server running on port 8000')
})

attachWebSocket(server)