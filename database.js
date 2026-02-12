// database.js - Stockage JSON simple (pas de compilation requise)
const fs = require('fs');
const path = require('path');
const log = require('./logger')(module);

const DB_FILE = path.join(__dirname, 'data.json');

// Structure de données
let data = {
    users: {}
};

// Charger les données au démarrage
function loadData() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            data = JSON.parse(raw);
            log('Base de données JSON chargée.');
        } else {
            saveData();
            log('Base de données JSON créée.');
        }
    } catch (err) {
        console.error('Erreur chargement DB:', err);
        data = { users: {} };
    }
}

// Sauvegarder les données
function saveData() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Erreur sauvegarde DB:', err);
    }
}

// Initialisation
loadData();

function getOrRegisterUser(userId, name) {
    return new Promise((resolve) => {
        if (data.users[userId]) {
            return resolve(data.users[userId]);
        }

        const user = {
            id: userId,
            name: name,
            firstSeen: new Date().toISOString(),
            commandCount: 0
        };

        data.users[userId] = user;
        saveData();
        log(`Nouvel utilisateur enregistré : ${name} (${userId})`);
        resolve(user);
    });
}

function incrementCommandCount(userId) {
    return new Promise((resolve) => {
        if (data.users[userId]) {
            data.users[userId].commandCount++;
            saveData();
        }
        resolve();
    });
}

function getTotalUsers() {
    return new Promise((resolve) => {
        resolve(Object.keys(data.users).length);
    });
}

function getTotalCommands() {
    return new Promise((resolve) => {
        const total = Object.values(data.users).reduce(
            (sum, user) => sum + (user.commandCount || 0), 0
        );
        resolve(total);
    });
}

module.exports = {
    getOrRegisterUser,
    incrementCommandCount,
    getTotalUsers,
    getTotalCommands,
};