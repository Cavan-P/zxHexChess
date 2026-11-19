// Unattended improvement loop: train Ada, then match her against her latest frozen snapshot, then
// keep or undo the training based on the result. Meant to run overnight with the server stopped.
//
//   npm run overnight -- [--rounds 1] [--gens 30] [--pop 16] [--games 2] [--match 100] [--match-seconds 1] [--bot adaKessler]
//
// Each round:
//   1. backs up the bot's file (data/overnight/),
//   2. trains it (scripts/train.js),
//   3. plays it against its newest snapshot (scripts/match.js),
//   4. decides:
//        clearly stronger (95% interval above 0)  -> keep, and freeze a new snapshot (v3, v4, ...)
//        scored over 50% but not conclusive       -> keep, no snapshot (the next round builds on it)
//        scored 50% or less                       -> undo: the bot's file goes back to the backup
// A summary of every round is appended to data/overnight/summary.txt. On macOS the Mac is kept
// awake (caffeinate) until it finishes.
const fs = require('fs')
const path = require('path')
const { fork, spawn } = require('child_process')

const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
// Without the `--` (npm run overnight --rounds 3) npm swallows the flags and passes only stray values.
const stray = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
if(stray.length || Object.keys(process.env).some(k => /^npm_config_(rounds|gens|pop|games|match|seconds|bot)$/.test(k))){
    console.error(`Options didn't reach the script - put -- before them, e.g.  npm run overnight -- --rounds 3`)
    process.exit(1)
}
const id = flag('bot', 'adaKessler')
const rounds = Math.max(1, Math.round(+flag('rounds', 1)))
const matchGames = String(Math.max(2, Math.round(+flag('match', 100))))
const matchSeconds = String(flag('match-seconds', 1))
const trainArgs = ['--bot', id, '--gens', flag('gens', 30), '--pop', flag('pop', 16), '--games', flag('games', 2),
    '--depth', flag('depth', 3), '--seconds', flag('seconds', 0.25)]

const EVOLVED = path.join(__dirname, '../src/ai/strategies/evolved')
const OUT = path.join(__dirname, '../data/overnight')
fs.mkdirSync(OUT, { recursive: true })
const botFile = path.join(EVOLVED, `${id}.js`)
if(!fs.existsSync(botFile)) { console.error(`No trained bot ${id}`); process.exit(1) }

const stamp = _ => new Date().toLocaleString()
const summary = line => { console.log(`\n>>> ${line}\n`); fs.appendFileSync(path.join(OUT, 'summary.txt'), `[${stamp()}] ${line}\n`) }

// Each step runs in its own process so it loads the bot files fresh from disk.
const run = (script, scriptArgs) => new Promise((resolve, reject) => {
    let message = null
    const child = fork(path.join(__dirname, script), scriptArgs, { stdio: 'inherit' })
    child.on('message', m => { message = m })
    child.on('exit', code => code == 0 && message ? resolve(message) : reject(new Error(`${script} failed (exit ${code})`)))
})

const latestSnapshot = _ => {
    let n = 0
    while(fs.existsSync(path.join(EVOLVED, `${id}V${n + 1}.js`))) n++
    return n ? `${id}V${n}` : null
}

const freeze = _ => {
    // Freeze from a fresh process too, so it copies the file as it is now.
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', `console.log(require('./src/ai/evolve').snapshotEvolvedBot(${JSON.stringify(id)}).name)`],
            { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'inherit'] })
        let out = ''
        child.stdout.on('data', d => out += d)
        child.on('exit', code => code == 0 ? resolve(out.trim().split('\n').pop()) : reject(new Error('Freezing failed')))
    })
}

let currentBackup = null

const main = async _ => {
    if(process.platform == 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref()
    const started = Date.now()

    for(let round = 1; round <= rounds; round++){
        let opponent = latestSnapshot()
        if(!opponent){
            console.log('No snapshot to measure against yet - freezing the current version first.')
            await freeze()
            opponent = latestSnapshot()
        }

        const backup = path.join(OUT, `${id}.before-round-${new Date().toISOString().replace(/[:.]/g, '-')}.js`)
        fs.copyFileSync(botFile, backup)
        currentBackup = backup
        console.log(`\n=== Round ${round}/${rounds} (${stamp()}): train ${id}, then match against ${opponent} ===`)

        try {
            await run('train.js', trainArgs)
            const r = await run('match.js', [id, opponent, matchGames, '--seconds', matchSeconds])
            const result = `+${r.win} =${r.draw} -${r.loss} (${(r.score * 100).toFixed(1)}%, ${r.elo >= 0 ? '+' : ''}${Math.round(r.elo)} Elo)`

            if(r.lo > 0){
                const name = await freeze()
                summary(`Round ${round}: trained vs ${opponent} ${result} - clearly stronger, kept and frozen as ${name}.`)
            }
            else if(r.score > 0.5) summary(`Round ${round}: trained vs ${opponent} ${result} - probably better, kept (not frozen yet).`)
            else {
                fs.copyFileSync(backup, botFile)
                summary(`Round ${round}: trained vs ${opponent} ${result} - not better, training undone.`)
            }
        }
        catch(e) {
            fs.copyFileSync(backup, botFile)
            summary(`Round ${round}: stopped with an error (${e.message}) - ${id} restored from before the round.`)
            process.exitCode = 1
            break
        }
        currentBackup = null
    }
    summary(`Done after ${Math.round((Date.now() - started) / 60000)} min.`)
}

// Ctrl+C mid-round: the training hasn't been measured, so put the bot back as it was.
process.on('SIGINT', _ => {
    if(currentBackup) fs.copyFileSync(currentBackup, botFile)
    summary(`Stopped by hand${currentBackup ? ` - ${id} restored from before the round` : ''}.`)
    process.exit(130)
})
main()
