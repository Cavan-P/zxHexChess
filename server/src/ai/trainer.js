const { getBotStrategy } = require('./index')
const { applyMove } = require('../game/moves')

export const selfPlay = async (botA, botB, fen) => {
    let state = { fen, turn: 'white', enPassant: null }
    const botA = getBotStrategy(botA)
    const botB = getBotStrategy(botB)
    const history = []

    for(;;){
        const bot = state.turn == 'white' ? botA : botB
        const move = bot(state)

        if(!move) break

        state = applyMove(state, move)
        history.push({ ...move })
    }

    return history
}