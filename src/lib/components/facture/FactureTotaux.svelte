<script lang="ts">
    import { untrack } from 'svelte';
    import { type FactureTotauxState, parseTotal, serializeTotal, type TotalRow, type Facture, createFactureTotauxState } from '$lib/schemas/facture';
    import { traitLigneTotal, traitLibTotaux, traitColSpan } from '$lib/utils/fonctionsTotaux';
    import { onlyNumeric } from '$lib/utils/numeric';
    import ModalConfirm    from '$lib/components/ModalConfirm.svelte';
  
    // ─── 1. PROPS EN PREMIER ─────────────────────────────────────────
    let {
        facture  = $bindable(null),
        totaux   = $bindable(createFactureTotauxState()),
        totState,
        client,
        mode     = 'create',
        onrefresh, // eslint-disable-line @typescript-eslint/no-unused-vars
        onImputationConfirmee,
        onDemandeImputation,
    }: {
        facture:  Facture | null;
        totaux:   FactureTotauxState;
        totState: FactureTotauxState;
        client:   { soldeCredit: number | null } | null;
        mode:     'create' | 'update';
        onrefresh: () => void;
        onImputationConfirmee?: (montant: number) => void;
        onDemandeImputation?: (message: string, situation: string, onconfirm: () => void) => void;
    } = $props();
  
    // ─── 2. ÉTATS ────────────────────────────────────────────────────
    let acompTauxInitial      = $state<string | number | null>(null);
    let dateReglInitial       = $state<string | null | undefined>(null);
    let confirmCloseVisible   = $state(false);
    let initializedForId      = $state<number | null>(null);
    let imputSituation        = $state<'aucune' | 'plafonne' | 'partielle' | null>(null);
    let totalRows: TotalRow[] = $state([]);
    let vuImputSoldeClient0   = $state(false);
    let montantImputerSaisi   = $state<number | string>(0);
    let pendingClose          = $state<(() => void) | null>(null);
  
    // ─── 3. EFFECTS : Initialisation au montage ───────────────────────────────────
    $effect(() => {
        if (!facture) return;
        if (untrack(() => acompTauxInitial) === null) {
            acompTauxInitial = facture.acompTaux ?? null;
            dateReglInitial  = facture.dateRegl  ?? null;
        }
        // ← réinitialiser si la facture a changé
        if (untrack(() => initializedForId) === facture.id) {
            return;
        }
        if (facture.total) {
            initializedForId = facture.id;   // ← marquer comme initialisé pour cette facture
            const imputCreCliActuel = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
            totaux.imputAcomp0     = totState.imputAcomp0;
            totaux.acompMontArray0 = totState.acompMontArray0;
            totaux.acompteId0      = totState.acompteId0;
            totaux.acompPresta0    = totState.acompPresta0;
            totaux.acompVente0     = totState.acompVente0;
            if (mode === 'update' && imputCreCliActuel > 0) {
                // Les données d'imputation sont déjà dans facture.total — NE PAS appeler traitLigneTotal
                montantImputerSaisi = imputCreCliActuel;
                facture.imputCreCli = imputCreCliActuel;
                traitLibTotaux(facture, totaux);
                traitColSpan(facture, totaux);
                totaux.colSpanTot0 += 1;
            } else if (totState.imputAcomp0 === '2' || totState.imputAcomp0 === '3') {
                traitLigneTotal(facture, totaux);
            } else {
                traitLibTotaux(facture, totaux);
                traitColSpan(facture, totaux);
            }
        }
    });
    // Lignes de totalisation dérivées de facture.total
    $effect(() => {
        if (!facture?.total) { totalRows = []; return; }
        const parsed = parseTotal(facture.total);
        totalRows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        untrack(() => {// ← untrack pour éviter la boucle réactive
            if (Number(facture?.imputCreCli ?? 0) === 0) {
                traitLibTotaux(facture!, totaux);
                traitColSpan(facture!, totaux);
            }
        });
    });
    // Affichage bloc imputation
    $effect(() => {
        if (!facture || !client) { vuImputSoldeClient0 = false; return; }
        const soldeCredit = parseFloat(String(client.soldeCredit ?? '0').replace(',', '.')) || 0;
        if (totState.imputAcomp0 !== '2' && totState.imputAcomp0 !== '3' && facture.codeType == 30 && facture.refFac?.slice(0, 2) == 'FB' && soldeCredit > 0) {
            vuImputSoldeClient0 = true;
        } else {
            vuImputSoldeClient0 = false;
        }
    });
    // ─── 4. FONCTIONS ────────────────────────────────────────────────
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
    function examImputExcedentEncais(): void {
        if (!facture) return;
        const totTtcActuel = parseFloat(String(facture.totTtc ?? '0').replace(',', '.')) || 0;
        const montantSaisi = Number(montantImputerSaisi) || 0;
        if (mode === 'update') {
            const imputCreCliActuel = parseFloat(String(facture.imputCreCli ?? '0').replace(',', '.')) || 0;
            if (montantSaisi === imputCreCliActuel) return;
        }
        if (montantSaisi === 0) {
            imputSituation = 'aucune';
            onDemandeImputation?.("Aucune imputation du Crédit Client. Confirmez-vous ?", 'aucune', confirmerImputation);
            return;
        }
        if (montantSaisi >= totTtcActuel) {
            imputSituation = 'plafonne';
            onDemandeImputation?.("Le montant Imputé a été plafonné au montant TTC Dû de la Facture<br>Confirmez-vous cette Imputation ?", 'plafonne', confirmerImputation);
            return;
        }
        imputSituation = 'partielle';
        onDemandeImputation?.("Confirmez-vous cette Imputation ?", 'partielle', confirmerImputation);
    }
    function confirmerImputation(): void {
        if (!facture) return;
        const totTtcActuel = parseFloat(String(facture.totTtc ?? '0').replace(',', '.')) || 0;
        switch (imputSituation) {
            case 'aucune': {
                facture.imputCreCli = 0;
                facture.solde       = totTtcActuel;
                if (facture.regimeTva === 'B') calculerImputationDansTotal(0);
                break;
            }
            case 'plafonne': {
                montantImputerSaisi = totTtcActuel;
                facture.imputCreCli = totTtcActuel;
                facture.solde       = 0;
                if (facture.regimeTva === 'B') calculerImputationDansTotal(totTtcActuel);
                break;
            }
            case 'partielle': {
                const montantSaisi  = Number(montantImputerSaisi) || 0;
                facture.imputCreCli = montantSaisi;
                facture.solde       = totTtcActuel - montantSaisi;
                if (facture.regimeTva === 'B') calculerImputationDansTotal(montantSaisi);
                break;
            }
        }
        // ── Recalculer l'affichage des totaux ─────────────────────────
        traitLibTotaux(facture, totaux);
        traitColSpan(facture, totaux);
        if (facture.regimeTva === 'B' && Number(facture.imputCreCli) > 0 && totaux.imputAcomp0 !== '3') {
            totaux.colSpanTot0 += 1;
        }
        onImputationConfirmee?.(Number(montantImputerSaisi) || 0);
        imputSituation = null;
    }
    function hasUnsavedChanges(): boolean {
        if (!facture) return false;
        return (
            String(facture.acompTaux ?? '') !== String(acompTauxInitial ?? '') || (facture.dateRegl ?? '') !== (dateReglInitial ?? '')
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
    export { hasUnsavedChanges, confirmCloseTotaux };
  
    function fmt2fr(v: number): string { return v.toFixed(2).replace('.', ','); }
    function calculerImputationDansTotal(montantImputation: number): void {
        if (!facture) return;
        const rawTotal = parseTotal(facture.total);
        const arr: TotalRow[] = !rawTotal
            ? []
            : Array.isArray(rawTotal)
                ? rawTotal
                : [rawTotal];
        const lignesTva = arr.filter(r => ['00', '11', '14'].includes(String(r.typeTotalisation0 ?? '').slice(4, 6)));
        const montantTotalHT = lignesTva.reduce((sum, r) => sum + (parseFloat(String(r.montBrut0 ?? '0').replace(',', '.')) || 0), 0);
        if (montantTotalHT > 0) {
            if (montantImputation > 0) {
                for (const r of lignesTva) {
                    const montBrut       = parseFloat(String(r.montBrut0 ?? '0').replace(',', '.')) || 0;
                    const tauxTva        = parseFloat(String(r.typeTotalisation0 ?? '').slice(0, 4).replace(',', '.')) || 0;
                    const acompte        = (montantImputation * (montBrut / montantTotalHT)) / (1 + tauxTva / 100);
                    const montHt         = montBrut - acompte;
                    const montTva        = (montHt * tauxTva) / 100;
                    r.acompteImputation0 = fmt2fr(acompte);
                    r.montHt0            = fmt2fr(montHt);
                    r.montTva0           = fmt2fr(montTva);
                    r.montTtc0           = fmt2fr(montHt + montTva);
                }
            } else {
                for (const r of lignesTva) {
                    const montBrut       = parseFloat(String(r.montBrut0 ?? '0').replace(',', '.')) || 0;
                    const tauxTva        = parseFloat(String(r.typeTotalisation0 ?? '').slice(0, 4).replace(',', '.')) || 0;
                    r.acompteImputation0 = '';
                    r.montHt0            = fmt2fr(montBrut);
                    r.montTva0           = fmt2fr((montBrut * tauxTva) / 100);
                    r.montTtc0           = fmt2fr(montBrut + (montBrut * tauxTva) / 100);
                }
            }
        }
      facture.total = serializeTotal(arr);
    }
    // ─── Calcul du Nombre de Colonnes ───────────────────────────────
    const nbColonnes = $derived.by(() => {
        let nb = 1; // Totalisation toujours présente
        if (facture?.regimeTva == 'B') nb++;
        if ((facture?.codeType == 10 && Number(facture?.acompTaux) > 0 && facture?.regimeTva == 'B') || totaux.imputAcomp0 == '3'  || (facture?.regimeTva == 'B' && Number(facture?.imputCreCli) > 0)) nb++; // Imputation HT
        if ((facture?.codeType == 10 && Number(facture?.acompTaux) > 0 && facture?.regimeTva == 'B') || totaux.imputAcomp0 == '3' || (facture?.regimeTva == 'B' && Number(facture?.imputCreCli) > 0)) nb++; // Net HT
        if (facture?.regimeTva == 'B') nb++;
        nb++; // Total Ttc
        return nb;
    });
    function creditClientAffiche(): number {
        const solde = parseFloat(String(client?.soldeCredit ?? '0').replace(',', '.')) || 0;
        if (mode === 'update' && Number(montantImputerSaisi) === 0) {
            const ancienImput = parseFloat(String(facture?.imputCreCli ?? '0').replace(',', '.')) || 0;
            return solde + ancienImput;
        }
        return solde;
    }
</script>

<div class="divTotal">
    <div style="position:relative;display:flex;flex-direction:row;align-items:center;color:#60A2F2;font-size:14px;font-weight:600;margin:0 3px;opacity:0.8">
        <span style="width:43%;margin-top:3px;margin-right:10px"><hr style="border:none;border-top:1px solid #60A2F2"/></span>Totalisation<span style="width:43%;margin-top:3px;margin-left:10px;height:1px"><hr style="border:none;border-top:1px solid #60A2F2"/></span>
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
            <!-- Condition d'Affichage de la Saisie de l'Imputation du Montant d'Excédent d'Encaissement -->
            {#if vuImputSoldeClient0 == true}
                <div class="saisieEntete" style="margin-top:10px;margin-left:10px;margin-right:10px">
                    <div class="sg-row">
                        <div class="sg-field" style="flex:1">
                            <input id="montImput1" name="montImput1" type="text" class="sg-input" placeholder=" " value={creditClientAffiche()} readonly>  
                            <label for="montImput1" class="sg-label">Crédit Client</label>
                        </div>
                        <div class="sg-field" style="flex:0.8">
                            <input id="montImput2" name="montImput2" type="text" class="sg-input" placeholder=" " bind:value={montantImputerSaisi}>
                            <label for="montImput2" class="sg-label">Montant Imputé</label>
                        </div>
                        <button type="button" class="sg-button" style="font-size:12px;height:30px" disabled={Number(montantImputerSaisi) === 0 && Number(facture?.imputCreCli ?? 0) === 0}
                                onclick={() => examImputExcedentEncais()}>Imputer</button>
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
                    {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3'|| (facture.regimeTva == 'B' && Number(facture.imputCreCli) > 0)}
                        <th style="width:11%">Imputation HT</th>
                    {/if}
                    {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3'|| (facture.regimeTva == 'B' && Number(facture.imputCreCli) > 0)}
                        <th style="width:13%">Net HT</th>
                    {/if}
                    {#if facture.regimeTva == 'B'}
                        <th style="width:15%;white-space:nowrap">Tva</th>
                    {/if}
                    <th style="width:14%;min-width:90px">Total Ttc</th>
                </tr>
            </thead>
            <tbody>
                <!--  Lignes de Totalisations ──────────────────────────────────── -->
                {#if totalRows.length > 0}
                    {#each totalRows as total, i (i)}
                        <tr>
                            <td style="text-align:left">{total.libelle0}</td>
                            {#if facture.regimeTva == 'B'}
                                <td>{total.montBrut0}</td>
                            {/if}
                            {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3' || (facture.regimeTva == 'B' && Number(facture.imputCreCli) > 0)}
                                <td>{total.acompteImputation0}</td>
                            {/if}
                            {#if (facture.codeType == 10 && Number(facture.acompTaux) > 0 && facture.regimeTva == 'B') || totaux.imputAcomp0 == '3' || (facture.regimeTva == 'B' && Number(facture.imputCreCli) > 0)}
                                <td>{total.montHt0}</td>
                            {/if}
                            {#if facture.regimeTva == 'B'}
                                <td style="white-space:nowrap">{total.montTva0}
                                    {#if Number(facture.imputCreCli) > 0 && parseFloat(String(total.acompteImputation0 ?? '0').replace(',','.')) > 0}
                                        <br><small><em style="color:#666;font-size:10px;white-space:nowrap">Tva/Imputation&nbsp;:&nbsp;{(
                                            parseFloat(String(total.acompteImputation0).replace(',','.')) * parseFloat(String(total.typeTotalisation0 ?? '').slice(0,4).replace(',','.')) / 100).toFixed(2).replace('.',',')}
                                        </em></small>
                                    {/if}
                                </td>
                            {/if}
                            <td>{total.montTtc0}</td>
                        </tr>
                    {/each}
                    <tr style="height:10px"></tr>
                    <!-- ── Lignes "Totaux" finales dans la table ──────────────────── -->
                    {#if facture.totTtc != null && totaux.arrTot10.length > 0}
                        <tr style="height:5px"></tr>
                        {#if totaux.arrTot10.length > 0}
                            <tr>
                                <td colspan={nbColonnes-1} style="text-align:right;border:none" class={totaux.arrTot10[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot10[0]}</td>
                                <td style="text-align:center;border:none" class={totaux.arrTot10[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot10[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot20.length > 0}
                            <tr>
                                <td colspan={nbColonnes-1} style="text-align:right;border:none" class={totaux.arrTot20[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot20[0]}</td>
                                <td style="text-align:center;border:none" class={totaux.arrTot20[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot20[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot30.length > 0}
                            <tr>
                                <td colspan={nbColonnes-1} style="text-align:right;border:none" class={totaux.arrTot30[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot30[0]}</td>
                                <td style="text-align:center;border:none" class={totaux.arrTot30[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot30[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot40.length > 0}
                            <tr>
                                <td colspan={nbColonnes-1} style="text-align:right;border:none" class={totaux.arrTot40[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot40[0]}</td>
                                <td style="text-align:center;border:none" class={totaux.arrTot40[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot40[1]}</td>
                            </tr>
                        {/if}
                        {#if totaux.arrTot50.length > 0}
                            <tr>
                                <td colspan={nbColonnes-1} style="text-align:right;border:none" class={totaux.arrTot50[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot50[0]}</td>
                                <td style="text-align:center;border:none" class={totaux.arrTot50[2] == '0' ? "tdNoBold" : "tdBold"}>{totaux.arrTot50[1]}</td>
                            </tr>
                        {/if}
                    {/if}
                {/if}
            </tbody>
        </table>
    {/if}
</div>
<!-- **** ModalConfirm fermeture **** -->
{#if confirmCloseVisible}
    <ModalConfirm bind:visible={confirmCloseVisible} titre="Abandon de la saisie" message="Des données ont été modifiées.<br>Confirmez-vous l'abandon ?"
                  labelConfirm="Abandonner" labelAnnuler="Continuer la saisie" onconfirm={()=>{confirmCloseVisible=false;pendingClose?.();pendingClose=null}}
                  onannuler={()=>{confirmCloseVisible=false;pendingClose=null}} />
{/if}

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