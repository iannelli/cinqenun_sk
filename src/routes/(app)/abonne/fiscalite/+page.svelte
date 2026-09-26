<script lang="ts">
    import { onMount }                                    from 'svelte';
    import { invalidate }                                 from '$app/navigation';
    import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
    import type {  FiscaliteFormSchema }                  from '$lib/schemas/abonne';
    import ModalAlerte                                    from '$lib/components/ModalAlerte.svelte';
    import type { ActionResult }                          from '@sveltejs/kit';
    import { drawerInfoUtils }                            from '$lib/utils/drawerInfo';
    import { infoReprise }                                from '$lib/utils/messageInfo';
    import { fade }                                       from "svelte/transition";

    let mounted = $state(false);
    onMount(() => {
        document.body.style.cursor = '';
        mounted = true;
    });
    $effect(() => {
        if ($submitting) {
            document.body.classList.add('wait-cursor');
        } else {
            document.body.classList.remove('wait-cursor');
        }
    });

    let { data }: {
        data: {
            form:        SuperValidated<Infer<typeof FiscaliteFormSchema>>;
            dateOuvert0: string;
        };
    } = $props();
    let statuts = [
        { ind:"1", lib:"Auto-Entrepreneur[avec Franchise TVA]"},
        { ind:"2", lib:"Auto-Entrepreneur[sans Franchise TVA]"},
        { ind:"3", lib:"Indépendant[Régime Réel]"}
    ];

    // ─── Modal d'Information ─────────────────────────────────────────
    function modalInfo(): void {
        drawerInfoUtils.ouvrir({
            titre:   "Saisie des Chiffres d'Affaire réalisés hors Cinqenun",
            message: infoReprise,
            largeur: '500px',
        });
    }

    // ─── Modal d'Alerte ─────────────────────────────────────────
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');

    // ─── Reprise des CA réalisé Hors Cinqenun ────────────────────
    function extraireAnnee(dateStr: string | undefined | null): number {
        if (!dateStr || dateStr.trim() === '') return 0;
        if (dateStr.includes('/')) return parseInt(dateStr.split('/')[2] || '0', 10);
        if (dateStr.includes('-')) return parseInt(dateStr.split('-')[0] || '0', 10);
        return 0;
    }
    function parseReprise(reprise: string) {
        const p = reprise ? reprise.split('|') : [];
        return {
            prestation: { n: p[1] ?? '', n1: p[4] ?? '', n2: p[7] ?? '' },
            vente:      { n: p[2] ?? '', n1: p[5] ?? '', n2: p[8] ?? '' }
        };
    }

    // svelte-ignore state_referenced_locally
    const initialForm = data.form;
    let caReprise = $state(parseReprise(initialForm.data.reprise ?? ''));
    const {
        form: formData,
        enhance,
        submitting,
        message
    } = superForm(initialForm, {
        id: 'fiscalite',
        resetForm: false,
        onSubmit: ({ cancel, formData: fd }) => {
            const errs: string[] = [];
            const typeActivite0 = fd.get('typeActivite0')?.toString() ?? '';
            const dateDebActiv0 = fd.get('dateDebActiv0')?.toString() ?? '';
            const statutFiscal0 = fd.get('statutFiscal0')?.toString() ?? '';
            const impotIr0 =      fd.get('impotIr0')?.toString() ?? '';
            const declaTva0 =     fd.get('declaTva0')?.toString() ?? '';
            const tvaIntra =      fd.get('tvaIntra')?.toString() ?? '';
            if (typeActivite0 === '') {
                errs.push("Type d'Activité : veuillez sélectionner un type d'activité.");
            }
            if (dateDebActiv0.trim() === '') {
                errs.push("Date de début d'activité : la date est obligatoire.");
            }
            if (statutFiscal0 === '' || statutFiscal0 === '0') {
                errs.push("Statut fiscal : veuillez sélectionner un statut fiscal.");
            }
            if (impotIr0 === '') {
                errs.push("Régime d'Imposition IR : veuillez sélectionner un régime.");
            }
            const isFranchise = statutFiscal0 === '1';
            if (!isFranchise && declaTva0 === '') {
                errs.push("Déclaration de TVA : veuillez sélectionner un type de déclaration.");
            }
            if (tvaIntra.trim() === '') {
                errs.push("Numéro TVA Intracommunautaire : ce numéro est obligatoire.");
            } else if (tvaIntra.trim().length > 16) {
                errs.push("Numéro TVA Intracommunautaire : le numéro ne peut pas dépasser 16 caractères.");
            }
            if (errs.length > 0) {
                alerteTitre   = 'Erreurs de saisie';
                alerteMessage = errs.map(e => `• ${e}`).join('<br>');
                alerteVisible = true;
                cancel();
            }
        },
        onResult: ({ result }: { result: ActionResult }) => {
            if (result.type === 'success') {
                // ─── Rafraîchir le statut fiscal (cache layout) ───────────
                invalidate('app:abonne');
            }
        }
    });

    // ─── Années dérivées (après superForm) ───────────────────────
    let anOuvert = $derived(extraireAnnee(data.dateOuvert0));
    let anDeb = $derived(extraireAnnee($formData.dateDebActiv0));

    // ─── Synchroniser reprise dans le store superforms ───────────
    $effect(() => {
        $formData.reprise = [
            anOuvert, caReprise.prestation.n, caReprise.vente.n,
            anOuvert - 1, caReprise.prestation.n1, caReprise.vente.n1,
            anOuvert - 2, caReprise.prestation.n2, caReprise.vente.n2
        ].join('|');
    });
    let isN1Disabled = $derived(anDeb === anOuvert); // Colonne N-1 : bloquée si anDeb == anOuvert
    let isN2Disabled = $derived(anDeb === anOuvert || anDeb === anOuvert - 1);// Colonne N-2 : bloquée si anDeb === anOuvert ou si anDeb === anOuvert - 1
    // ─── Réinitialiser les champs désactivés ─────────────────────
    $effect(() => {
        if (isN1Disabled) {
            caReprise.prestation.n1 = '';
            caReprise.vente.n1 = '';
        }
        if (isN2Disabled) {
            caReprise.prestation.n2 = '';
            caReprise.vente.n2 = '';
        }
    });
    function filterNumeric(event: Event) {
        const target = event.target as HTMLInputElement;
        target.value = target.value.replace(/\D/g, '');
    }

    // ─── Affichage conditionnel de la section TVA ────────────────
    let showTvaSection = $derived(
        $formData.statutFiscal0 !== '' &&
        $formData.statutFiscal0 !== '0' &&
        $formData.statutFiscal0 !== '1'
    );

    // ─── Affichage conditionnel des radios IR ────────────────────
    let isAutoEntrepreneur = $derived(
        $formData.statutFiscal0 === '1' || $formData.statutFiscal0 === '2'
    );
    let isReelIndependant = $derived(
        $formData.statutFiscal0 === '3'
    );

    // Réinitialiser impotIr0 si le statut change et la valeur n'est plus compatible
    $effect(() => {
        if (isAutoEntrepreneur && ($formData.impotIr0 === '2' || $formData.impotIr0 === '3')) {
            $formData.impotIr0 = '';
        }
        if (isReelIndependant && ($formData.impotIr0 === '0' || $formData.impotIr0 === '1')) {
            $formData.impotIr0 = '';
        }
    });

    // ─── Gestion du $message serveur ─────────────────────────────
    $effect(() => {
        if ($message) {
            const timeout = setTimeout(() => { $message = ''; }, 3000);
            return () => clearTimeout(timeout);
        }
    });
</script>

<!-- ─── POPUP D'ERREURS ──────────────────────────────────────── -->
<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} onclose={()=>alerteVisible=false}/>

<!-- ─── PAGE ─────────────────────────────────────────────────── -->
{#if mounted}
    <div class="identification-page">
        <h3 class="page-title">Mon Compte : mes Données Fiscales</h3>
        {#if $message}
            <div class="alert-success" transition:fade={{ duration: 500 }}>{$message}</div>
        {/if}
        <form method="POST" action="?/update" use:enhance class="form-grid" in:fade="{{ duration: 1500 }}">
            <!-- ═══ COLONNE GAUCHE ═══════════════════════════════ -->
            <div class="col-gauche">
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Statut Fiscal</legend>
                    <div class="sg-row">
                        <div class="logo-radio-row">
                            <span class="fiscal-label">Type d'Activité</span>
                            <span class="sg-asterix">&nbsp;*&nbsp;</span>
                            <label class="logo-radio" style="margin-right:8px"><input type="radio" name="typeActivite0" value="0" bind:group={$formData.typeActivite0}> Prestation</label>
                            <label class="logo-radio" style="margin-right:8px"><input type="radio" name="typeActivite0" value="1" bind:group={$formData.typeActivite0}> Vente </label>
                            <label class="logo-radio"><input type="radio" name="typeActivite0" value="2" bind:group={$formData.typeActivite0}> Mixte (Prestation &amp; Vente)</label>
                        </div>
                    </div>
                    <div class="sg-row">
                        <div class="fiscal-row">
                            <span class="fiscal-label">Date de début d'activité</span>
                            <span class="sg-asterix" style="margin-top:2px">*</span>
                            <input type="date" name="dateDebActiv0" bind:value={$formData.dateDebActiv0} style="width:120px;font-size:14px;text-align:center;height:25px;outline:none;border:2px solid #C0C0C0">
                        </div>
                    </div>
                    <div class="sg-row">
                        <div class="fiscal-row">
                            <span class="fiscal-label">Statut fiscal</span>
                            <span class="sg-asterix" style="margin-top:2px">*</span>
                            <select id="statutFiscal0" name="statutFiscal0" class="style-select" bind:value={$formData.statutFiscal0} style="height:26px">
                                <option value="" disabled selected>Sélectionnez ...</option>
                                {#each statuts as statut (statut.ind)}
                                    <option value={statut.ind}>{statut.lib}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                </fieldset>
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende" style="display:flex;align-items:center;gap:6px">Prise en Compte du Chiffre d'Affaires réalisé hors Cinqenun
                        <button type="button" onclick={()=>modalInfo()} title="Informations sur la Saisie des Chiffres d'Affaire réalisés hors Cinqenun" style="background:none;border:none;padding:0;cursor:pointer;line-height:0">
                            <img src="/question.png" alt="Informations" width="20px" height="20px"/>
                        </button>
                    </legend>
                    <table style="width:70%; margin-left:100px">
                        <thead>
                            <tr>
                                <th style="min-width:170px">Activité</th>
                                <th class="centered">{anOuvert}</th>
                                <th class="centered">{anOuvert - 1}</th>
                                <th class="centered">{anOuvert - 2}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if $formData.typeActivite0 === '0' || $formData.typeActivite0 === '2'}
                                <tr>
                                    <td>Prestation</td>
                                    <td class="centered">
                                        <input class="tab-input" type="text" oninput={filterNumeric} bind:value={caReprise.prestation.n} />
                                    </td>
                                    <td class="centered">
                                        <input class="tab-input" type="text" oninput={filterNumeric} disabled={isN1Disabled} bind:value={caReprise.prestation.n1} />
                                    </td>
                                    <td class="centered">
                                        <input class="tab-input" type="text" oninput={filterNumeric} disabled={isN2Disabled} bind:value={caReprise.prestation.n2} />
                                    </td>
                                </tr>
                            {/if}
                            {#if $formData.typeActivite0 === '1' || $formData.typeActivite0 === '2'}
                                <tr>
                                    <td>Vente</td>
                                    <td class="centered">
                                        <input class="tab-input" type="text" oninput={filterNumeric} bind:value={caReprise.vente.n} />
                                    </td>
                                    <td class="centered">
                                        <input class="tab-input" type="text" oninput={filterNumeric} disabled={isN1Disabled} bind:value={caReprise.vente.n1} />
                                    </td>
                                    <td class="centered">
                                        <input class="tab-input" type="text" oninput={filterNumeric} disabled={isN2Disabled} bind:value={caReprise.vente.n2} />
                                    </td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </fieldset>
            </div>

            <!-- ═══ COLONNE DROITE ═══════════════════════════════ -->
            <div class="col-droite">
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Déclaration fiscale</legend>
                    <div class="sg-row" style="align-items:center">
                        <!-- Boutons radio Choix du Régime d'Imposition IR -->
                        <div class="logo-radio-row">
                            <span class="fiscal-label">Régime d'Imposition IR</span>
                            <span class="sg-asterix">*&nbsp;</span>
                            {#if isAutoEntrepreneur}
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="impotIr0" value="0" bind:group={$formData.impotIr0}> Micro BNC</label>
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="impotIr0" value="1" bind:group={$formData.impotIr0}> Micro BIC</label>
                            {:else if isReelIndependant}
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="impotIr0" value="2" bind:group={$formData.impotIr0}> Réel BNC</label>
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="impotIr0" value="3" bind:group={$formData.impotIr0}> Réel BIC</label>
                            {:else}
                                <span style="font-size:11px;color:#999;font-style:italic">Sélectionnez un statut fiscal</span>
                            {/if}
                        </div>
                    </div>
                    {#if showTvaSection}
                        <div class="sg-row">
                            <!-- Boutons radio Choix du Type de Déclaration de TVA -->
                            <div class="logo-radio-row">
                                <span class="fiscal-label">Déclaration de TVA</span>
                                <span class="sg-asterix">*&nbsp;</span>
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="declaTva0" value="0" bind:group={$formData.declaTva0}> CA12</label>
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="declaTva0" value="1" bind:group={$formData.declaTva0}> CA3M</label>
                                <label class="logo-radio" style="margin-right:8px"><input type="radio" name="declaTva0" value="2" bind:group={$formData.declaTva0}> CA3T</label>
                            </div>
                        </div>
                    {/if}
                    {#if isAutoEntrepreneur}
                        <div class="sg-row sg-row-checkbox">
                            <span class="fiscal-label">Versement libératoire IR</span>
                            <span class="sg-asterix" style="color:white">*</span>
                            <input id="versLib0" name="versLib0" type="checkbox" bind:checked={$formData.versLib0}>
                        </div>
                    {/if}
                </fieldset>
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Autres Informations Fiscales</legend>
                    <div class="sg-row">
                        <span class="sg-asterix">*</span>
                        <div class="sg-field sg-w-full">
                            <input id="tvaIntra" name="tvaIntra" type="text" class="sg-input" placeholder=" " bind:value={$formData.tvaIntra} maxlength="16" style="width:280px">
                            <label for="tvaIntra" class="sg-label">Numéro TVA Intracommunautaire</label>
                        </div>
                    </div>
                    <div class="sg-row sg-row-checkbox">
                        <span class="sg-asterix" style="color:white">*&nbsp;</span>
                        <span>Adhérent Association Agréée&nbsp;</span>
                        <input id="temoinAsso" name="temoinAsso" type="checkbox" bind:checked={$formData.temoinAsso}>
                    </div>
                </fieldset>
            </div>
            <!-- ═══ BOUTON ═══════════════════════════════════════ -->
            <input type="hidden" name="reprise" bind:value={$formData.reprise}>
            <div class="form-footer">
                <button type="submit" class="sg-button" style="font-size:12px;height:30px" disabled={$submitting}>Enregistrer mes modifications</button>
            </div>
        </form>
    </div>
{/if}

<style>
    /* PAGE ═══════════════════════════════════════════════════════ */
    .identification-page {
        max-width: 85%;
        margin: 0 auto;
        padding: 10px 16px 30px;
        font-family: Verdana, Geneva, Tahoma, sans-serif;
        font-size: 13px;
        color: #333;
    }
    .page-title {
        text-align: center;
        font-size: 15px;
        font-weight: bold;
        color: #444;
        margin: 8px 0 30px;
    }
    .fiscal-label {
        display: inline-block;
        width: 180px;
        text-align: right;
        font-size: 12px;
        color: #555;
        /*font-weight: bold;*/
        flex-shrink: 0;
    }
    .style-select {
        height: 28px;
        padding: 2px 8px;
        border: 1.5px solid #83807f;
        border-radius: 3px;
        font-size: 12px;
        font-family: inherit;
        color: #333;
        background: #fff;
        outline: none;
        cursor: pointer;
        transition: border-color 0.2s, box-shadow 0.2s;
    }
    .style-select:focus {
        border-color: #7b3b2e;
        box-shadow: 0 0 0 2px rgba(123, 59, 46, 0.15);
    }
    .fiscal-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .alert-success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
        border-radius: 4px;
        padding: 8px 14px;
        text-align: center;
        margin-bottom: 12px;
        font-size: 13px;
    }
    /* GRILLE 2 COLONNES ═════════════════════════════════════════ */
    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px 20px;
        align-items: start;
    }
    .col-gauche, .col-droite {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    table {
        border-collapse: collapse;
        font-family: sans-serif;
    }
    th, td {
        border: 1px solid #ccc;
        padding: 4px;
    }
    .centered {
        text-align: center;
    }
    .tab-input {
        width: 80%;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 5px;
        text-align: center;
    }
    .tab-input:disabled {
        background-color: #f5f5f5;
        cursor: not-allowed;
        color: #999;
    }
</style>