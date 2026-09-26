<script lang="ts">
    import { drawerInfoUtils } from '$lib/utils/drawerInfo';
    import { fly }             from 'svelte/transition';
    import { tick }            from 'svelte';

    let dialog = $state<HTMLDialogElement | null>(null);

    $effect(() => {
        if ($drawerInfoUtils.visible) {
            tick().then(() => dialog?.showModal());
        } else {
            dialog?.close();
        }
    });
</script>

<dialog bind:this={dialog} style="position:fixed;top:0;right:0;width:{$drawerInfoUtils.largeur};height:100%;max-height:100%;margin:0;padding:0;border:none;background:transparent;overflow:visible">
    {#if $drawerInfoUtils.visible}
        <!-- ── Overlay ──────────────────────────────────────────── -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.2)" onclick={()=>drawerInfoUtils.fermer()}></div>
            <!-- ── Drawer ───────────────────────────────────────────── -->
            <div role="dialog" aria-modal="true" aria-labelledby="drawer-titre"
            transition:fly={{x:1200, duration:800, opacity:1}}
            style="position:fixed;top:0;right:0;width:{$drawerInfoUtils.largeur};height:100vh;background:white;box-shadow:-4px 0 20px rgba(0,0,0,0.15);display:flex;flex-direction:column">
            <!-- En-tête -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#9BBADB;color:white;flex-shrink:0">
                <h3 id="drawer-titre" style="margin:0;font-size:14px;font-weight:700">{$drawerInfoUtils.titre}</h3>
                <button onclick={()=>drawerInfoUtils.fermer()} title="Fermer" aria-label="Fermer" class="btn-fermer">✕</button>
            </div>
            <!-- Corps — scroll ici -->
            <div style="padding:20px;font-size:13px;line-height:1.7;flex:1;overflow-y:auto;min-height:0">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html $drawerInfoUtils.message}
            </div>
            <!-- Pied -->
            <div style="padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;flex-shrink:0;background:white">
                <button onclick={()=>drawerInfoUtils.fermer()} style="padding:6px 20px;background:#9BBADB;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;">Fermer</button>
            </div>
        </div>
    {/if}
</dialog>

<style>
    @keyframes slideIn {
        from { transform: translateX(100%); }
        to   { transform: translateX(0); }
    }
    .btn-fermer {
        background: none;
        border: none;
        cursor: pointer;
        color: white;
        font-size: 18px;
        line-height: 1;
        padding: 4px 6px;
        border-radius: 4px;
        transition: background-color 0.2s ease;
    }
    .btn-fermer:hover {
        background-color: rgba(255, 255, 255, 0.25);
        color: red;
    }
    .btn-fermer:active {
        background-color: rgba(255, 255, 255, 0.4);
    }
</style>