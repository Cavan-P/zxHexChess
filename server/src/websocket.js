const { WebSocketServer } = require('ws')
const matchmaker = require('./rooms/matchmaker')

module.exports = function attachWebSocket(server){
    const wss = new WebSocketServer({ server })

    wss.on('connection', socket => {
        console.log('Client connected')
        socket.room = null

        socket.on('message', msg => {
            let data = null
            try { data = JSON.parse(msg) }
            catch(e){ return }

            if(data.type == 'createRoom'){
                const room = matchmaker.createRoom()
                socket.room = room
                room.addClient(socket)

                socket.send(JSON.stringify({
                    type: 'roomCreated',
                    code: room.id
                }))
                socket.send(JSON.stringify({ type: 'roomJoined', code: room.id }))

                return
            }

            if(data.type == 'joinRoom'){
                const room = matchmaker.getRoom(data.code)

                if(!room){
                    socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }))
                    return
                }

                socket.room = room
                room.addClient(socket)

                socket.send(JSON.stringify({ type: 'roomJoined', code: room.id }))

                return
            }

            if(socket.room){
                socket.room.handleMessage(socket, data)
            }
        })

        socket.on('close', _ => {
            if(socket.room){
                socket.room.removeClient(socket)
            }
        })
    })

    return wss

}