// logger.js
// Try to require chalk in a way that's safe for both CommonJS and ESM export shapes.
let chalk;
try {
    // Some versions of chalk are ESM-only and when required from CJS they appear under .default
    const _chalk = require('chalk');
    chalk = _chalk && _chalk.default ? _chalk.default : _chalk;
} catch (err) {
    // If chalk isn't installed or cannot be required, use a no-op fallback that preserves a compatible API.
    const noop = (s) => s;
    noop.bold = noop;
    noop.italic = noop;
    chalk = {
        gray: noop,
        cyan: noop,
    };
}

const util = require('util'); // On importe l'outil d'inspection de Node.js
const path = require('path');

function getTimestamp() {
    return `[${new Date().toLocaleTimeString('fr-FR')}]`;
}

module.exports = function (caller) {
    const tag = caller?.filename ? caller.filename.split(/\\|\//).pop().replace('.js', '').toUpperCase() : 'LOG';
    
    return function (...args) {
        // --- LA CORRECTION EST ICI ---
        const message = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                // Utilise util.inspect pour une conversion sûre des objets, même circulaires.
                // depth: 4 montre 4 niveaux de l'objet, ce qui est suffisant pour le débogage.
                return util.inspect(arg, { depth: 4, colors: true });
            }
            return arg;
        }).join(' ');
        
        // Use chalk if available and chainable, otherwise fall back to plain strings.
        const ts = getTimestamp();
        const tsColored = (chalk && chalk.gray && typeof chalk.gray.italic === 'function') ? chalk.gray.italic(ts) : ts;
        const tagStr = `[${tag}]`;
        const tagColored = (chalk && chalk.cyan && typeof chalk.cyan.bold === 'function') ? chalk.cyan.bold(tagStr) : tagStr;

        console.log(`${tsColored} ${tagColored} ${message}`);
    };
};