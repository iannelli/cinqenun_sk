<script lang="ts">
    import { onMount }    from 'svelte';
    import { untrack } from 'svelte';
    import type { Facture } from '$lib/schemas/facture';
    import { type FactureTotauxState, parseTotal, type TotalRow, createFactureTotauxState } from '$lib/schemas/facture';
    import { traitLigneTotal, traitLibTotaux, traitColSpan } from '$lib/utils/fonctionsTotaux';
    import { onlyNumeric } from '$lib/utils/numeric';
    import ModalConfirm from '$lib/components/ModalConfirm.svelte';

    // ─── Valeurs initiales pour détection des modifications ──────────
    let acompTauxInitial = $state<string | number | null>(null);
    let dateReglInitial  = $state<string | null | undefined>(null);

    // ─── Confirmation fermeture si modifications non enregistrées ────
    let confirmCloseVisible = $state(false);

    // ─── Snapshot initial + initialisation totaux en mode update ─────
    let initialized = false; // variable simple, non réactive → pas de boucle$

    // ─── Modale de confirmation pour l'imputation ────────────────────
    let confirmImputVisible = $state(false);
    let confirmImputMessage = $state('');
    let imputSituation = $state<'aucune' | 'plafonne' | 'partielle' | null>(null);

    $effect(() => {
        if (!facture) return;
        if (untrack(() => acompTauxInitial) === null) {
            acompTauxInitial = facture.acompTaux ?? null;
            dateReglInitial  = facture.dateRegl  ?? null;
        }
        if (!initialized && facture.total) {
            initialized = true;
            // ── Synchroniser imputAcomp0 depuis totState vers totaux ──────
            totaux.imputAcomp0 = totState.imputAcomp0;
            // Synchroniser également les autres champs acompte nécessaires
            totaux.acompMontArray0 = totState.acompMontArray0;
            totaux.acompteId0      = totState.acompteId0;
            totaux.acompPresta0    = totState.acompPresta0;
            totaux.acompVente0     = totState.acompVente0;
            if (totState.imputAcomp0 === '3') {
                traitLigneTotal(facture, totaux);
            } else {
                traitLibTotaux(facture, totaux);
                traitColSpan(facture, totaux);
            }
        }
    });

    // APRÈS — prop reçue du parent
    let {
        facture   = $bindable(null),
        totaux    = $bindable(createFactureTotauxState()),
        totState,
        client,
        mode      = 'create',
        onrefresh, // eslint-disable-line @typescript-eslint/no-unused-vars
        onImputationConfirmee,
    }: {
        facture: Facture | null;
        totaux:  FactureTotauxState;
        totState: FactureTotauxState;
        client:  { soldeCredit: number | null } | null;
        mode:    'create' | 'update';
        onrefresh: () => void;
        onImputationConfirmee?: (montant: number) => void;
    } = $props();

    // Lignes de totalisation dérivées de facture.total
    let totalRows: TotalRow[] = $state([]);
    $effect(() => {
        if (!facture?.total) {
            totalRows = [];
            return;
        }
        const parsed = parseTotal(facture.total);
        totalRows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    });
    let vuImputSoldeClient0 = $state(false);
    let montantImputerSaisi = $state(0);

    onMount(() => {
        if (!facture || !client) return;
        vuImputSoldeClient0 = false;
        montantImputerSaisi = 0;
        // Condition d'Affichage de la Saisie d'une Imputation d'un Excédent d'Encaissement ---
        if (facture.codeType == 30 && facture.refFac.slice(0,2) == 'FB') {
            if ((facture.imputCreCli ?? 0) > 0) {
                vuImputSoldeClient0 = true;
            }
        }
    });

    // Traitement du champ de Saisie du Taux d'Acompte
    function saisieAcompte(e: Event) {
        if (!facture) return;
        const val = (e.target as HTMLInputElement).value;
        if (val.length == 0 || Number(val) == 0) {
            traitLigneTotal(facture, totaux);
            traitLibTotaux(facture, totaux);
            traitColSpan(facture, totaux);
        } else {
            traitLigneTotal(facture, totaux);
        }
    }
    // Examen des Conditions d'Exécution du Traitement d'Imputation d'un excédent d'encaissement ────────────────────────────
    function imputExcedentEncais(): void {
        if (!facture) return;
        const soldeActuel  = parseFloat(String(facture.solde ?? '0').replace(',', '.')) || 0;
        const montantSaisi = Number(montantImputerSaisi) || 0;
        // §II. Mode Modification : ne traiter que s'il y a une différence ---
        if (mode === 'update') {
            const imputCreCliActuel = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
            if (montantSaisi === imputCreCliActuel) {
                return;   // aucune différence détectée : rien à faire
            }
        }
        // §I.1 — Algorithme de traitement -----
        if (montantSaisi === 0) {
            imputSituation      = 'aucune';
            confirmImputMessage = "Aucune imputation du Crédit Client. Confirmez-vous ?";
            confirmImputVisible = true;
            return;
        }
        if (montantSaisi >= soldeActuel) {
            // §I.2
            imputSituation      = "plafonne";
            confirmImputMessage = "Le montant Imputé a été plafonné au montant du Solde de la Facture<br>Confirmez-vous cette Imputation ?";
            confirmImputVisible = true;
        } else {
            // §I.3
            imputSituation      = 'partielle';
            confirmImputMessage = "Confirmez-vous cette Imputation ?";
            confirmImputVisible = true;
        }
    }
    // ─── Confirmation de l'imputation (déclenchée par la ModalConfirm) ──
    function confirmerImputation(): void {
        confirmImputVisible = false;
        if (!facture) return;
        const soldeActuel = parseFloat(String(facture.solde ?? '0').replace(',', '.')) || 0;
        switch (imputSituation) {
            case 'aucune':
                break;
            case 'plafonne': {
                montantImputerSaisi = soldeActuel;
                facture.solde       = 0;
                facture.imputCreCli = soldeActuel;
                facture.statutCode  = 21;
                facture.statut      = "<mark style='background:white;color:#0488fd'>Facture Réglée";
                onImputationConfirmee?.(soldeActuel);   // ← vérifier présence
                break;
            }
            case 'partielle': {
                const montantSaisi = Number(montantImputerSaisi) || 0;
                facture.solde       = soldeActuel - montantSaisi;
                facture.imputCreCli = montantSaisi;
                onImputationConfirmee?.(montantSaisi);   // ← vérifier présence
                break;
            }
        }
        imputSituation = null;
    }
    function abandonImputation(): void {
        confirmImputVisible = false;
        imputSituation       = null;
    }

    function hasUnsavedChanges(): boolean {
        if (!facture) return false;
        return (
            String(facture.acompTaux ?? '') !== String(acompTauxInitial ?? '') ||
            (facture.dateRegl ?? '')        !== (dateReglInitial ?? '')
        );
    }
    function confirmCloseTotaux(onClose: () => void): void {
        if (hasUnsavedChanges()) {
            confirmCloseVisible = true;
            pendingClose = onClose;
        } else {
            onClose();
        }
    }
    let pendingClose = $state<(() => void) | null>(null);
    export { hasUnsavedChanges, confirmCloseTotaux };
</script>

<div class="divTotal">
    <div style="display:flex;flex-direction:row;justify-content:center;color:#8BA5B6;font-size:13px;font-weight:bold">
        <span style="width:43%;margin-top:3px;margin-right:10px"><hr style="border:none;border-top:1px solid #8BA5B6"/></span>Totalisation<span style="width:43%;margin-top:3px;margin-left:10px;height:1px"><hr style="border:none;border-top:1px solid #8BA5B6"/></span>
    </div>
    {#if facture}
        <div class="form-row" style="display:flex;flex-direction:row;justify-content:center">
            {#if facture.codeType == 10}
                <div style="margin-top:10px">
                    <label for="" class="inline-label">% Acompte&nbsp;&nbsp;</label>
                    <input type="text" class="inline-input" style="margin-top:-3px;text-align:center" bind:value={facture.acompTaux} onblur={(e)=>saisieAcompte(e)} onkeydown={(e)=>onlyNumeric(e)} maxlength="2"/>
                </div>
            {/if}
            {#if facture.codeType == 10 && mode === 'update' && Number(facture.acompTaux) == 0}
                <div style="margin-top:10px">
                    <label for="" class="inline-label">Date Accord&nbsp;&nbsp;</label>
                    <input type="date" bind:value={facture.dateRegl} style="width:120px;height:25px;float:left;font-size:13px;padding-top:2px;margin-top:-3px"/>
                    <button title="Ré-initialiser la date" onclick={()=>facture.dateRegl=''} class="btnDate">&nbsp;⛌</button>
                </div>
            {/if}
            <!-- Condition d'Affichage de la Saisie du Montant d'Excédent d’Encaissement à Imputer sur le Total TTC de la Facture -->
            {#if vuImputSoldeClient0 == true}
                <div class="saisieEntete" style="margin-left:10px; margin-right:10px">
                    <div class="sg-row">
                        <div class="sg-field" style="flex:1">
                            <input id="montImput1" name="montImput1" type="text" class="sg-input" placeholder=" " value={client?.soldeCredit ?? 0} readonly>
                            <label for="montImput1" class="sg-label">Crédit Client</label>
                        </div>
                        <div class="sg-field" style="flex:0.8">
                            <input id="montImput2" name="montImput2" type="text" class="sg-input" placeholder=" " bind:value={montantImputerSaisi}>
                            <label for="montImput2" class="sg-label">Montant Imputé</label>
                        </div>
                        <button type="submit" class="sg-button" style="font-size:12px;height:30px" disabled={Number(montantImputerSaisi) === 0} onclick={()=>imputExcedentEncais()}>Imputer</button>
                    </div>
                </div>
            {/if}
        </div>
        <!--  Table des Lignes de Totalisation  -->
        <table class="tableTotal">
            <thead>
                <tr>
                    <th style="width:40%">Totalisation</th>
                    {#if facture.regimeTva == 'B'}
                        <th style="width:13%">Brut HT</th>
                    {/if}
                    {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3'}
                        <th style="width:11%">Acompte HT</th>
                    {/if}
                    {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3'}
                        <th style="width:13%">Net Ht</th>
                    {/if}
                    {#if facture.regimeTva == 'B'}
                        <th style="width:11%">Tva</th>
                    {/if}
                    <th style="width:14%">Total Ttc</th>
                </tr>
            </thead>
            <tbody>
            <!--  Lignes de Totalisations ─────────────────────────────────────────── -->
                {#if totalRows.length > 0}
                    {#each totalRows as total, i (i)}
                        <tr>
                            <td style="text-align:left">{total.libelle0}</td>
                            {#if facture.regimeTva == 'B'}
                                <td>{total.montBrut0}</td>
                            {/if}
                            {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3'}
                                <td>{total.acompteImputation0}</td>
                            {/if}
                            {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3'}
                                <td>{total.montHt0}</td>
                            {/if}
                            {#if facture.regimeTva == 'B'}
                                <td>{total.montTva0}</td>
                            {/if}
                            <td>{total.montTtc0}</td>
                        </tr>
                    {/each}
                    <tr style="height:10px"></tr>
            <!--  Lignes "Totaux" finales ─────────────────────────────────────────── -->
                    {#if facture.totTtc != null}
                        {#if totaux.arrTot10.length > 0}
                            <tr>
                                <td colspan={totaux.colSpanTot0} style="text-align:right" class={totaux.arrTot10[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot10[0]}</td>
                                <td style="text-align:center" class={totaux.arrTot10[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot10[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot20.length > 0}
                            <tr>
                                <td colspan={totaux.colSpanTot0} style="text-align:right" class={totaux.arrTot20[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot20[0]}</td>
                                <td style="text-align:center" class={totaux.arrTot20[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot20[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot30.length > 0}
                            <tr>
                                <td colspan={totaux.colSpanTot0} style="text-align:right" class={totaux.arrTot30[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot30[0]}</td>
                                <td style="text-align:center" class={totaux.arrTot30[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot30[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot40.length > 0}
                            <tr>
                                <td colspan={totaux.colSpanTot0} style="text-align:right" class={totaux.arrTot40[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot40[0]}</td>
                                <td style="text-align:center" class={totaux.arrTot40[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot40[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot50.length > 0}
                            <tr>
                                <td colspan={totaux.colSpanTot0} style="text-align:right" class={totaux.arrTot50[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot50[0]}</td>
                                <td style="text-align:center" class={totaux.arrTot50[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot50[1]}</td>
                            </tr>
                        {/if}
                    {/if}
                {/if}
            </tbody>
        </table>
    {/if}
</div>

{#if confirmCloseVisible}
    <ModalConfirm
        bind:visible={confirmCloseVisible}
        titre="Abandon de la saisie"
        message="Des données ont été modifiées.<br>Confirmez-vous l'abandon ?"
        labelConfirm="Abandonner"
        labelAnnuler="Continuer la saisie"
        onconfirm={() => { confirmCloseVisible = false; pendingClose?.(); pendingClose = null; }}
        onannuler={() => { confirmCloseVisible = false; pendingClose = null; }}
    />
{/if}

<ModalConfirm
    bind:visible={confirmImputVisible}
    titre="Imputation du Crédit Client"
    message={confirmImputMessage}
    labelConfirm="Confirmer"
    labelAnnuler="Annuler"
    onconfirm={confirmerImputation}
    onannuler={abandonImputation}
/>


<style>
    .inline-label { 
        white-space: nowrap;
        width: 150px;
        height: 25px;
        text-align: right;
        padding-top: 3px;
        float: left;
        font-size: 13px;
    }
    .inline-input { 
        white-space: nowrap;
        width: 30px;
        height: 25px;
        float: left;
        font-size: 13px;
    }
    /* Totalisation --------- */
    .divTotal {
        height: auto;
        margin-top: 40px;
        min-height: 150px;
    }
    .tableTotal {
        width: 100%;
        height: auto;
        padding: 0px;
    }
    .tableTotal th, td {
        border: 0.5px solid #E8E8E8;
        border-collapse: collapse;
        text-align: center; 
        vertical-align: middle; 
    }
    .tableTotal th {
        height: 30px;
        color: grey;
        font-size: 12px;
        background-color: #EDEDF1; 
    }
    .tableTotal td {
        opacity: 1;
        font-size: 12px;
    }
    .tableTotal tr td.tdNoBold {
        /*text-align: right;*/
        border: 0;
        font-size: 14px;
        font-weight: normal;
        height: 10px;
    }
    .tableTotal tr td.tdBold {
        /*text-align: right;*/
        border: 0;
        font-size: 14px;
        font-weight: bold;
        height: 10px;
    }
    .btnDate {
        margin-left: 0px;
        margin-top: -4px;
        border: none;
        background-color: white;
        cursor: pointer;
    }
    .btnDate:hover {
        color: red;
        font-weight: bold;
    }
</style>