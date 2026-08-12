<script lang="ts">
    import { onMount } from 'svelte';

    // ─── Props ────────────────────────────────────────────────────
    let {
        titre,
        message,
        visible  = $bindable(false),
        redirect = false,
        onclose,
        onok,
    }: {
        titre    : string;
        message  : string;
        visible  : boolean;
        redirect?: boolean;
        onclose  : () => void;
        onok?    : () => void;
    } = $props();

    // ─── Dialog ref ───────────────────────────────────────────────
    let dialog = $state<HTMLDialogElement | null>(null);
    onMount(() => {
        if (visible) dialog?.showModal();
    });

    // ─── Réactivité : ouvre / ferme selon visible ─────────────────
    $effect(() => {
        if (visible) dialog?.showModal();
        else         dialog?.close();
    });

    // ─── Handler OK ───────────────────────────────────────────────
    function handleOk() {
        visible = false;
        onok?.();
        if (redirect) onclose();
    }
</script>

<dialog bind:this={dialog} class="sg-divDialog" style="max-width:600px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);margin:0" aria-labelledby="alerte-titre-{titre.replace(/\s/g, '-')}" aria-modal="true">
    <fieldset class="sg-fieldset">
        <legend id="alerte-titre-{titre.replace(/\s/g, '-')}" class="sg-legende" style="font-size:14px;color:#dc2626"> ⚠ {titre}</legend>
        <p style="font-size:14px;color:#334155;line-height:1.7;padding:0.5rem;margin:0">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html message}
        </p>
        <div class="sg-dialogFooter">
            <button type="button" class="sg-button" onclick={handleOk}>OK</button>
        </div>
    </fieldset>
</dialog>