const fs = require("fs");
const path = require("path");

module.exports = {
    name: "help",
    description: "Affiche la liste des commandes disponibles",
    run: async ({ sock, msg }) => {
        const from = msg.key.remoteJid;

        // Récupère tous les fichiers .js du dossier commands sauf help.js & about.js
        const commandFiles = fs.readdirSync(__dirname)
            .filter(f => f.endsWith(".js") && !["help.js", "about.js"].includes(f))
            .sort();

        const commandList = commandFiles.map(f => {
            const filePath = path.join(__dirname, f);
            delete require.cache[require.resolve(filePath)]; // éviter le cache
            const cmd = require(filePath);
            return `• *${cmd.name}* – ${cmd.description || "Pas de description"}`;
        }).join("\n");

        const text = `📜 *Liste des commandes disponibles :*\n\n${commandList}`;

        // Envoie l'image logo.jpg avec la liste des commandes
        const logoPath = path.join(__dirname, "..", "mugi.jpg");
        if (fs.existsSync(logoPath)) {
            await sock.sendMessage(from, {
                image: { url: logoPath },
                caption: text
            });
        } else {
            await sock.sendMessage(from, { text: text + "\n\n⚠️ Logo non trouvé (logo.jpg)" });
        }
    }
};