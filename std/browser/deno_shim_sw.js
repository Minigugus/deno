// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.

// A Service Worker that transpile `.ts` import on the fly like the Deno runtime

importScripts('https://unpkg.com/typescript@3.9.5/lib/typescript.js');

self.DenoSw = (function () {
  const DENO_TS_CACHE_NAME = 'deno-cache-v1';

  async function transpile(response) {
    const content = await response.text();
    const out = ts.transpileModule(content, {
      compilerOptions: {
        allowJs: true,
        inlineSourceMap: true,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        sourceMap: true
      },
      fileName: response.url
    });
    return new Response(out.outputText, response);
  }

  async function postProcess(req, response) {
    const url = new URL(req.url);
    let content = await response.text();
    if (url.hash === '#main') // Main module detection hack
      content = `console.debug("%cCompile%c %s", "color: green;", "color: unset;", import.meta.url);import.meta.main=!0;${content}`;
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/javascript; charset=utf-8');
    return new Response(content, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  function appendExtension(url, ext) {
    const uri = new URL(url);
    uri.pathname += ext;
    return uri.toString();
  }

  async function transpileAndCache(e) {
    let response = new Response(null, { status: 500, statusText: 'Internal Service-Worker Error' });
    try {
      const cache = await caches.open(DENO_TS_CACHE_NAME);
      response = await cache.match(e.request.url);
      if (!response) { // Not cached yet
        console.debug('%cDownload%c %s', 'color: green;', 'color: unset;', e.request.url);
        response = await fetch(e.request);
        if (!response.ok) // Request failed
          throw new Error(`The server returned status code ${response.status} ${response.statusText}`);
        if (
          e.request.url.endsWith('.ts') ||
          (response.headers.has('content-type') && response.headers.get('content-type').includes('typescript'))
        ) {
          const compiledUrl = appendExtension(response.url, '.js');
          if (!(await cache.match(compiledUrl))) { // TypeScript file not compiled yet
            response = await transpile(response);
            cache.put(compiledUrl, response.clone());
          }
          response = new Response(null, {
            status: 307,
            statusText: 'Compiled',
            headers: {
              'Location': compiledUrl
            }
          });
        }
        cache.put(e.request, response.clone());
      }
      return await postProcess(e.request, response);
    } catch (err) {
      console.debug('%cerror%c: %s', 'color: red; font-weight: bold;', 'color: unset; font-weight: unset;', err.message || err);
    }
    return response;
  }

  return {
    transpileAndCache
  };
})();
