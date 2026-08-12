<script lang="ts">
    import { resolve } from '$app/paths';

    let { data } = $props();
    // ─── Modale de bienvenue ─────────────────────────────────────
    // svelte-ignore state_referenced_locally
    let showWelcomeModal = $state(!!data.welcome);
</script>

<!-- MODALE DE BIENVENUE ──────────────────────────────────────────── -->
{#if showWelcomeModal && data.welcome}
    <div class="modal-overlay">
        <div class="modal-card">
            <h2 class="modal-title">Bienvenue dans l'application Cinqenun !</h2>
            <div class="modal-credentials">
                <p class="modal-warning">Votre adresse email a été confirmée avec succès.</p>
                <div class="modal-fields">
                    <p><span class="modal-label">E-mail de connexion :</span> {data.welcome.email}</p>
                </div>
            </div>
            <p class="modal-info">
                Vous bénéficiez d'un essai gratuit de 30 jours.<br>
                Veuillez compléter votre inscription en remplissant les données de votre compte.
            </p>
            <div class="modal-actions">
                <button class="btn-close-modal" onclick={() => (showWelcomeModal = false)}>Commencer</button>
            </div>
        </div>
    </div>
{/if}

<!-- PAGE HUB ABONNÉ ──────────────────────────────────────────────── -->
<div class="abonne-page">
    <div class="page-header">
        <h1>Mon compte</h1>
    </div>
    <div class="abonne-nav-cards">
        <!-- Carte Identification -->
        <a href={resolve('/abonne/identification')} class="nav-card">
            <div class="nav-card-icon">🏢</div>
            <div class="nav-card-content">
                <h2>Identification</h2>
                <p class="nav-card-summary">
                    {data.identite.raisonSociale0 || 'Non renseigné'}
                    {#if data.identite.ville0}
                        — {data.identite.ville0}
                    {/if}
                </p>
                <p class="nav-card-detail">Raison sociale, adresse, contact, SIREN, IBAN, logo</p>
            </div>
            <span class="nav-card-arrow">→</span>
        </a>
        <!-- Carte Fiscalité -->
        <a href={resolve('/abonne/fiscalite')} class="nav-card">
            <div class="nav-card-icon">📋</div>
            <div class="nav-card-content">
                <h2>Fiscalité</h2>
                <p class="nav-card-summary">
                    {data.statut.typeActivite0 || 'Non renseigné'}
                    {#if data.statut.statutFiscal0}
                        — {data.statut.statutFiscal0}
                    {/if}
                </p>
                <p class="nav-card-detail">Type d'activité, statut fiscal, TVA, IR, versement libératoire</p>
            </div>
            <span class="nav-card-arrow">→</span>
        </a>
        <!-- Carte Abonnement -->
        <a href={resolve('/abonne/abonnement')} class="nav-card">
            <div class="nav-card-icon">📦</div>
            <div class="nav-card-content">
                <h2>Abonnement</h2>
                <p class="nav-card-summary">
                    {#if data.abonnement.numAbonne0}
                        N° {data.abonnement.numAbonne0}
                        — {data.abonnement.etatAbonne0 || 'État inconnu'}
                    {:else}
                        Non renseigné
                    {/if}
                </p>
                <p class="nav-card-detail">Numéro, dates, état et solde de l'abonnement</p>
            </div>
            <span class="nav-card-arrow">→</span>
        </a>
    </div>
</div>