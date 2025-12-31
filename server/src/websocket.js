const { WebSocketServer } = require('ws')
const matchmaker = require('./rooms/matchmaker')
const { getBotStrategy } = require('./ai')
const { getBotList, getBotByName } = require('./ai/botManager')

module.exports = function attachWebSocket(server){
    //console.log('Inside attachwebsocket')
    const wss = new WebSocketServer({ server })

    wss.on('connection', socket => {
        console.log('Client connected')
        socket.room = null

        socket.on('error', e => {
            console.error('Websocket error:', e)
        })

        socket.on('message', msg => {
            let data = null
            try { data = JSON.parse(msg) }
            catch(e){ return }

            //console.log('WS received message:', data)

            if(data.type == 'getBotList'){
                socket.send(JSON.stringify({
                    type: 'botList',
                    bots: getBotList()
                }))

                //console.log("[websocket.js] Sending Bot list:", getBotList())

                return
            }

            if(data.type == 'startBotGame'){
                console.log('[websocket.js] bot id is', data)
                const botId = data.botId
                const strategy = getBotByName(botId)

                console.log(strategy)

                if(!strategy){
                    console.warn(`[websocket.js] Bot not found:`, botId)
                    socket.send(JSON.stringify({ type: 'error', message: 'bot not found' }))
                    return
                }

                const playerColor = data.playerColor || 'white'
                //const botColor = playerColor == 'white' ? 'black' : 'white'

                const room = matchmaker.createRoom()
                //const strategy = getBotStrategy(botId)
                room.isBotGame = true
                room.botStrategy = strategy
                room.botStrategies = undefined
                room.playerColor = playerColor

                room.addClient(socket)
                socket.room = room

                console.log('[WS] Started bot game with ' + botId + '. Socket color:', socket.color)

                //socket.send(JSON.stringify({ type: 'assignColor', color: socket.color }))
                //socket.send(JSON.stringify({ type: 'init', fen: room.gameState.fen, turn: room.gameState.turn }))

                socket.send(JSON.stringify({
                    type: 'roomCreated',
                    code: room.id
                }))
                socket.send(JSON.stringify({ type: 'roomJoined', code: room.id }))
        
                return
            }

            if(data.type == 'startBotVsBot'){
                const { botA, botB } = data
                const room = matchmaker.createRoom()

                const strategyA = getBotStrategy(botA)
                const strategyB = getBotStrategy(botB)

                room.isBotGame = true
                room.botStrategies = {
                    white: strategyA,
                    black: strategyB
                }

                room.addClient(socket)

                socket.send(JSON.stringify({ type: 'roomCreated', code: room.id }))
                socket.send(JSON.stringify({ type: 'roomJoined', code: room.id }))
                console.log(`Started Bot vs Bot: ${botA} (white) vs ${botB} (black)`)

                return
            }
            

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
                //console.log('ws forwarding message to room handler')
                socket.room.handleMessage(socket, data)
            }
            else {
                console.warn('ws socket has no room assigned')
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