// database.js
const Database = require('better-sqlite3');
const db = new Database('./bot.db');
const log = require('./logger')(module); // Utilise le logger pour la cohérence

try {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            firstSeen TEXT,
            commandCount INTEGER DEFAULT 0
        )
    `).run();
    log('Connexion à SQLite (better-sqlite3) réussie.');
} catch (err) {
    console.error('Erreur initialisation DB:', err);
    throw err;
}

function getOrRegisterUser(userId, name) {
    return new Promise((resolve, reject) => {
        try {
            const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            if (row) return resolve(row);

            const firstSeen = new Date().toISOString();
            db.prepare('INSERT INTO users (id, name, firstSeen) VALUES (?, ?, ?)').run(userId, name, firstSeen);
            log(`Nouvel utilisateur enregistré : ${name} (${userId})`);
            resolve({ id: userId, name, firstSeen, commandCount: 0 });
        } catch (err) {
            reject(err);
        }
    });
}

function incrementCommandCount(userId) {
    return new Promise((resolve, reject) => {
        try {
            db.prepare('UPDATE users SET commandCount = commandCount + 1 WHERE id = ?').run(userId);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

function getTotalUsers() {
    return new Promise((resolve, reject) => {
        try {
            const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
            resolve(row.count || 0);
        } catch (err) {
            reject(err);
        }
    });
}

function getTotalCommands() {
    return new Promise((resolve, reject) => {
        try {
            const row = db.prepare('SELECT COALESCE(SUM(commandCount), 0) as total FROM users').get();
            resolve(row.total || 0);
        } catch (err) {
            reject(err);
        }
    });
}


// --- ON S'ASSURE QU'ELLES SONT BIEN EXPORTÉES ---
module.exports = {
    getOrRegisterUser,
    incrementCommandCount,
    getTotalUsers,
    getTotalCommands,
};