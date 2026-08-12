<script lang="ts">
    import type { Facture } from '$lib/schemas/facture';
    import type { Tarif } from '$lib/schemas/tarif';
    import ModalAlerte  from '$lib/components/ModalAlerte.svelte';
    import ModalConfirm from '$lib/components/ModalConfirm.svelte';
    import { parseLigne, serializeLigne, type LigneCell } from '$lib/schemas/facture';
    import { numericDecimal, onlyNumeric, formatDecimalFr, formatEntier  } from '$lib/utils/numeric';
    import { selectNature, selectUnite, calBaseHt, calMontHt, verifSaisie, moveLigne, type LigneSelectState, type VerifSaisieState } from '$lib/components/facture/FactureLignes.utils';
    import { lancerGestionTarif, handleTarifAction, handleTarifAnnuler, createShowToast, type TarifGestionState } from '$lib/components/facture/FactureLignes.tarif';
    import { traitLigneTotal } from '$lib/utils/fonctionsTotaux';
    import { createFactureTotauxState, type FactureTotauxState } from '$lib/schemas/facture';
    import { tick } from 'svelte';

    let { facture = $bindable(null), totaux = $bindable(createFactureTotauxState()), tarifs, dateEcheanceDate0 = '', onrefresh }: { // eslint-disable-line @typescript-eslint/no-unused-vars
        facture          : Facture | null;
        totaux           : FactureTotauxState;
        tarifs           : import('$lib/schemas/tarif').Tarif[];
        dateEcheanceDate0: string;
        onrefresh        : () => void;
    } = $props();

    let tarifDialog = $state<HTMLDialogElement | null>(null);

    // ─── Lignes ───────────────────────────────────────────────────
    let lignesArray = $state<LigneCell[]>([]);

    // ─── Initialisation depuis facture.ligne en mode update ──────────
    let lignesInitialized = false;
    $effect(() => {
        if (!facture?.ligne || lignesInitialized) return;
        lignesInitialized = true;
        lignesArray = parseLigne(facture.ligne) ?? [];
    });
    $effect(() => {
        if (tarifModalVisible) {
            tarifDialog?.showModal();
        } else {
            tarifDialog?.close();
        }
    });
    const nbreLigRem0 = $derived(
        (parseLigne(facture?.ligne) ?? [])
            .filter(l => parseFloat(String(l.remise0).replace(',', '.')) > 0)
            .length
    );

    // ─── Ligne en cours de saisie/édition ────────────────────────
    let ligne = $state<LigneCell>({
        typeLig0:      '',
        nature0:       '',
        textHtml0:     '',
        unite0:        '',
        prixUnitaire0: '0,00',
        quantite0:     '0,00',
        baseHt0:       '0,00',
        pourRemise0:   '0',
        remise0:       '0,00',
        montantHt0:    '0,00',
        tauxTva0:      '',
        tarifId0:      '',
    });

    // ─── Gestion Tarif de Référence ──────────────────────────────
    let tarifModalVisible   = $state(false);
    let tarifIsModification = $state(false);
    let tarifModalTitre     = $state('');
    let tarifModalMessage1  = $state('');
    let tarifModalMessage2  = $state('');
    let tarifModalBtnOui    = $state('');
    let tarifMotCleInput    = $state('');
    let tarifTrouve         = $state<Tarif | null>(null);
    let ligneEditIndex   = $state(-1);
    let ligneInitial     = $state<typeof ligne | null>(null);
    let divSaisieVu      = $state(false);
    let btnRechVu        = $state(false);
    let libLegendeLigne  = $state('');
    let libHtmlLigne     = $state('');
    let tarifSelectValue = $state('');    // eslint-disable-line @typescript-eslint/no-unused-vars
    let activeBtnEditRef = $state(false); // eslint-disable-line @typescript-eslint/no-unused-vars
    let uniteVu          = $state(false);
    let divEditRefVu     = $state(false); // eslint-disable-line @typescript-eslint/no-unused-vars
    let btnSupprRefVu1   = $state(false); // eslint-disable-line @typescript-eslint/no-unused-vars
    let libBouton        = $state('');
    let puQteBaseVu      = $state(false);
    let forfaitVu        = $state(false);
    let remMontVu        = $state(false);
    let fraisDebourDcVu  = $state(false);
    let tvaVu            = $state(false);
    let btnValiderVu     = $state(false); // eslint-disable-line @typescript-eslint/no-unused-vars
    let nat0             = $state('');
    let tarif            = $state<Tarif | null>(null);
    let libFraisDebourDc = $state('');

    const st: LigneSelectState = {
        setNat0:             (v) => nat0             = v,
        setUniteVu:          (v) => uniteVu          = v,
        setPuQteBaseVu:      (v) => puQteBaseVu      = v,
        setForfaitVu:        (v) => forfaitVu        = v,
        setRemMontVu:        (v) => remMontVu        = v,
        setFraisDebourDcVu:  (v) => fraisDebourDcVu  = v,
        setTvaVu:            (v) => tvaVu            = v,
        setLibFraisDebourDc: (v) => libFraisDebourDc = v,
    };

    const vs: VerifSaisieState = {
        get uniteVu()     { return uniteVu; },
        get puQteBaseVu() { return puQteBaseVu; },
        get remMontVu()   { return remMontVu; },
        get tvaVu()       { return tvaVu; },
        showAlert:        (titre, msg) => {alerteTitre=titre; alerteMessage=msg; alerteVisible=true},
        setLibHtmlLigne:  (v) => libHtmlLigne = v,
    };

    // ─── Toast ────────────────────────────────────────────────────
    let toastMessage = $state('');
    let toastSucces  = $state(true);
    let toastVisible = $state(false);
    const showToast  = createShowToast(
        (v) => toastMessage = v,
        (v) => toastSucces  = v,
        (v) => toastVisible = v
    );

    // ─── État gestion tarif ───────────────────────────────────────
    const tst: TarifGestionState = {
        getLigne:               () => ligne,
        getLigneEditIndex:      () => ligneEditIndex,
        getFacture:             () => facture,
        setFacture:             (f) => { if (facture) Object.assign(facture, f); },
        getLibHtmlLigne:        () => libHtmlLigne,
        setTarifId0:            (v) => ligne.tarifId0             = v,
        setLignesArray:         (v) => lignesArray                = v,
        setTarifModalVisible:   (v) => tarifModalVisible          = v,
        setTarifModalTitre:     (v) => tarifModalTitre            = v,
        setTarifModalMessage1:  (v) => tarifModalMessage1         = v,
        setTarifModalMessage2:  (v) => tarifModalMessage2         = v,
        setTarifModalBtnOui:    (v) => tarifModalBtnOui           = v,
        setTarifMotCleInput:    (v) => tarifMotCleInput           = v,
        setTarifTrouve:         (v) => tarifTrouve                = v,
        setTarifIsModification: (v) => tarifIsModification        = v,
        getTarifMotCleInput:    () => tarifMotCleInput,
        getTarifTrouve:         () => tarifTrouve,
        getTarifIsModification: () => tarifIsModification,
        getLigneInitial:        () => ligneInitial,
        showToast,
        showAlert:              (titre, msg) => {alerteTitre=titre; alerteMessage=msg; alerteVisible=true},
        setLigneEditIndex:      (v) => ligneEditIndex             = v,
        setDivSaisieVu:         (v) => divSaisieVu                = v,
    };

    // ─── Modales alerte et confirmation ──────────────────────────
    let alerteVisible        = $state(false);
    let alerteTitre          = $state('');
    let alerteMessage        = $state('');
    let confirmCloseVisible  = $state(false);
    let confirmDeleteVisible = $state(false);
    let ligneToDeleteIndex   = $state(-1);

    // ─── Constantes ──────────────────────────────────────────────
    const NATURES  = ['Vente', 'Prestation', 'Débours', 'Commentaire', "Frais `départ`", "Frais `déplacement`"];
    const UNITES   = ['heure', 'jour', 'semaine', 'mois', 'forfait', 'm', 'm²', 'm³', 'km', 'gramme', 'kg', 'tonne', 'litre', 'lot', 'pièce'];
    const TAUX_TVA = ['2,1', '5,5', '8,5', '10,0', '20,0'];

    // ─────────────────────────────────────────────────────────────
    // Fonctions
    // ─────────────────────────────────────────────────────────────
    function confirmCloseSaisieLig(): void {
        if (hasUnsavedChanges()) {
            confirmCloseVisible = true;
        } else {
            closeSaisieLig();
        }
    }
    function hasUnsavedChanges(): boolean {
        if (ligneEditIndex === -1) {
            return (
                ligne.nature0       !== ''     ||
                ligne.unite0        !== ''     ||
                ligne.prixUnitaire0 !== '0,00' ||
                ligne.quantite0     !== '0,00' ||
                ligne.pourRemise0   !== '0'    ||
                ligne.tauxTva0      !== ''     ||
                (libHtmlLigne !== '' && libHtmlLigne !== '<br>')
            );
        }
        if (!ligneInitial) return false;
        return (
            ligne.nature0       !== ligneInitial.nature0       ||
            ligne.unite0        !== ligneInitial.unite0        ||
            ligne.prixUnitaire0 !== ligneInitial.prixUnitaire0 ||
            ligne.quantite0     !== ligneInitial.quantite0     ||
            ligne.baseHt0       !== ligneInitial.baseHt0       ||
            ligne.pourRemise0   !== ligneInitial.pourRemise0   ||
            ligne.tauxTva0      !== ligneInitial.tauxTva0      ||
            libHtmlLigne        !== ligneInitial.textHtml0
        );
    }
    function closeSaisieLig(): void {
        divSaisieVu    = false;
        ligneInitial   = null;
        ligneEditIndex = -1;
    }

    function confirmDeleteLigne(e:unknown, i:number):void {
        void e;
        ligneToDeleteIndex   = i;
        confirmDeleteVisible = true;
    }

    function deleteLigne(): void {
        const tableArray = [...(parseLigne(facture?.ligne) ?? [])];
        tableArray.splice(ligneToDeleteIndex, 1);
        if (facture) {
            facture.ligne = serializeLigne(tableArray);
            lignesArray   = [...tableArray];
        }
        confirmDeleteVisible = false;
        ligneToDeleteIndex   = -1;
    }

    function selectTarif(e: Event) {
        const val = (e.target as HTMLSelectElement).value;
        tarifSelectValue = val;
        const selectedItem = tarifs.find((t: Tarif) => val === t.motCle);
        if (!selectedItem) return;
        tarif = { ...selectedItem };
        libHtmlLigne = tarif.textHtml ?? '';
        setTimeout(() => {
            const editor = document.getElementById('editor');
            if (editor) editor.innerHTML = tarif!.textHtml ?? '';
        }, 100);
        ligne.nature0  = tarif.nature;
        ligne.tarifId0 = String(tarif.id);
        switch (tarif.nature) {
            case 'Vente':
            case 'Prestation':
                ligne.unite0        = tarif.unite ?? '';
                ligne.prixUnitaire0 = tarif.prixUnite != null ? String(tarif.prixUnite).replace('.', ',') : '0,00';
                ligne.quantite0     = '0,00';
                ligne.baseHt0       = '0,00';
                ligne.pourRemise0   = '0';
                ligne.montantHt0    = '0,00';
                ligne.tauxTva0      = tarif.tauxTva ? String(tarif.tauxTva).replace('.', ',') : '';
                uniteVu             = true;
                puQteBaseVu         = tarif.unite !== 'forfait';
                forfaitVu           = tarif.unite === 'forfait';
                remMontVu           = true;
                fraisDebourDcVu     = false;
                tvaVu               = true;
                break;
            case 'Commentaire':
                ligne.prixUnitaire0 = '0,00';
                ligne.quantite0     = '0,00';
                ligne.baseHt0       = '0,00';
                ligne.pourRemise0   = '0';
                ligne.montantHt0    = '0,00';
                uniteVu=false; puQteBaseVu=false; forfaitVu=false;
                remMontVu=false; fraisDebourDcVu=false; tvaVu=false;
                break;
            case "Frais `déplacement`":
            case "Frais `départ`":
            case 'Débit Facture':
            case 'Crédit Facture':
                ligne.prixUnitaire0 = '0,00';
                ligne.quantite0     = '0,00';
                ligne.baseHt0       = '0,00';
                ligne.pourRemise0   = '0';
                ligne.montantHt0    = '0,00';
                ligne.tauxTva0      = tarif.tauxTva ? String(tarif.tauxTva).replace('.', ',') : '';
                uniteVu=false; puQteBaseVu=false; forfaitVu=false;
                remMontVu=false; fraisDebourDcVu=true; tvaVu=true;
                break;
            case 'Débours':
            case 'Débit Débours':
            case 'Crédit Débours':
                ligne.prixUnitaire0 = '0,00';
                ligne.quantite0     = '0,00';
                ligne.baseHt0       = '0,00';
                ligne.pourRemise0   = '0';
                ligne.montantHt0    = '0,00';
                uniteVu=false; puQteBaseVu=false; forfaitVu=false;
                remMontVu=false; fraisDebourDcVu=true; tvaVu=false;
                break;
        }
    }

    function formatText(command:string, value:string | undefined = undefined) {
        document.execCommand(command, false, value);
    }

    function initLigne():void {
        tarifSelectValue = '';
        if (dateEcheanceDate0 === '') {
            alerteTitre   = 'Saisies obligatoires';
            alerteMessage = "Les Données Générales doivent être préalablement<br>saisies avant celles des lignes de Facturation.";
            alerteVisible = true;
            return;
        }
        if (tarif) tarif.id = 0;
        ligne.typeLig0      = '';
        ligne.nature0       = '';
        ligne.textHtml0     = '';
        ligne.unite0        = '';
        ligne.prixUnitaire0 = '0,00';
        ligne.quantite0     = '0,00';
        ligne.baseHt0       = '0,00';
        ligne.pourRemise0   = '0';
        ligne.remise0       = '0,00';
        ligne.montantHt0    = '0,00';
        ligne.tauxTva0      = '';
        ligne.tarifId0      = '';
        uniteVu             = false;
        puQteBaseVu         = false;
        forfaitVu           = false;
        remMontVu           = false;
        fraisDebourDcVu     = false;
        tvaVu               = false;
        libBouton           = 'Créer la Ligne';
        libLegendeLigne     = 'Nouvelle Ligne de Facturation';
        ligneInitial        = null;
        divSaisieVu         = true;
    }

    async function handleValiderLigne() {
        if (!verifSaisie(ligne, vs)) return;
        const codeNature: Record<string, string> = {
            "Vente":                    '00',
            "Prestation":               '11',
            "Frais `départ`":           '12',
            "Frais `déplacement`":      '13',
            "Débours":                  '20',
            "Commentaire":              '30'
        };
        const code       = codeNature[ligne.nature0] ?? '00';
        const tauxNum    = parseFloat(String(ligne.tauxTva0).replace(',', '.')) || 0;
        ligne.typeLig0   = String(tauxNum).padStart(4, '0') + code;
        const baseCalc   = parseFloat(String(ligne.baseHt0).replace(',', '.'))   || 0;
        const remCalc    = Number(ligne.pourRemise0) || 0;
        const remCalcStr = remCalc > 0 ? String(remCalc) : '0';
        const remise0Cal = remCalc > 0
            ? ((baseCalc * remCalc) / 100).toFixed(2).replace('.', ',')
            : '0,00';
        const nouvelleCell: LigneCell = {
            typeLig0:      ligne.typeLig0,
            nature0:       ligne.nature0,
            textHtml0:     libHtmlLigne,
            unite0:        ligne.unite0,
            prixUnitaire0: ligne.prixUnitaire0,
            quantite0:     ligne.quantite0,
            baseHt0:       ligne.baseHt0,
            pourRemise0:   remCalcStr,
            remise0:       remise0Cal,
            montantHt0:    ligne.montantHt0,
            tauxTva0:      ligne.tauxTva0,
            tarifId0:      ligne.tarifId0,
        };
        const tableArray = [...(parseLigne(facture?.ligne) ?? [])];
        if (ligneEditIndex >= 0) {
            tableArray[ligneEditIndex] = nouvelleCell;
        } else {
            tableArray.push(nouvelleCell);
        }
        if (facture) {
            facture.ligne = serializeLigne(tableArray);
            lignesArray   = [...tableArray];
        }
        if (facture) traitLigneTotal(facture, totaux);
        await lancerGestionTarif(tarifs, ligne, tst);
    }

    async function editLigne(i: number) {
        const l = lignesArray[i];
        if (!l) return;
        ligneEditIndex      = i;
        ligne.typeLig0      = l.typeLig0;
        ligne.nature0       = l.nature0;
        ligne.textHtml0     = l.textHtml0;
        ligne.unite0        = l.unite0;
        ligne.prixUnitaire0 = l.prixUnitaire0;
        ligne.quantite0     = l.quantite0;
        ligne.baseHt0       = l.baseHt0;
        ligne.pourRemise0   = l.pourRemise0;
        ligne.remise0       = l.remise0;
        ligne.montantHt0    = l.montantHt0;
        ligne.tauxTva0      = l.tauxTva0;
        ligne.tarifId0      = l.tarifId0;
        libBouton           = 'Enregistrer';
        libLegendeLigne     = 'Modification de la Ligne de Facturation';
        ligneInitial        = { ...ligne };
        switch (ligne.nature0) {
            case "Vente":
            case "Prestation":
                uniteVu=true; puQteBaseVu=ligne.unite0 !== 'forfait';
                forfaitVu=ligne.unite0 === 'forfait'; remMontVu=true;
                fraisDebourDcVu=false; tvaVu=true;
                break;
            case "Frais `déplacement`":
            case "Frais `départ`":
                uniteVu=false; puQteBaseVu=false; remMontVu=false;
                forfaitVu=false; fraisDebourDcVu=true; tvaVu=true;
                break;
            case "Débours":
                uniteVu=false; puQteBaseVu=false; forfaitVu=false;
                remMontVu=false; fraisDebourDcVu=true; tvaVu=false;
                break;
            case "Commentaire":
                uniteVu=false; puQteBaseVu=false; forfaitVu=false;
                remMontVu=false; tvaVu=false;
                break;
        }
        await tick();
        divSaisieVu = true;
        setTimeout(() => {
            const editor = document.getElementById('editor');
            if (editor) editor.innerHTML = l.textHtml0;
            libHtmlLigne = l.textHtml0;
            ligneInitial = { ...ligne, textHtml0: l.textHtml0 };
        }, 100);
    }
</script>

<div class="divTitre">
    <div style="display:flex;flex-direction:row;align-items:center;color:#60A2F2;font-size:13px;margin:0 3px;opacity:0.8">
        <hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-right:7px"/>Détail de la Facturation<hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-left:7px"/>
    </div>
</div>

{#if facture}
    <!-- ═══ TABLE DES LIGNES ═════════════════════════════════════════════════════════════════════════════════════════════════ -->
    <table id="tableLigne" class="cssTable">
        <thead>
            <tr>
                <th style="width:41%">Libellé</th>
                <th style="width:9%">Unité</th>
                <th style="width:9%">P.U.</th>
                <th style="width:7%">Qté</th>
                {#if nbreLigRem0 > 0}
                    <th style="width:10%">Base</th>
                    <th style="width:8%">Remise</th>
                {/if}
                <th style="width:11%">Montant</th>
                {#if facture.regimeTva == 'B'}
                    <th style="min-width:20px">% Tva</th>
                {/if}
                <th style="min-width:130px">
                    <button type="button" class="sg-link" onclick={() => initLigne()}>Nouvelle Ligne</button>
                </th>
            </tr>
        </thead>
        <tbody>
            {#if lignesArray.length > 0}
                {#each lignesArray as ligne, i (i)}
                    <tr class="trSha">
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        <td style="height:10px;text-align:left">{@html ligne.textHtml0}</td>
                        <td style="height:10px">{ligne.unite0}</td>
                        <td style="height:10px">{ligne.prixUnitaire0}</td>
                        <td style="height:10px">{ligne.quantite0}</td>
                        {#if nbreLigRem0 > 0}
                            {#if Number(ligne.pourRemise0) > 0}
                                <td style="height:10px">{ligne.baseHt0}</td>
                                <td>{ligne.pourRemise0} %<br>{ligne.remise0}</td>
                            {:else}
                                <td>—</td><td>—</td>
                            {/if}
                        {/if}
                        <td style="height:10px">{ligne.montantHt0}</td>
                        {#if facture.regimeTva == 'B'}
                            <td>{ligne.tauxTva0}</td>
                        {/if}
                        <td class="sg-tdBtn" style="padding-top:5px;height:35px;text-align:center">
                            <div style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:4px">
                                <button class="sg-btn" title="Remonter la Ligne"  onclick={() => moveLigne(i, -1, facture!, (v) => lignesArray = v)}><img src="/up.png" alt=""/></button>
                                <button class="sg-btn" title="Descendre la Ligne" onclick={() => moveLigne(i,  1, facture!, (v) => lignesArray = v)}><img src="/down.png" alt=""/></button>
                                <button class="sg-btn" title="Editer la Ligne"    onclick={() => editLigne(i)}><img src="/pencil.png" alt=""/></button>
                                <button class="sg-btn" title="Supprimer la Ligne" onclick={(e) => confirmDeleteLigne(e, i)}><img src="/trash.png" alt=""/></button>
                            </div>
                        </td>
                    </tr>
                {/each}
            {/if}
        </tbody>
    </table>

    <!-- ═══ FORMULAIRE DE SAISIE ════════════════════════════════════════════════════════════════════════════════════════════════════════ -->
    {#if divSaisieVu}
        <div class="divSaisie">
            <fieldset class="sg-fieldset">
                <legend class="sg-legende">{libLegendeLigne}</legend>
                <button class="sg-dialogFermer" title="Fermer la Fenêtre de Saisie" onclick={() => confirmCloseSaisieLig()}><img src="/close.png" alt=""></button>
                <div style="display:flex;flex-direction:row;width:100%">
                    <!-- Div Gauche -->
                    <div class="divSaisieGauche">
                        {#if tarifs.length > 0}
                            <div class="sg-row" style="width:100%;margin-top:-8px;margin-left:-6px">
                                <label for="" class="sg-asterix" style="color:white">*</label>
                                <select id="selectTarif" class="sg-select" value={tarifs.find((t: Tarif) => String(t.id) === String(ligne.tarifId0))?.motCle ?? ''} onchange={(e)=>{tarifSelectValue = (e.target as HTMLSelectElement).value; selectTarif(e)}} style="margin-right:5px;margin-top:5px;width:300px;height:30px">
                                    <option value="" disabled hidden>Liste des Références Tarif</option>
                                    {#each tarifs as t (t.id)}
                                        <option value={t.motCle}>{t.motCle}</option>
                                    {/each}
                                </select>
                                {#if btnRechVu}
                                    <button class="btnRech" onclick={() => {activeBtnEditRef=true;divEditRefVu=true;btnSupprRefVu1=true}} title="Editer le Mot-clé"><img src="/editer.png" alt=""/></button>
                                {/if}
                            </div>
                        {/if}
                        <div class="sg-row" style="width:100%;margin-top:0px;margin-left:-6px">
                            <label for="" class="sg-asterix" style="color:red;margin-top:17px">*</label>
                            <select id="selectNat" class="sg-select" bind:value={ligne.nature0} onchange={(e)=>selectNature(e, ligne, st)} style="margin-right:5px;margin-top:5px;width:150px;height:30px">
                                <option value="" disabled hidden>Nature ...</option>
                                {#each NATURES as nature (nature)}
                                    <option value={nature}>{nature}</option>
                                {/each}
                            </select>
                            {#if uniteVu}
                                <label for="" class="sg-asterix" style="color:red;margin-top:16px">*</label>
                                <select id="selectUni" class="sg-select" bind:value={ligne.unite0}  onchange={(e)=>selectUnite(e, ligne, nat0, st)} style="margin-right:5px;margin-top:5px;width:80px;height:30px">
                                    <option value="" disabled hidden>Unité ...</option>
                                    {#each UNITES as unite (unite)}
                                        <option value={unite}>{unite}</option>
                                    {/each}
                                </select>
                            {/if}
                        </div>
                        <div class="sg-row" style="width:100%;margin-top:10px;margin-left:-6px">
                            {#if puQteBaseVu}
                                <label for="" class="sg-asterix" style="color:red">*</label>
                                <div class="sg-field">
                                    <input id="idPu" type="text" class="sg-input" bind:value={ligne.prixUnitaire0} style="width:80px;height:30px" placeholder=" " onfocus={(e)=>(e.target as HTMLInputElement).value = ''} onkeyup={(e)=>numericDecimal(e)} onblur={(e)=>formatDecimalFr(e, ligne, 'prixUnitaire0', ()=>calBaseHt('idPu', ligne))} maxlength="6">
                                    <label for="" class="sg-label">P.U.</label>
                                </div>
                                <label for="" class="sg-asterix" style="color:red">*</label>
                                <div class="sg-field">
                                    <input id="idQte" type="text" class="sg-input" bind:value={ligne.quantite0} style="width:80px;height:30px" placeholder=" " required onfocus={(e)=>(e.target as HTMLInputElement).value = ''} onkeyup={(e)=>numericDecimal(e)} onblur={(e)=>formatDecimalFr(e, ligne, 'quantite0', () => calBaseHt('idQte', ligne))}>
                                    <label for="" class="sg-label">Qté.</label>
                                </div>
                                <label for="" class="sg-asterix" style="color:white">*</label>
                                <div class="sg-field">
                                    <input type="text" class="sg-input" bind:value={ligne.baseHt0} onfocus={(e)=>(e.target as HTMLInputElement).blur()} style="width:100px;color:black;height:30px" placeholder=" " required>
                                    <label for="" style="color:#BFBFD0" class="sg-label">Base Ht</label>
                                </div>
                            {/if}
                            {#if forfaitVu}
                                <label for="" class="sg-asterix" style="color:red">*</label>
                                <div class="sg-field">
                                    <input id="idFor" class="sg-input" type="text" bind:value={ligne.baseHt0} onkeyup={(e)=>numericDecimal(e)} onblur={(e)=>formatDecimalFr(e, ligne, 'baseHt0', ()=>calBaseHt('idFor', ligne))} maxlength="6" style="width:100px;color:black" placeholder=" " required>
                                    <label for="" style="color:#BFBFD0" class="sg-label">Forfait Ht</label>
                                </div>
                            {/if}
                        </div>
                        <div class="sg-row" style="width:100%;margin-top:10px;margin-left:-6px">
                            {#if remMontVu}
                                <label for="" class="sg-asterix" style="color:white">*</label>
                                <div class="sg-field">
                                    <input type="text" class="sg-input" bind:value={ligne.pourRemise0} style="width:80px;height:30px" required placeholder=" " maxlength="3" onfocus={(e) => (e.target as HTMLInputElement).value = ''}
                                            onkeydown={(e) => onlyNumeric(e)}  onblur={(e) => formatEntier(e, ligne, 'pourRemise0', () => calMontHt(ligne))}>
                                    <label for="" class="sg-label">% Remise</label>
                                </div>
                                <label for="" class="asterix" style="color:white"></label>
                                <div class="sg-field">
                                    <input type="text" class="sg-input" value={ligne.montantHt0} onfocus={(e)=>(e.target as HTMLInputElement).blur()} style="width:100px;height:30px;color:black" required>
                                    <label for="" style="color:#BFBFD0" class="sg-label">Montant Ht</label>
                                </div>
                            {/if}
                            {#if fraisDebourDcVu}
                                <label for="idDcFrais" class="sg-asterix" style="color:red">*</label>
                                <div class="sg-field"> <!-- Débours : baseHt0 = montantHt0 (pas de PU × Qte) -->
                                    <input id="idDcFrais" type="text" class="sg-input" bind:value={ligne.montantHt0} onkeyup={(e)=>numericDecimal(e)}
                                            onblur={(e) => formatDecimalFr(e, ligne, 'montantHt0', () => calBaseHt('idDcFrais', ligne))} placeholder=" " style="width:100px;color:black" required>
                                    <label for="idDcFrais" class="sg-label" style="color:#BFBFD0">{libFraisDebourDc}</label>
                                </div>
                            {/if}
                            {#if facture?.regimeTva == 'B' && tvaVu}
                                <label for="" class="sg-asterix" style="color:red">*</label>
                                <select id="selectTva" class="sg-select" bind:value={ligne.tauxTva0} style="margin-right:5px;width:80px;height:30px">
                                    <option value="" disabled hidden>%Tva ...</option>
                                    {#each TAUX_TVA as taux (taux)}
                                        <option value={taux}>{taux} %</option>
                                    {/each}
                                </select>
                            {/if}
                        </div>
                    </div>

                    <!-- Div Droite : Editor -->
                    <div class="divSaisieDroite" style="margin-top:-8px">
                        <div class="toolbar">
                            <button onclick={() => formatText('bold')}      class="toolBouton" style="font-weight:bold">G</button>
                            <button onclick={() => formatText('italic')}    class="toolBouton" style="font-style:oblique">I&nbsp;</button>
                            <button onclick={() => formatText('underline')} class="toolBouton" style="text-decoration:underline">S</button>
                            <input type="color" id="colorPicker" onchange={(e)=>formatText('foreColor', (e.target as HTMLInputElement).value)} style="width:35px;height:25px">
                        </div>
                        <div id="editor" contenteditable="true" placeholder="Saisissez le Libellé de la ligne ici..." style="font-size:13px;height:135px" oninput={(e)=>libHtmlLigne=(e.target as HTMLElement).innerHTML}></div>
                    </div>
                </div>
                <div style="margin-top:5px;padding-top:5px;width:100%;text-align:center">
                    <button class="sg-button" onclick={() => handleValiderLigne()}>{libBouton}</button>
                </div>
            </fieldset>
        </div>
    {/if}
{/if}

{#if toastVisible}
    <div style="position:fixed;top:100px;left:50%;transform:translateX(-50%); padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;
        background:{toastSucces ? '#16a34a' : '#dc2626'};color:white; box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:999;white-space:nowrap">{toastMessage}
    </div>
{/if}

<!-- ═══ MODALE DE GESTION TARIF ════════════════════════════════════════════════════════════════════════════════════ -->
<dialog bind:this={tarifDialog} class="sg-divDialog" style="max-width:650px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;z-index:100" aria-labelledby="tarif-modal-titre" aria-modal="true">
    <fieldset class="sg-fieldset">
        <legend id="tarif-modal-titre" class="sg-legende" style="font-size:14px;font-weight:700;margin:0 auto">{tarifModalTitre}</legend>
        <p style="font-size:14px;color:#334155;line-height:1.7;padding:0.5rem;margin:0">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html tarifModalMessage1}
        </p>
        <div style="padding:0.5rem;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:8px">
            <label for="tarif-motcle" style="font-size:12px;color:#64748b;white-space:nowrap;flex-shrink:0">Mot-Clé</label>
            <input id="tarif-motcle" type="text" class="sg-input" bind:value={tarifMotCleInput} maxlength="20" style="width:200px;height:30px;display:inline-block;flex-shrink:0">
        </div>
        <p style="font-size:14px;color:#334155;line-height:1.7;padding:0.5rem;margin:0;text-align:center">{tarifModalMessage2}</p>
        <div class="sg-dialogFooter">
            <button type="button" class="sg-button" style="background:#2563eb;color:white;border-color:#2563eb" onclick={()=>handleTarifAction(location.pathname, ligne, tst)}>{tarifModalBtnOui}</button>
            <button type="button" class="sg-button" onclick={()=>handleTarifAnnuler(tst)}>Non</button>
        </div>
    </fieldset>
</dialog>
<!-- ═══ AUTRES MODALES ════════════════════════════════════════════════════════════════════════════════════ -->
<ModalAlerte
    bind:visible={alerteVisible}
    titre={alerteTitre}
    message={alerteMessage}
    onclose={() => alerteVisible = false}
/>
{#if confirmCloseVisible}
    <ModalConfirm
        bind:visible={confirmCloseVisible}
        titre="Abandon de la saisie"
        message="Des données ont été saisies.<br>Confirmez-vous l'abandon ?"
        labelConfirm="Abandonner"
        labelAnnuler="Continuer la saisie"
        onconfirm={() => closeSaisieLig()}
        onannuler={() => confirmCloseVisible = false}
    />
{/if}
{#if confirmDeleteVisible}
    <ModalConfirm
        bind:visible={confirmDeleteVisible}
        titre="Suppression de la Ligne"
        message="Confirmez-vous la suppression de cette ligne ?<br>Cette action est irréversible."
        labelConfirm="Supprimer"
        onconfirm={() => deleteLigne()}
        onannuler={() => { confirmDeleteVisible = false; ligneToDeleteIndex = -1; }}
    />
{/if}

<style>
    .divTitre {
        height: auto;
        margin-top: 15px;
    }
    .cssTable {
        width: 100%;
        height: auto;
        padding: 0px;
    }
    .cssTable th, td {
        border: 0.5px solid #E8E8E8;
        border-collapse: collapse;
        text-align: center; 
        vertical-align: middle;
        padding-left: 5px;
        padding-right: 5px;
    }
    .cssTable th {
        width: auto;
        height: 30px;
        color: grey;
        font-size: 13px;
        background-color: #EDEDF1; 
    }
    .cssTable td {
        opacity: 1;
        font-size: 12px;
    }
    /* Div de Saisie d'une Ligne de Facturation --------- */
    .divSaisie {
        display: flex;
        flex-direction: column;
        width: 800px;
        height: auto;
        position: absolute;
        margin-left: auto;
        margin-right: auto;
        padding: 3px;
        background-color:white;
        z-index:8;
        box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);
    }
    .divSaisieGauche {
        width: 50%;
        padding: 5px;
    }
    .divSaisieDroite {
        width: 50%;
        padding-top: 5px;
        padding-right: 10px;
    }
   /*  Editor ----------  */
    #editor {
        width: 100%;
        height: 100px;
        border: 1px solid #D2D2DF;
        padding: 5px;
        font-size: 16px;
        outline: none;
    }
    div[contenteditable]:empty::before {
        content: attr(placeholder);
        color: #aaa; /* Couleur du placeholder */
        font-style: italic; /* Style du texte */
    }
    .toolbar {
        display: flex;
        flex-direction: row;
        gap: 10px;
        margin-bottom: 1px;
    }
    .toolBouton {
        display: flex;
        align-items: center;
        justify-content:center;
        width: 30px;
        height: 25px;
    }
</style>
