// Script final pour admin/dashboard-admin.html
// À ajouter à la fin du fichier, avant </body>

<script>
// État global
let currentData = {
    overview: null,
    preorders: [],
    donors: [],
    waitlist: []
};

// Charger les données du dashboard
async function loadDashboardData() {
    try {
        // Vérifier la session admin
        const meResponse = await fetch('/api/admin/me', { credentials: 'include' });
        if (!meResponse.ok) {
            console.log('Session non valide, redirection vers login');
            window.location.href = 'login.html';
            return;
        }

        const meData = await meResponse.json();
        console.log('Admin connecté:', meData.admin);

        // Charger les KPI
        await Promise.all([
            loadOverview(),
            loadPreorders(),
            loadDonors(),
            loadWaitlist()
        ]);

        console.log('Dashboard chargé avec succès');

    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
        showMessage('Erreur de chargement du dashboard', 'error');
        window.location.href = 'login.html';
    }
}

// Charger les KPI overview
async function loadOverview() {
    const response = await fetch('/api/admin/overview', { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
        currentData.overview = data.data;
        updateKPIs(data.data);
    } else {
        throw new Error(data.message || 'Erreur overview');
    }
}

// Charger les précommandes
async function loadPreorders(page = 1, limit = 10) {
    const response = await fetch(`/api/admin/preorders?page=${page}&limit=${limit}`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
        currentData.preorders = data.data;
        updatePreordersTable(data.data, data.pagination);
    } else {
        throw new Error(data.message || 'Erreur précommandes');
    }
}

// Charger les dons
async function loadDonors(page = 1, limit = 10) {
    const response = await fetch(`/api/admin/donors?page=${page}&limit=${limit}`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
        currentData.donors = data.data;
        updateDonorsTable(data.data, data.pagination);
    } else {
        throw new Error(data.message || 'Erreur dons');
    }
}

// Charger la waitlist
async function loadWaitlist(page = 1, limit = 10) {
    const response = await fetch(`/api/admin/waitlist?page=${page}&limit=${limit}`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
        currentData.waitlist = data.data;
        updateWaitlistTable(data.data, data.pagination);
    } else {
        throw new Error(data.message || 'Erreur waitlist');
    }
}

// Mettre à jour les KPI
function updateKPIs(data) {
    // Précommandes
    updateElement('preordersCount', data.preorders.count);
    updateElement('preordersTotal', formatCurrency(data.preorders.total));
    
    // Dons
    updateElement('donorsCount', data.donors.count);
    updateElement('donorsTotal', formatCurrency(data.donors.total));
    
    // Waitlist
    updateElement('waitlistCount', data.waitlist.count);
    
    // Global
    updateElement('globalTotal', formatCurrency(data.global.total));
    updateElement('totalContacts', data.global.totalContacts);
    
    // Stats techniques
    updateElement('preordersNoEmail', data.preorders.noEmail);
    updateElement('donorsNoEmail', data.donors.noEmail);
    updateElement('waitlistNotSynced', data.waitlist.notSynced);
}

// Mettre à jour un élément du DOM
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// Formater la monnaie
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

// Mettre à jour le tableau des précommandes
function updatePreordersTable(preorders, pagination) {
    const tbody = document.querySelector('#preordersTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = preorders.map(preorder => `
        <tr>
            <td>${formatDate(preorder.created_at)}</td>
            <td>${preorder.email || '-'}</td>
            <td>${preorder.full_name || '-'}</td>
            <td>${preorder.offer || '-'}</td>
            <td>${formatCurrency(preorder.amount_total)}</td>
            <td><span class="badge ${getStatusClass(preorder.paid_status)}">${preorder.paid_status}</span></td>
            <td>${preorder.city || '-'}</td>
        </tr>
    `).join('');
    
    updatePagination('preorders', pagination);
}

// Mettre à jour le tableau des dons
function updateDonorsTable(donors, pagination) {
    const tbody = document.querySelector('#donorsTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = donors.map(donor => `
        <tr>
            <td>${formatDate(donor.created_at)}</td>
            <td>${donor.email || '-'}</td>
            <td>${donor.full_name || '-'}</td>
            <td>${formatCurrency(donor.amount_total)}</td>
            <td><span class="badge ${getStatusClass(donor.paid_status)}">${donor.paid_status}</span></td>
        </tr>
    `).join('');
    
    updatePagination('donors', pagination);
}

// Mettre à jour le tableau de la waitlist
function updateWaitlistTable(waitlist, pagination) {
    const tbody = document.querySelector('#waitlistTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = waitlist.map(item => `
        <tr>
            <td>${item.email || '-'}</td>
            <td>${item.full_name || '-'}</td>
            <td>${formatDate(item.created_at)}</td>
            <td><span class="badge ${item.brevo_synced ? 'success' : 'warning'}">${item.brevo_synced ? 'Sync' : 'Non sync'}</span></td>
        </tr>
    `).join('');
    
    updatePagination('waitlist', pagination);
}

// Formater la date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Obtenir la classe CSS pour le statut
function getStatusClass(status) {
    switch (status) {
        case 'completed': return 'success';
        case 'pending': return 'warning';
        case 'failed': return 'danger';
        default: return 'secondary';
    }
}

// Mettre à jour la pagination
function updatePagination(table, pagination) {
    const container = document.querySelector(`#${table}Pagination`);
    if (!container) return;
    
    container.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="text-sm text-gray-700">
                Affichage de ${(pagination.page - 1) * pagination.limit + 1} à ${Math.min(pagination.page * pagination.limit, pagination.total)} sur ${pagination.total} résultats
            </span>
            <div class="flex gap-2">
                ${pagination.page > 1 ? `<button onclick="load${table.charAt(0).toUpperCase() + table.slice(1)}(${pagination.page - 1})" class="px-3 py-1 bg-gray-200 rounded">Précédent</button>` : ''}
                ${pagination.page < pagination.pages ? `<button onclick="load${table.charAt(0).toUpperCase() + table.slice(1)}(${pagination.page + 1})" class="px-3 py-1 bg-gray-200 rounded">Suivant</button>` : ''}
            </div>
        </div>
    `;
}

// Exporter les contacts
function exportContacts() {
    window.location.href = '/api/admin/contacts-export';
}

// Déconnexion
async function logout() {
    try {
        await fetch('/api/admin/logout', {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Erreur déconnexion:', error);
        window.location.href = 'login.html';
    }
}

// Rafraîchir les données
function refreshData() {
    loadDashboardData();
}

// Afficher un message
function showMessage(message, type = 'info') {
    // Implémentation simple pour le moment
    console.log(`${type}: ${message}`);
    // TODO: Implémenter une vraie notification
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    
    // Attacher les événements aux boutons
    const exportBtn = document.getElementById('exportContactsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportContacts);
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }
});
</script>
