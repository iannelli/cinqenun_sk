<script lang="ts">
    import { page } from '$app/stores';
    import AuthForm from '$lib/components/AuthForm.svelte';

    let { data } = $props();
  
    let waitingForConfirmation = $state(false);
    let pollingEmail = $state('');
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
  
    // Écouter le résultat de l'action (message de superforms)
    $effect(() => {
        const formResult = $page.form;
        const msg = formResult?.form?.message;
        const email = formResult?.form?.data?.email;
        if (msg && typeof msg === 'string' && msg.includes('email de confirmation') && email) {
            waitingForConfirmation = true;
            pollingEmail = email;
            startPolling();
        }
    });
    function startPolling() {
        if (pollingInterval) return;
        pollingInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/check-confirmation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: pollingEmail }),
                });
                const result = await res.json();
                if (result.confirmed) {
                    stopPolling();
                    setTimeout(() => {
                        window.location.href = `/abonne/identification?welcome=1&e=${btoa(pollingEmail)}`;
                    }, 200);
                }
            } catch {
                // Silencieux, on réessaie au prochain tick
            }
        }, 3000);
    }
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
</script>
  
{#if waitingForConfirmation}
    <div class="main">
        <div class="card">
            <div class="waiting-icon">📧</div>
            <h2>Vérifiez votre boîte mail</h2>
            <p class="waiting-text">Un email de confirmation a été envoyé à <strong>{pollingEmail}</strong>.</p>
            <p class="waiting-text">Cliquez sur le lien dans l'email pour activer votre compte.</p>
            <div class="waiting-spinner"></div>
            <p class="waiting-hint">En attente de confirmation…</p>
        </div>
    </div>
    {:else}
        <AuthForm mode="register" {data} />
    {/if}
  
<style>
    .main {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f0f4f8;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
    }
    .card {
        background: white;
        padding: 2.5rem 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        width: 100%;
        max-width: 420px;
        text-align: center;
    }
    .waiting-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }
    h2 {
        color: #2c2c2c;
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1rem;
    }
    .waiting-text {
        color: #475569;
        font-size: 0.9rem;
        margin-bottom: 0.5rem;
        line-height: 1.5;
    }
    .waiting-spinner {
        margin: 1.5rem auto;
        width: 32px;
        height: 32px;
        border: 3px solid #e2e8f0;
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .waiting-hint {
        color: #94a3b8;
        font-size: 0.82rem;
        font-style: italic;
    }
  </style>