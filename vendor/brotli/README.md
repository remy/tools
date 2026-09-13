# brotli

`decode.js` is the official Brotli JavaScript decoder from
https://github.com/google/brotli (`js/decode.js`), MIT licensed.

Vendored because WOFF2 fonts are Brotli compressed and no browser exposes a
Brotli `DecompressionStream`. Used by `/font-features` to read the tables out
of a `.woff2` file.
