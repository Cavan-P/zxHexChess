import { createGameState } from "../game/state"

const rooms = new Map()

export const joinRoom = (socket, roomId) => {
    let room = rooms.get(roomId)

    if(!room){
        room = {
            gameState: createGameState(),
            sockets: []
        }

        rooms.set(roomId, room)
    }

    room.sockets.push(socket)

    //If 2 players, send them the starting fen
    if(room.sockets.length == 2){
        room.sockets.forEach(socket => {
            socket.send(JSON.stringify({
                type: 'start',
                fen: room.gameState.fen
            }))
        })
    }
}