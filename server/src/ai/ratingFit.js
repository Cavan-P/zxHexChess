// Batch Elo fit (Bradley-Terry on the Elo scale, the same model BayesElo / Ordo use).
//
// Instead of nudging ratings after every game - where the answer depends on game order and the whole
// pool can drift - this finds the one set of ratings that best explains ALL the games at once:
// P(white scores) = 1 / (1 + 10^(-(Rwhite - Rblack + W) / 400)), where W is the advantage of moving
// first. Draws count as half a win. One bot (the anchor) is pinned to a fixed rating, which is what
// gives the numbers a stable meaning from one tournament to the next.
//
// A very weak prior (every rating ~ Normal(anchor, 1500)) keeps bots with zero wins (or zero losses)
// finite instead of running off to -infinity; for any bot with real results it moves the rating by
// a point or two at most.

const K = Math.LN10 / 400
const PRIOR_SD = 1500
const WHITE_PRIOR_SD = 200

const solve = (A, b) => {
    const n = b.length
    const M = A.map((row, i) => [...row, b[i]])
    for(let c = 0; c < n; c++){
        let p = c
        for(let r = c + 1; r < n; r++) if(Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
        ;[M[c], M[p]] = [M[p], M[c]]
        for(let r = c + 1; r < n; r++){
            const f = M[r][c] / M[c][c]
            for(let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
        }
    }
    const x = new Array(n).fill(0)
    for(let r = n - 1; r >= 0; r--){
        let s = M[r][n]
        for(let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
        x[r] = s / M[r][r]
    }
    return x
}

// Bots that can be reached from the anchor through games. Anyone else has no link to the anchor, so
// there's nothing to measure them against.
const connectedTo = (anchorId, games) => {
    const adj = new Map()
    const link = (a, b) => { if(!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b) }
    for(const g of games){ link(g.white, g.black); link(g.black, g.white) }
    const seen = new Set([anchorId])
    const queue = [anchorId]
    while(queue.length) for(const next of adj.get(queue.shift()) || []) if(!seen.has(next)){ seen.add(next); queue.push(next) }
    return seen
}

// games: [{ white, black, score }] with score from white's side (1, 0.5 or 0).
// Returns { ratings: { id: { elo, se } }, whiteAdvantage: { elo, se }, unconnected: [ids], iterations }.
// `se` is the standard error relative to the anchor (whose own se is 0).
const fitRatings = ({ games, anchorId, anchorElo = 400 }) => {
    const ids = [...new Set(games.flatMap(g => [g.white, g.black]))]
    const reachable = connectedTo(anchorId, games)
    const unconnected = ids.filter(id => !reachable.has(id))
    if(!reachable.has(anchorId) || reachable.size < 2) return { ratings: {}, whiteAdvantage: null, unconnected: ids, iterations: 0 }

    const free = ids.filter(id => reachable.has(id) && id != anchorId)
    const index = new Map(free.map((id, i) => [id, i]))
    const W = free.length          // index of the white-advantage parameter
    const n = W + 1

    // Collapse to one entry per (white, black) pair.
    const pairs = new Map()
    for(const g of games){
        if(!reachable.has(g.white) || !reachable.has(g.black)) continue
        const key = `${g.white}\0${g.black}`
        const p = pairs.get(key) || { white: g.white, black: g.black, n: 0, s: 0 }
        p.n++; p.s += g.score
        pairs.set(key, p)
    }

    const x = new Array(n).fill(0)
    for(let i = 0; i < W; i++) x[i] = anchorElo
    const rating = id => id == anchorId ? anchorElo : x[index.get(id)]

    let H, iterations = 0
    for(; iterations < 200; iterations++){
        const g = new Array(n).fill(0)
        H = Array.from({ length: n }, _ => new Array(n).fill(0))

        for(const p of pairs.values()){
            const d = rating(p.white) - rating(p.black) + x[W]
            const prob = 1 / (1 + Math.exp(-K * d))
            const resid = K * (p.s - p.n * prob)
            const c = p.n * K * K * prob * (1 - prob)
            // d depends on +white, -black, +W.
            const terms = [[index.get(p.white), 1], [index.get(p.black), -1], [W, 1]].filter(([i]) => i !== undefined)
            for(const [i, si] of terms){
                g[i] += si * resid
                for(const [j, sj] of terms) H[i][j] -= si * sj * c
            }
        }
        for(let i = 0; i < W; i++){ g[i] -= (x[i] - anchorElo) / PRIOR_SD ** 2; H[i][i] -= 1 / PRIOR_SD ** 2 }
        g[W] -= x[W] / WHITE_PRIOR_SD ** 2; H[W][W] -= 1 / WHITE_PRIOR_SD ** 2

        // Newton step: x -= H^-1 g. Capped so a wild first step on lopsided data can't overshoot.
        const step = solve(H, g)
        let biggest = 0
        for(let i = 0; i < n; i++){
            const s = Math.max(-300, Math.min(300, step[i]))
            x[i] -= s
            biggest = Math.max(biggest, Math.abs(s))
        }
        if(biggest < 1e-3) break
    }

    // Standard errors: sqrt of the diagonal of the inverse of the (negated) Hessian.
    const se = new Array(n).fill(0)
    for(let i = 0; i < n; i++){
        const e = new Array(n).fill(0); e[i] = 1
        se[i] = Math.sqrt(Math.max(0, -solve(H, e)[i]))
    }

    const ratings = { [anchorId]: { elo: anchorElo, se: 0 } }
    for(const id of free) ratings[id] = { elo: x[index.get(id)], se: se[index.get(id)] }
    return { ratings, whiteAdvantage: { elo: x[W], se: se[W] }, unconnected, iterations }
}

module.exports = { fitRatings }
