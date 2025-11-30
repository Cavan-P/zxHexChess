const { randomUUID } = require('crypto')
const { generateLegalMoves, isMoveLegal, parseFen } = require('../game/moves.js')

class Room {
    constructor(id){
        this.id = id || randomUUID.slice(0, 6).toUpperCase()
        this.players = []
        this.spectators = []
        this.gameState = {
            fen: 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'
        }
    }

    addClient(socket){
        if(this.players.length < 2){
            const colors = ['white', 'black']
            const taken = this.players.map(player => player.color)
            const available = colors.filter(color => !taken.includes(color))

            const assignedColor = available.length ? available[0] : colors[Math.floor(Math.random() * 2)]

            socket.color = assignedColor
            this.players.push(socket)

            socket.send(JSON.stringify({
                type: 'assignColor',
                color: assignedColor
            }))
        }
        else {
            socket.color = 'spectator'
            this.spectators.push(socket)
            socket.send(JSON.stringify({
                type: 'assignColor',
                color: 'spectator'
            }))
        }

        socket.send(JSON.stringify({
            type: 'init',
            fen: this.gameState.fen
        }))

        console.log(`Client joined room ${this.id} as ${socket.color}`)
    }

    removeClient(socket){
        this.players = this.players.filter(player => player != socket)
        this.spectators = this.spectators.filter(spectator => spectator != socket)
    }

    broadcastExcept(sender, msgObj){
        const msg = JSON.stringify(msgObj)
        const all = [...this.players, ...this.spectators]

        all.forEach(client => {
            if(client != sender && client.readyState == 1){
                client.send(msg)
            }
        })
    }

    handleMessage(socket, data){
        if(data.type == 'move'){
            this.gameState.fen = data.fen || this.gameState.fen

            this.broadcastExcept(socket, {
                type: 'move',
                fen: this.gameState.fen,
                username: data.username,
                payload: data.payload
            })
        }
        if(data.type == 'chat'){
            this.broadcastExcept(socket, {
                type: 'chat',
                username: data.username,
                payload: data.payload,
                self: false
            })
        }
        if(data.type == 'requestLegalMoves'){
            if(socket.color != 'white' && socket.color != 'black'){
                socket.send(JSON.stringify({
                    type: 'legalMoves',
                    from: data.from,
                    moves: []
                }))
                return
            }

            const board = parseFen(this.gameState.fen)
            const legal = generateLegalMoves(board, data.from)

            socket.send(JSON.stringify({
                type: 'legalMoves',
                from: data.from,
                moves: legal
            }))

            return
        }
    }
}

module.exports = Room