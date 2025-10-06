module.exports = {
    name: "about",
    run: async ({ sock, msg }) => {
        const from = msg.key.remoteJid;

        const text = `
🤖 *ghostify-Bot*
Version : 1.1.0
Auteur : VENCESLAS
Description : Bot WhatsApp multifonctions basé sur Baileys
⚡ Fonctions : Audio, Sticker, Mini-jeux, Admin, Utilitaires et plus

📱 Suivez l'auteur :
- GitHub : https://github.com/Ake-Venceslas
- TikTok : https://www.tiktok.com/@junior_dollarx?_t=ZM-90Ju3D9b79v&_r=1
        `;

        await sock.sendMessage(from, { text });
    }
};