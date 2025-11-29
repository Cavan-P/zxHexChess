const express = require('express')
const { WebSocketServer } = require('ws')
const path = require('path')

const app = express()

app.use(express.static(path.join(__dirname, '../../client')))

const server = app.listen(8000, _ => {
    console.log('Server running on port 8000')
})

const wss = new WebSocketServer({ server })

let clients = []
let gameState = {
    fen: 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'
}

const sendTo = (socket, data) => {
    if(socket.readyState == 1){
        socket.send(JSON.stringify(data))
    }
}

const broadcastExcept = (sender, data) => {
    clients.forEach(client => {
        if(client != sender && client.readyState == 1){
            client.send(JSON.stringify(data))
        }
    })
}

wss.on('connection', socket => {
    console.log('New client connected')
    clients.push(socket)

    const playerColor = clients.length % 2 ? 'white' : 'black'

    sendTo(socket, {
        type: 'assignColor',
        color: playerColor
    })

    sendTo(socket, {
        type: 'init',
        fen: gameState.fen
    })

    socket.on('message', msg => {
        console.log('Received:', msg.toString())

        let data

        try {
            data = JSON.parse(msg)
        } catch (err) {
            console.log('Invalid message', message)
            return
        }

        if(data.type == 'move'){
            console.log('Move received:', data.payload)

            //Store the new fen

            broadcastExcept(socket, {
                type: 'move',
                fen: gameState.fen,
                username: data.username,
                payload: data.payload
            })

            return
        }

        if(data.type == 'chat'){
            console.log('Chat message:', data.payload)

            broadcastExcept(socket, {
                type: 'chat',
                username: data.username,
                payload: data.payload,
                self: false
            })

            return
        }
    })

    socket.on('close', _ => {
        console.log('client disconnected')
        clients = clients.filter(client => client != socket)
    })
})