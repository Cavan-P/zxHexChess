const Room = require('./room')

class Matchmaker {
    constructor(){
        this.rooms = new Map()
        this.profiles = null      // PlayerStore, set at startup
        this.onLobbyChange = null // set by the websocket layer to push lobby updates
        this.lobbyTimer = null
    }

    // Public games still waiting for a second player.
    openGames(){
        const games = []
        for(const room of this.rooms.values()){
            if(!room.isPublic || room.destroyed || room.isBotGame || room.game.result) continue
            if(room.players.length != 1 || room.game.history.length) continue
            const host = room.players[0]
            const profile = host.profileId && this.profiles?.get(host.profileId)
            games.push({
                code: room.id,
                host: profile?.name || 'Guest',
                elo: profile?.elo ?? null,
                provisional: profile?.provisional ?? false,
                timeControl: room.timeControl,
                hostColor: host.color,
                createdAt: room.createdAt
            })
        }
        return games.sort((a, b) => a.createdAt - b.createdAt)
    }

    // Rooms call this whenever who's in them changes. Batched so a burst of changes sends one update.
    lobbyChanged(){
        if(this.lobbyTimer) return
        this.lobbyTimer = setTimeout(_ => {
            this.lobbyTimer = null
            this.onLobbyChange?.(this.openGames())
        }, 100)
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

        const room = new Room(code, {
            profiles: this.profiles,
            ...options,
            onEmpty: r => { this.removeRoom(r.id); this.lobbyChanged() },
            onChange: _ => this.lobbyChanged(),
            spawn: opts => this.createRoom(opts)      // lets a room start its own rematch
        })
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