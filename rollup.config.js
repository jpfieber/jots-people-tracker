import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
    input: 'src/main.ts',
    output: {
        file: 'dist/main.js',
        format: 'cjs',
        exports: 'default',
        sourcemap: 'inline',
        globals: {
            obsidian: 'obsidian'
        }
    },
    external: ['obsidian'],
    plugins: [
        nodeResolve(),
        commonjs(),
        typescript({
            tsconfig: './tsconfig.json',
            sourceMap: true,
        }),
        terser(),
    ],
};