// Worker threads for bot training, separate from the pool that plays live bot moves, so training
// never slows down people's games. One training game per worker at a time.
const { Worker } = require('worker_threads')
const os = require('os')
const path = require('path')

const POOL_SIZE = Math.max(1, Math.min(6, os.cpus().length - 1))

const workers = []
const queue = []
let nextJobId = 1

const spawn = _ => {
    const entry = { worker: new Worker(path.join(__dirname, 'trainWorker.js')), job: null }
    entry.worker.on('message', msg => {
        const job = entry.job
        if(!job || msg.jobId != job.jobId) return
        if(msg.type == 'move') return job.onMove?.(msg)
        entry.job = null
        if(msg.type == 'done') job.resolve(msg)
        else job.reject(new Error(msg.error))
        pump()
    })
    entry.worker.on('error', e => {
        entry.job?.reject(e)
        entry.job = null
        const i = workers.indexOf(entry)
        if(i >= 0) workers[i] = spawn()
        pump()
    })
    return entry
}

const pump = _ => {
    for(const entry of workers){
        if(entry.job || !queue.length) continue
        const job = queue.shift()
        entry.job = job
        entry.worker.postMessage({ jobId: job.jobId, ...job.payload })
    }
}

// Resolves to { result, plies }. onMove(msg) is called for every move as it's played.
const playTrainingGame = (payload, onMove) => new Promise((resolve, reject) => {
    while(workers.length < POOL_SIZE) workers.push(spawn())
    queue.push({ jobId: nextJobId++, payload, onMove, resolve, reject })
    pump()
})

// Lets the process exit when training is over (idle workers otherwise keep Node alive).
const shutdown = _ => { for(const e of workers.splice(0)) e.worker.terminate() }

module.exports = { playTrainingGame, shutdown, POOL_SIZE }
