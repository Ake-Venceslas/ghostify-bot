// ai.js - Intégration OpenAI pour Ghostify Bot
const OpenAI = require('openai');
const log = require('./logger')(module);

// Configuration
const config = {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 300,
    timeout: parseInt(process.env.OPENAI_TIMEOUT) || 15000, // 15 secondes
};

// Initialisation OpenAI
let openai = null;

function initOpenAI() {
    if (!config.apiKey) {
        log('⚠️ OPENAI_API_KEY non défini - les réponses AI sont désactivées');
        return false;
    }
    openai = new OpenAI({ 
        apiKey: config.apiKey,
        timeout: config.timeout,
    });
    log('✅ OpenAI initialisé avec succès');
    return true;
}

// System prompt court pour performance
const SYSTEM_PROMPT = `Tu es Ghostify, assistant IA WhatsApp. Sois intelligent, un peu drôle, calme et concis. Réponds en 1-2 phrases max. Français par défaut.`;

// Rate Limiter simple en mémoire
class RateLimiter {
    constructor(maxRequests = 5, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    isRateLimited(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];

        // Nettoyer les anciennes requêtes
        const validRequests = userRequests.filter(ts => now - ts < this.windowMs);

        if (validRequests.length >= this.maxRequests) {
            return true;
        }

        validRequests.push(now);
        this.requests.set(userId, validRequests);
        return false;
    }

    getRemainingTime(userId) {
        const userRequests = this.requests.get(userId) || [];
        if (userRequests.length === 0) return 0;

        const oldest = Math.min(...userRequests);
        const remaining = this.windowMs - (Date.now() - oldest);
        return Math.max(0, Math.ceil(remaining / 1000));
    }

    cleanup() {
        const now = Date.now();
        for (const [userId, requests] of this.requests.entries()) {
            const valid = requests.filter(ts => now - ts < this.windowMs);
            if (valid.length === 0) {
                this.requests.delete(userId);
            } else {
                this.requests.set(userId, valid);
            }
        }
    }
}

// Instance du rate limiter
const rateLimiter = new RateLimiter(
    parseInt(process.env.RATE_LIMIT_MAX) || 5,
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000
);

// Nettoyage périodique
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

/**
 * Génère une réponse AI avec OpenAI
 * @param {string} message - Le message de l'utilisateur
 * @param {string} userId - L'ID de l'utilisateur pour le rate limiting
 * @param {string} userName - Le nom de l'utilisateur
 * @returns {Promise<{success: boolean, response?: string, error?: string}>}
 */
async function generateResponse(message, userId, userName = 'Utilisateur') {
    // Vérifier si OpenAI est configuré
    if (!openai) {
        return {
            success: false,
            error: "L'IA n'est pas configurée. Contactez l'admin.",
        };
    }

    // Vérifier le rate limit
    if (rateLimiter.isRateLimited(userId)) {
        const waitTime = rateLimiter.getRemainingTime(userId);
        return {
            success: false,
            rateLimited: true,
            error: `Doucement ! 😅 Tu envoies trop de requêtes. Réessaie dans ${waitTime} secondes.`,
        };
    }

    try {
        const startTime = Date.now();
        const completion = await openai.chat.completions.create({
            model: config.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: message },
            ],
            max_tokens: config.maxTokens,
            temperature: 0.7,
        });
        log(`Réponse générée en ${Date.now() - startTime}ms`);

        const response = completion.choices[0]?.message?.content?.trim();

        if (!response) {
            return {
                success: false,
                error: "Je n'ai pas pu générer de réponse. Réessaie !",
            };
        }

        log(`AI réponse générée pour ${userName}`);
        return { success: true, response };

    } catch (error) {
        log(`Erreur OpenAI: ${error.message}`);

        if (error.status === 429) {
            return {
                success: false,
                error: "Je reçois trop de requêtes en ce moment. Attends un peu ! 🙏",
            };
        }

        if (error.status === 401) {
            return {
                success: false,
                error: "Problème d'authentification API. Contacte l'admin.",
            };
        }

        return {
            success: false,
            error: "Une erreur est survenue lors du traitement. 😕",
        };
    }
}

/**
 * Vérifie si l'IA est disponible
 */
function isAIAvailable() {
    return openai !== null;
}

module.exports = {
    initOpenAI,
    generateResponse,
    isAIAvailable,
    rateLimiter,
};
