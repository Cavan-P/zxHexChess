export const initialFen = 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'

export const createGameState = _ => {
    return {
        fen: initialFen,
        players: []
    }
}