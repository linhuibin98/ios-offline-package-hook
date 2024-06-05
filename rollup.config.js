 // https://www.typescriptlang.org/docs/handbook/tsconfig-json.html
import typescript from '@rollup/plugin-typescript';
import { uglify } from 'rollup-plugin-uglify';
import banner from 'rollup-plugin-banner';

function useUglify(debug = false) {
    return debug ? [] : [uglify()];
}

export default {
	input: 'src/index.ts',
    plugins: [
        typescript(),
        ...useUglify(process.env.CODE_DEBUG),
        banner(
            `v<%= pkg.version %> on ${new Date().valueOf()}`
        ),
    ],
    output: {
		file: 'dist/index.umd.js',
		format: 'umd',
        name: 'offlineAjaxHookBridge',
        amd: {
            id: 'lib/fetch.js',
            name: 'HookFetch',
        },
    },
};
