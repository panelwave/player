// node --test scripts/build-standalone.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { moduleSyntaxProblems, rewriteIndexHtml, wrapAsClassicScript } from './build-standalone.mjs';

test('a classic bundle passes', () => {
  assert.deepEqual(moduleSyntaxProblems('var a=1;(()=>{const importer=2;console.log("import x")})();'), []);
});

test('module syntax is reported', () => {
  assert.deepEqual(moduleSyntaxProblems('import{a}from"./x.js";a();'), ['top-level import statement']);
  assert.deepEqual(moduleSyntaxProblems('var a=1;export{a};'), ['top-level export statement']);
  assert.deepEqual(moduleSyntaxProblems('console.log(import.meta.url)'), ['import.meta']);
  assert.deepEqual(moduleSyntaxProblems('x.then(()=>import("./chunk-1.js"))'), ['dynamic import()']);
});

test('index.html tags become classic deferred scripts under player/', () => {
  const html =
    '<head><link rel="stylesheet" href="styles.css"></head><body><script src="panelwave.js"></script>' +
    '<script src="polyfills.js" type="module"></script><script src="main.js" type="module"></script></body>';
  const out = rewriteIndexHtml(html);
  assert.match(out, /<link rel="stylesheet" href="player\/styles\.css">/);
  assert.match(out, /<script src="player\/polyfills\.js" defer><\/script><script src="player\/main\.js" defer><\/script>/);
  assert.doesNotMatch(out, /type="module"/);
});

test('a wrapped bundle keeps its top-level vars out of the global scope', () => {
  const context = vm.createContext({ name: '' });
  vm.runInContext(wrapAsClassicScript('var name = {proto: 1}; globalThis.seen = typeof name;\n//# trailing comment'), context);
  assert.equal(context.seen, 'object');
  assert.equal(context.name, '');
});

test('a wrapped bundle runs in strict mode', () => {
  const context = vm.createContext({});
  vm.runInContext(wrapAsClassicScript('globalThis.strict = (function () { return this; })() === undefined;'), context);
  assert.equal(context.strict, true);
});
