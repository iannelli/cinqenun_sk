<script>
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { fly }     from 'svelte/transition';

    let mounted = $state(false);
    onMount(() => { mounted = true; });
</script>

<div class="main">
    {#if mounted}
        <div class="logout-container" transition:fly={{y:-250, duration:2000}}>
            <div class="logout-card">
                <div class="banniere">
                    <p><span style="position:relative;left:20px;font-weight:bold">Déconnexion</span><span style="margin-left:80px;font-weight:bold">ERP Cinqenun &nbsp; &nbsp;</span></p>
                    <div class="logoPosition"><img src="/stopweb.png" alt=""/></div>
                </div>
                <h2>Vous êtes déconnecté</h2>
                <p style="margin-top:-10px; margin-bottom:20px">Votre session a bien été fermée.</p>
                <a href={resolve('/login')} class="sg-button" style="width:120px;height:30px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;">Se connecter</a>
            </div>
        </div>
    {/if}
</div>

<style>
    .main {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f0f4f8;
        display: flex;
        justify-content: center;
        align-items: center;
        /*height: 98vh;*/
        height: 100vh;
        margin: 0;
    }
    .logout-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 80vh;
        background-color: #f5f5f5;
    }
    .logout-card {
        background: white;
        border-radius: 12px;
        padding: 40px 20px 40px 40px; /* haut | droite | bas | gauche */
        text-align: center;
        box-shadow: rgba(0, 0, 0, 0.25) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }
    h2 {
        text-align: center;
        color: #2c2c2c;
        font-size: 1.5rem;
        font-weight: 700;
    }
    .banniere {
        background-color: rgb(155, 186, 219);
        height: 35px;
        line-height: 35px;
        color: white;
        margin-top: -20px;
        margin-bottom: 20px;
    }
    .logoPosition {
        position: relative;
        top: -40px;
        left: -155px;
        z-index: 0;
    }
</style>