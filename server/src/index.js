const express = require('express')
const path = require('path')
const attachWebSocket = require('./websocket')

const PORT = +process.env.PORT || 8000

const app = express()
app.use(express.static(path.join(__dirname, '../../client')))

const server = app.listen(PORT, '0.0.0.0', _ => {
    console.log(`Server running on port ${PORT}`)
})

attachWebSocket(server)

// Last line of defence: log and keep serving rather than dropping every game in progress.
process.on('uncaughtException', e => console.error('[server] Uncaught exception:', e))
process.on('unhandledRejection', e => console.error('[server] Unhandled rejection:', e))
