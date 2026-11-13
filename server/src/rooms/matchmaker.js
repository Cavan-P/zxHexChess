const Room = require('./room')

class Matchmaker {
    constructor(){
        this.rooms = new Map()
        this.profiles = null      // PlayerStore, set at startup
    }

    generateCode(){
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let code = ''
        for(let i = 0; i < 5; i++){
            code += chars[Math.floor(Math.random() * chars.length)]
        }

        return code
    }

    createRoom(options = {}){
        let code
        do {
            code = this.generateCode()
        } while (this.rooms.has(code))

        const room = new Room(code, { profiles: this.profiles, ...options, onEmpty: r => this.removeRoom(r.id) })
        this.rooms.set(code, room)
        return room
    }

    getRoom(code){
        return typeof code == 'string' ? this.rooms.get(code.trim().toUpperCase()) : undefined
    }

    removeRoom(code){
        this.rooms.delete(code)
    }
}

module.exports = new Matchmaker()