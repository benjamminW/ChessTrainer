// Lets Node (with its built-in type stripping) import the app's TypeScript modules, whose
// relative imports leave out the ".ts" extension the way Vite allows. Used by the scripts:
//   node --import ./scripts/ts-resolve.mjs scripts/verify-lessons.mjs
import { registerHooks } from 'node:module';

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.\.?\//.test(spec) || /\.[a-z]+$/i.test(spec)) throw e;
      try {
        return next(spec + '.ts', ctx);
      } catch {
        return next(spec + '/index.ts', ctx);
      }
    }
  },
});
