import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';

export default defineConfig({
    plugins: [
        sveltekit(),
        compression({ algorithm: 'brotliCompress' }),
        compression({ algorithm: 'gzip' })
    ],
    build: {
        target: 'esnext',
        cssMinify: true
    }
});