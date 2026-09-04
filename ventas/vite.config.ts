import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// En dev, /data.json = ../data/ventas.json (el corte real de ventas_kommo.py) sin
// copiarlo a public/: así nunca entra al build ni al repo.
function corteLocal(): Plugin {
  const archivo = path.resolve(__dirname, '..', 'data', 'ventas.json')
  return {
    name: 'corte-local',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/data.json') return next()
        if (!fs.existsSync(archivo)) { res.statusCode = 404; return res.end('{"error":"sin corte"}') }
        res.setHeader('Content-Type', 'application/json'); fs.createReadStream(archivo).pipe(res)
      })
    },
  }
}

// base relativa: el build se sirve bajo /ventas/ desde app.py
export default defineConfig({
  plugins: [react(), corteLocal()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
})
