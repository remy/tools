"use strict";

/* Shared helpers. Loaded first; everything below may use these. */

/* Warnings surface in the sidebar rather than a dialog: none of them stop a
   board loading, but several change how far you should trust a net. */
const warnings = [];
const warn = m => { if (!warnings.includes(m)) warnings.push(m); };

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
