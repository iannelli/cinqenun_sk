<script lang="ts">
    import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
    import type { AbonnementFormSchema }                  from '$lib/schemas/abonne';
    import type { ActionResult }                          from '@sveltejs/kit';

    let { data }: {
        data: {
            form: SuperValidated<Infer<typeof AbonnementFormSchema>>;
        };
    } = $props();

    // svelte-ignore state_referenced_locally
    const initialForm = data.form;
    const {
        form: formData,
        errors,
        enhance,
        submitting,
        message
    } = superForm(initialForm, {
        id: 'abonnement',
        resetForm: false,
        onResult: ({ result }: { result: ActionResult }) => {
            if (result.type === 'success') {
                // Message géré par $message
            }
        }
    });
    $effect(() => {
        if ($message) {
            const timeout = setTimeout(() => { $message = ''; }, 3000);
            return () => clearTimeout(timeout);
        }
    });
</script>

<div class="abonne-page">
    {#if $message}
        <div class="alert alert-success">{$message}</div>
    {/if}
    <div class="form-card">
        <form method="POST" use:enhance>
            <div class="form-row">
                <div class="form-group">
                    <label for="numAbonne0">N° abonné</label>
                    <input id="numAbonne0" name="numAbonne0" type="text" bind:value={$formData.numAbonne0} />
                    {#if $errors.numAbonne0}
                        <span class="field-error">{$errors.numAbonne0}</span>
                    {/if}
                </div>
                <div class="form-group">
                    <label for="etatAbonnement0">État</label>
                    <input id="etatAbonne0" name="etatAbonne0" type="text" bind:value={$formData.etatAbonne0} />
                    {#if $errors.etatAbonne0}
                        <span class="field-error">{$errors.etatAbonne0}</span>
                    {/if}
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="dateOuvert0">Date ouverture</label>
                    <input id="dateOuvert0" name="dateOuvert0" type="text" bind:value={$formData.dateOuvert0} />
                    {#if $errors.dateOuvert0}
                        <span class="field-error">{$errors.dateOuvert0}</span>
                    {/if}
                </div>
                <div class="form-group">
                    <label for="dateFerme0">Date fermeture</label>
                    <input id="dateFerme0" name="dateFerme0" type="text" bind:value={$formData.dateFerme0} />
                    {#if $errors.dateFerme0}
                        <span class="field-error">{$errors.dateFerme0}</span>
                    {/if}
                </div>
            </div>
            <div class="form-group">
                <label for="soldeAbonnement0">Solde</label>
                <input id="soldeAbonne0" name="soldeAbonne0" type="text" bind:value={$formData.soldeAbonne0} />
                {#if $errors.soldeAbonne0}
                    <span class="field-error">{$errors.soldeAbonne0}</span>
                {/if}
            </div>
            <div class="form-footer">
                <button type="submit" class="btn-submit" disabled={$submitting}>{$submitting ? 'En cours…' : 'Enregistrer'} </button>
            </div>
        </form>
    </div>
</div>