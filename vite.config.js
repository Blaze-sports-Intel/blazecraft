import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  // Build configuration
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,

    // Build as library for integration with existing app
    lib: {
      entry: resolve(__dirname, 'src/react/index.jsx'),
      name: 'BlazeCraftReact',
      fileName: (format) => `blazecraft-react.${format}.js`,
      formats: ['es', 'umd'],
    },

    rollupOptions: {
      // Externalize deps that shouldn't be bundled
      external: ['three'],
      output: {
        globals: {
          three: 'THREE',
        },
        // Ensure CSS is extracted
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'blazecraft-react.css';
          }
          return assetInfo.name;
        },
      },
    },

    // Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    },
  },

  // Development server
  server: {
    port: 3000,
    open: false,
    cors: true,

    // Proxy API requests to Cloudflare Workers
    proxy: {
      '/api': {
        target: 'https://blazecraft.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },

  // Preview server (for testing production builds)
  preview: {
    port: 4173,
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@react': resolve(__dirname, 'src/react'),
      '@components': resolve(__dirname, 'src/react/components'),
      '@hooks': resolve(__dirname, 'src/react/hooks'),
      '@stores': resolve(__dirname, 'src/react/stores'),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'framer-motion'],
  },

  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
