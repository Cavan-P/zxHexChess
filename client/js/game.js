export const Game = {
    canvas: null,
    ctx: null,
    cellSize: 45,

    cells: [],
    pieces: [],

    playerColor: 'white',
    username: 'User ' + Math.floor(Math.random() * 1000),

    mouse: {
        x: 0,
        y: 0,
        pressed: false
    },

    socket: null,

    pieceSprite: null
}