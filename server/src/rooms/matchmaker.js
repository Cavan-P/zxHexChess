const Room = require('./room')

class Matchmaker {
    constructor(){
        this.rooms = new Map()
    }

    generateCode(){
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let code = ''
        for(let i = 0; i < 5; i++){
            code += chars[Math.floor(Math.random() * chars.length)]
        }

        return code
    }

    createRoom(){
        let code
        do {
            code = this.generateCode()
        } while (this.rooms.has(code))

        const room = new Room(code)
        this.rooms.set(code, room)
        return room
    }

    getRoom(code){
        return this.rooms.get(code)
    }

    removeRoom(code){
        this.rooms.delete(code)
    }
}

module.exports = new Matchmaker()