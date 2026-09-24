import { defineConfig } from 'tsup';

export default defineConfig( {
	entry: [ 'src/index.ts' ],
	format: [ 'esm', 'cjs' ],
	target: 'es2019',
	// tsup sets the deprecated `baseUrl` internally for the declaration build.
	dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
	clean: true,
	sourcemap: true,
} );
