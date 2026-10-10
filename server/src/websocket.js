const { WebSocketServer } = require('ws')
const matchmaker = require('./rooms/matchmaker')
const { getBotList, getBotByName } = require('./ai/botManager')
const { runTournament } = require('./ai/tournament')
const { runEvolution, materializeGenome } = require('./ai/evolve')

const getBotMeta = id => {
    const meta = getBotList().find(b => b.id == id)
    return meta ? { id: meta.id, name: meta.name, elo: meta.elo } : null
}

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
                const botColor = playerColor == 'white' ? 'black' : 'white'

                const room = matchmaker.createRoom()
                room.isBotGame = true
                room.botStrategy = strategy
                room.botStrategies = undefined
                room.playerColor = playerColor
                room.botMeta = { [botColor]: getBotMeta(botId) }

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

                const strategyA = getBotByName(botA)
                const strategyB = getBotByName(botB)

                if(!strategyA || !strategyB){
                    socket.send(JSON.stringify({ type: 'error', message: 'bot not found' }))
                    return
                }

                const room = matchmaker.createRoom()

                room.isBotGame = true
                room.botStrategies = {
                    white: strategyA,
                    black: strategyB
                }
                room.botMeta = { white: getBotMeta(botA), black: getBotMeta(botB) }

                room.addClient(socket)
                socket.room = room

                socket.send(JSON.stringify({ type: 'roomCreated', code: room.id }))
                socket.send(JSON.stringify({ type: 'roomJoined', code: room.id }))
                console.log(`Started Bot vs Bot: ${botA} (white) vs ${botB} (black)`)

                return
            }

            if(data.type == 'startTournament'){
                const { botIds, gamesPerPairing } = data

                if(!Array.isArray(botIds) || botIds.length < 2){
                    socket.send(JSON.stringify({ type: 'error', message: 'Pick at least 2 bots for a tournament' }))
                    return
                }

                runTournament({
                    botIds,
                    gamesPerPairing: gamesPerPairing || 2,
                    onProgress: progress => {
                        if(socket.readyState == 1) socket.send(JSON.stringify({ type: 'tournamentProgress', ...progress }))
                    }
                }).then(summary => {
                    if(socket.readyState == 1) socket.send(JSON.stringify({ type: 'tournamentComplete', ...summary }))
                }).catch(e => {
                    console.error('[websocket.js] Tournament error:', e)
                    if(socket.readyState == 1) socket.send(JSON.stringify({ type: 'error', message: 'Tournament failed: ' + e.message }))
                })

                return
            }

            if(data.type == 'startTraining'){
                const { generations, populationSize, gamesPerMatch } = data

                runEvolution({
                    generations: generations || 6,
                    populationSize: populationSize || 8,
                    gamesPerMatch: gamesPerMatch || 1,
                    onProgress: progress => {
                        if(socket.readyState == 1) socket.send(JSON.stringify({ type: 'trainingProgress', ...progress }))
                    }
                }).then(best => {
                    const created = materializeGenome(best.genome, { generations: generations || 6, populationSize: populationSize || 8 })
                    if(socket.readyState == 1){
                        socket.send(JSON.stringify({
                            type: 'trainingComplete',
                            bot: created,
                            fitness: best.fitness,
                            bots: getBotList()
                        }))
                    }
                }).catch(e => {
                    console.error('[websocket.js] Training error:', e)
                    if(socket.readyState == 1) socket.send(JSON.stringify({ type: 'error', message: 'Training failed: ' + e.message }))
                })

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