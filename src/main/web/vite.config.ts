import { defineConfig } from 'vite'

const quickTunnelHosts = ['.trycloudflare.com']
const agentProxy = {
  '/ws': {
    target: 'ws://127.0.0.1:9001',
    ws: true
  }
}

export default defineConfig({
  base: './',
  server: {
    allowedHosts: quickTunnelHosts,
    proxy: agentProxy
  },
  preview: {
    allowedHosts: quickTunnelHosts,
    proxy: agentProxy
  }
})
