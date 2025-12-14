const express = require('express')
const path = require('path')
const attachWebSocket = require('./websocket')

const app = express()
app.use(express.static(path.join(__dirname, '../../client')))

const server = app.listen(8000, '0.0.0.0', _ => {
    console.log('Server running on port 8000')
})

try {
    attachWebSocket(server)
} catch (e) {
    console.error('smth happened when trying to attach websocket to server', e)
}