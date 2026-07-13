import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this app from a subfolder (/mealcraft/), not the
// domain root, so the production GH Pages build needs a matching base path.
// Local dev/preview stay at "/" — only the deploy workflow sets GH_PAGES=true.
export default defineConfig({
  base: process.env.GH_PAGES ? '/mealcraft/' : '/',
  plugins: [react()],
})
