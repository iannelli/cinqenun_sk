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
    },
    optimizeDeps: {
        include: [
          '@tiptap/core',
          '@tiptap/starter-kit',
          '@tiptap/extension-text-style',
          '@tiptap/extensions',
          'pdfmake/build/pdfmake',
          'pdfmake/build/vfs_fonts',
          'pdf-lib',
          'sveltekit-superforms',
          'sveltekit-superforms/adapters',
          'zod'
        ]
      }
});