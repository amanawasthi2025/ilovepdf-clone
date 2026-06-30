import process from 'node:process'

process.stdout.write('[worker] Document processing worker starting\n')

process.on('SIGTERM', () => {
  process.stdout.write('[worker] Received SIGTERM, shutting down gracefully\n')
  process.exit(0)
})

process.on('SIGINT', () => {
  process.stdout.write('[worker] Received SIGINT, shutting down gracefully\n')
  process.exit(0)
})
