/**
 * Système de sécurité et validation des entrées utilisateur
 * Protection contre XSS, injections et attaques automatisées
 */

class SecurityValidator {
    constructor() {
        this.xssPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe/gi,
            /<object/gi,
            /<embed/gi,
            /<link/gi,
            /<meta/gi,
            /<style/gi,
            /expression\s*\(/gi,
            /@import/gi,
            /vbscript:/gi,
            /data:text\/html/gi,
            /data:text\/javascript/gi
        ];

        this.sqlPatterns = [
            /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
            /(--|\/\*|\*\/|;|'|")/gi,
            /\b(or|and)\s+\d+\s*=\s*\d+/gi,
            /\b(or|and)\s+['"].*['"]\s*=\s*['"].*['"]/gi
        ];

        this.maxFieldLengths = {
            name: 100,
            email: 254,
            message: 2000,
            intention: 500,
            subject: 200
        };
    }

    /**
     * Nettoie une chaîne de caractères pour prévenir XSS
     */
    sanitizeString(input, maxLength = null) {
        if (typeof input !== 'string') {
            return '';
        }

        // Limiter la longueur
        if (maxLength && input.length > maxLength) {
            input = input.substring(0, maxLength);
        }

        // Supprimer les patterns XSS
        let sanitized = input;
        this.xssPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });

        // Échapper les caractères HTML spéciaux
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

        // Nettoyer les espaces excessifs
        sanitized = sanitized.replace(/\s+/g, ' ').trim();

        return sanitized;
    }

    /**
     * Valide un email
     */
    validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return { valid: false, error: 'Email requis' };
        }

        const sanitized = this.sanitizeString(email, this.maxFieldLengths.email);
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitized)) {
            return { valid: false, error: 'Format email invalide' };
        }

        // Vérifications supplémentaires de sécurité
        if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.endsWith('.')) {
            return { valid: false, error: 'Format email invalide' };
        }

        return { valid: true, value: sanitized.toLowerCase() };
    }

    /**
     * Valide un nom/prénom
     */
    validateName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Nom requis' };
        }

        const sanitized = this.sanitizeString(name, this.maxFieldLengths.name);
        
        if (sanitized.length < 2) {
            return { valid: false, error: 'Nom trop court (minimum 2 caractères)' };
        }

        // Permettre seulement les lettres, espaces, tirets et apostrophes
        const nameRegex = /^[a-zA-Zàáâäãåāăçćčďđèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõṕṙřßśšşșťțûüùúūǘůűųẃẍÿýžźżçñæœ\s'-]+$/;
        if (!nameRegex.test(sanitized)) {
            return { valid: false, error: 'Nom contient des caractères invalides' };
        }

        return { valid: true, value: sanitized };
    }

    /**
     * Valide un message ou intention
     */
    validateMessage(message, fieldName = 'message') {
        if (!message || typeof message !== 'string') {
            return { valid: false, error: `${fieldName} requis` };
        }

        const maxLength = fieldName === 'intention' ? this.maxFieldLengths.intention : this.maxFieldLengths.message;
        const sanitized = this.sanitizeString(message, maxLength);

        if (sanitized.length < (fieldName === 'intention' ? 3 : 10)) {
            return { valid: false, error: `${fieldName} trop court` };
        }

        // Vérifier les patterns d'injection SQL
        for (const pattern of this.sqlPatterns) {
            if (pattern.test(sanitized)) {
                return { valid: false, error: 'Contenu invalide détecté' };
            }
        }

        return { valid: true, value: sanitized };
    }

    /**
     * Valide un formulaire complet
     */
    validateForm(formData, schema) {
        const errors = {};
        const sanitized = {};

        for (const [field, rules] of Object.entries(schema)) {
            const value = formData[field];
            let result = { valid: true };

            // Validation selon le type
            switch (rules.type) {
                case 'email':
                    result = this.validateEmail(value);
                    break;
                case 'name':
                    result = this.validateName(value);
                    break;
                case 'message':
                case 'intention':
                    result = this.validateMessage(value, rules.type);
                    break;
                case 'text':
                    result = this.validateText(value, rules.maxLength || 255);
                    break;
                case 'checkbox':
                    result = this.validateCheckbox(value);
                    break;
            }

            if (!result.valid) {
                errors[field] = result.error;
            } else {
                sanitized[field] = result.value;
            }
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors,
            sanitized
        };
    }

    /**
     * Valide un champ texte simple
     */
    validateText(text, maxLength = 255) {
        if (!text || typeof text !== 'string') {
            return { valid: false, error: 'Champ requis' };
        }

        const sanitized = this.sanitizeString(text, maxLength);

        if (sanitized.length < 1) {
            return { valid: false, error: 'Champ requis' };
        }

        return { valid: true, value: sanitized };
    }

    /**
     * Valide une case à cocher
     */
    validateCheckbox(value) {
        return { valid: true, value: Boolean(value) };
    }

    /**
     * Génère un token CSRF
     */
    generateCSRFToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Vérifie si une requête semble être d'un bot
     */
    detectBot(requestData) {
        const suspiciousPatterns = [
            /bot/i,
            /crawler/i,
            /spider/i,
            /scraper/i,
            /curl/i,
            /wget/i,
            /python/i,
            /java/i,
            /node/i
        ];

        const userAgent = requestData.userAgent || '';
        const referer = requestData.referer || '';
        
        // Vérifier l'user agent
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(userAgent)) {
                return true;
            }
        }

        // Vérifier le referer vide pour les formulaires POST
        if (requestData.method === 'POST' && !referer) {
            return true;
        }

        // Vérifier la vitesse de soumission (trop rapide = bot probable)
        if (requestData.submissionTime && requestData.formLoadTime) {
            const timeDiff = requestData.submissionTime - requestData.formLoadTime;
            if (timeDiff < 2000) { // Moins de 2 secondes
                return true;
            }
        }

        return false;
    }
}

// Créer une instance globale
window.SecurityValidator = SecurityValidator;

// Fonctions utilitaires pour les formulaires
window.FormSecurity = {
    validator: new SecurityValidator(),
    
    // Sécuriser un formulaire
    secureForm(formElement, schema) {
        if (!formElement) return null;

        const formData = new FormData(formElement);
        const data = {};
        
        // Convertir FormData en objet
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        // Valider et nettoyer
        return this.validator.validateForm(data, schema);
    },

    // Ajouter un token CSRF à un formulaire
    addCSRFToken(formElement) {
        if (!formElement) return;

        let tokenInput = formElement.querySelector('input[name="csrf_token"]');
        if (!tokenInput) {
            tokenInput = document.createElement('input');
            tokenInput.type = 'hidden';
            tokenInput.name = 'csrf_token';
            formElement.appendChild(tokenInput);
        }

        tokenInput.value = this.validator.generateCSRFToken();
    },

    // Enregistrer le temps de chargement du formulaire
    recordFormLoadTime(formElement) {
        if (!formElement) return;

        let timeInput = formElement.querySelector('input[name="form_load_time"]');
        if (!timeInput) {
            timeInput = document.createElement('input');
            timeInput.type = 'hidden';
            timeInput.name = 'form_load_time';
            formElement.appendChild(timeInput);
        }

        timeInput.value = Date.now();
    }
};

// Protection contre les attaques XSS dans l'affichage
window.safeHTML = (html) => {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
};
