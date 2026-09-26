<script lang="ts">
    import { resolve } from '$app/paths';

    let { data } = $props();
</script>

<div class="verify-page">
    <div class="verify-card">
        {#if data.status === 'success'}
            <div class="icon-success">✓</div>
            <h1>Adresse email confirmée !</h1>
            <p>Votre adresse email a été vérifiée avec succès.</p>
            <p class="instruction">
                Vous pouvez fermer cet onglet et retourner sur la page d'inscription.<br>
                Votre compte sera créé automatiquement.
            </p>
        {:else}
            <div class="icon-error">✕</div>
            <h1>Erreur de vérification</h1>
            <p>{data.errorMessage}</p>
            <a href={resolve('/register')} class="btn-secondary">Retour à l'inscription</a>
        {/if}
    </div>
</div>

<style>
    .verify-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 80vh;
    }
    .verify-card {
        text-align: center;
        background: #fff;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
        padding: 2rem;
        max-width: 420px;
        width: 100%;
    }
    .icon-success {
        width: 60px;
        height: 60px;
        margin: 0 auto 1rem;
        border-radius: 50%;
        background: #d4edda;
        color: #155724;
        font-size: 1.5rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .icon-error {
        width: 60px;
        height: 60px;
        margin: 0 auto 1rem;
        border-radius: 50%;
        background: #fef2f2;
        color: #b91c1c;
        font-size: 1.5rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    h1 {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0 0 0.5rem;
    }
    p {
        color: #64748b;
        margin: 0 0 1rem;
    }
    .instruction {
        color: #1e40af;
        font-weight: 600;
        font-size: 0.9rem;
        background: #eff6ff;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #bfdbfe;
    }
    .btn-secondary {
        display: inline-block;
        padding: 0.6rem 1.5rem;
        border: 1px solid #2563eb;
        color: #2563eb;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.875rem;
    }
    .btn-secondary:hover { background: #eff6ff; }
</style>