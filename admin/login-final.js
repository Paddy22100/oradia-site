// Script final pour admin/login.html
// Remplacer complètement le script existant (lignes 213-370)

<script>
// Éléments DOM
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const eyeIcon = document.getElementById('eyeIcon');
const messageContainer = document.getElementById('messageContainer');

// Afficher un message
function showMessage(message, type = 'error') {
    messageContainer.innerHTML = `
        <div class="${type}-message px-4 py-3 rounded-lg text-sm">
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : 'check-circle'} mr-2"></i>
            ${message}
        </div>
    `;
    messageContainer.classList.remove('hidden');
    
    // Masquer après 5 secondes
    setTimeout(() => {
        messageContainer.classList.add('hidden');
    }, 5000);
}

// Vérifier si déjà connecté au chargement
async function checkExistingSession() {
    try {
        const response = await fetch('/api/admin/me', {
            credentials: 'include'
        });
        
        if (response.ok) {
            // Session valide, rediriger vers dashboard
            window.location.href = 'dashboard-admin.html';
            return true;
        }
    } catch (error) {
        // Session invalide ou erreur, rester sur login
        console.log('Session non valide ou expirée');
    }
    return false;
}

// Gérer la connexion
async function handleLogin(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Validation basique
    if (!email || !password) {
        showMessage('Veuillez remplir tous les champs.', 'error');
        return;
    }

    // Désactiver le bouton
    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Connexion...';

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('Connexion réussie! Redirection...', 'success');
            
            // Rediriger vers le dashboard
            setTimeout(() => {
                window.location.href = 'dashboard-admin.html';
            }, 1500);
        } else {
            showMessage(result.message || 'Identifiants incorrects', 'error');
        }
    } catch (error) {
        showMessage('Erreur de connexion. Réessayez plus tard.', 'error');
        console.error('Erreur login:', error);
    } finally {
        // Réactiver le bouton
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Se connecter';
    }
}

// Toggle mot de passe
togglePassword.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    eyeIcon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
});

// Gérer le "Se souvenir de moi"
document.getElementById('remember').addEventListener('change', (e) => {
    if (e.target.checked) {
        localStorage.setItem('rememberedEmail', emailInput.value);
    } else {
        localStorage.removeItem('rememberedEmail');
    }
});

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier si déjà connecté
    const isLoggedIn = await checkExistingSession();
    if (isLoggedIn) {
        return; // Redirection déjà en cours
    }

    // Restaurer email remembered
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        document.getElementById('remember').checked = true;
    }

    // Attacher les événements
    loginForm.addEventListener('submit', handleLogin);
});
</script>
