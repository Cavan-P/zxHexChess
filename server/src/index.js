import express from 'express'
import { WebSocketServer } from 'ws'

const app = express()
const server = app.listen(8000, _ => {
    console.log('Server running on port 8000')
})

const wss = new WebSocketServer({ server })

wss.on('connection', socket => {
    console.log('New client connected')

    socket.on('message', msg => {
        console.log('Received:', msg.toString())
    })

    socket.on('close', _ => {
        console.log('client disconnected')
    })
})