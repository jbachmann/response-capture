import ts from 'typescript';
import type { Plugin } from 'vite';

// Vite's default transform omits the metadata used by Nest DI and validation.
export function typescriptMetadata(): Plugin {
  return {
    name: 'typescript-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('/node_modules/')) {
        return;
      }
      const result = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          sourceMap: true,
        },
      });
      return { code: result.outputText, map: result.sourceMapText };
    },
  };
}
