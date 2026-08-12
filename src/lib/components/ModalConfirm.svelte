<script lang="ts">
    import { onMount } from 'svelte';

    // ─── Props ────────────────────────────────────────────────────
    let {
        titre          = 'Confirmation',
        message        = 'Confirmez-vous cette action ?',
        labelConfirm   = 'Confirmer',
        labelAnnuler   = 'Abandonner',
        labelAutre,
        visible        = $bindable(false),
        onconfirm,
        onannuler,
        onautre,
    }: {
        titre         ?: string;
        message       ?: string;
        labelConfirm  ?: string;
        labelAnnuler  ?: string;
        labelAutre    ?: string;
        visible        : boolean;
        onconfirm      : () => void;
        onannuler     ?: () => void;
        onautre       ?: () => void;
    } = $props();

    // ─── Dialog ref ───────────────────────────────────────────────
    let dialog = $state<HTMLDialogElement | null>(null);

    onMount(() => {
        if (visible) dialog?.showModal();
    });
    $effect(() => {
        if (visible) dialog?.showModal();
        else         dialog?.close();
    });

    // ─── Handlers ─────────────────────────────────────────────────
    function handleConfirm() {
        visible = false;
        onconfirm();
    }
    function handleAnnuler() {
        visible = false;
        onannuler?.();
    }
    function handleAutre() {
        visible = false;
        onautre?.();
    }
</script>

<dialog bind:this={dialog} class="sg-divDialog" style="max-width:480px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);margin:0" aria-labelledby="confirm-titre" aria-modal="true">
    <fieldset class="sg-fieldset">
        <legend id="confirm-titre" class="sg-legende" style="font-size:14px;color:#dc2626">⚠ {titre}</legend>
        <p style="font-size:14px;color:#334155;line-height:1.7;padding:0.5rem;margin:0">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html message}
        </p>
        <div class="sg-dialogFooter">
            <button type="button" class="sg-button" onclick={handleAnnuler}>{labelAnnuler}</button>
            {#if labelAutre && onautre}
                <button type="button" class="sg-button" onclick={handleAutre}>{labelAutre}</button>
            {/if}
            <button type="button" class="sg-button" style="background:#dc2626;color:white;border-color:#dc2626" onclick={handleConfirm}>{labelConfirm}</button>
        </div>
    </fieldset>
</dialog>