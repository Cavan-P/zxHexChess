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

wss.on('connection', socket => {
    console.log('New client connected')
    clients.push(socket)

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
            clients.forEach(client => {
                if (client !== ws && client.readyState === 1) {
                  client.send(JSON.stringify({ type: 'move', username: data.username, payload: data.payload }))
                }
              })
        }

        if(data.type == 'chat'){
            console.log('Chat message:', data.payload)
            clients.forEach(client => {
                if(client.readyState == 1){
                    client.send(JSON.stringify({ type: 'chat', username: data.username, payload: data.payload}))
                }
            })
        }
    })

    socket.on('close', _ => {
        console.log('client disconnected')
        clients = clients.filter(client => client != socket)
    })
})