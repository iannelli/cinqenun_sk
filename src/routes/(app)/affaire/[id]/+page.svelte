<script lang="ts">
    import { onMount, tick }     from 'svelte';
    import { fade }              from 'svelte/transition';
    import { invalidate }        from '$app/navigation';
    import type { ActionResult } from '@sveltejs/kit';
    import { superForm, type SuperValidated, type Infer }   from 'sveltekit-superforms';
    import { type Abonne, parseStatut }                     from '$lib/schemas/abonne';
    import { type Affaire, AffaireFormSchema }              from '$lib/schemas/affaire';
    import { type Facture, createFactureTotauxState }       from '$lib/schemas/facture';
    import { createRecetteVide }                            from '$lib/schemas/recette';
    import { prepareUpdateAffaire, checkAffaireSupprimable} from '$lib/components/affaire/AffairePage.utils';
    import { deleteFacture, annulationFacture, type SupprAnnulContext, type AnnulationSituation } from '$lib/components/facture/FactureSupprAnnul.utils';
    import { handleSelectCreate, type SelectCreateContext }                                       from '$lib/components/facture/FactureSelectCreate.utils';
    import { formatDate, formatMontant, libFacTypeDelai  }                                        from '$lib/utils/format';
    import { traitColSpan, traitLibTotaux, traitLibBasPage, traitLigneTotal } from '$lib/utils/fonctionsTotaux';
    // ─── Composants ───────────────────────────────────────────────
    import ModalFacture      from '$lib/components/facture/ModalFacture.svelte';
    import ModalEncaissement from '$lib/components/encaissement/ModalEncaissement.svelte';
    import ModalAlerte       from '$lib/components/ModalAlerte.svelte';
    import ModalConfirm      from '$lib/components/ModalConfirm.svelte';
    import ModalChoixPdf     from '$lib/components/facture/ModalChoixPdf.svelte';

    // Contexte passé à la fonction "onHandleSelectCreate()" :
    const selectCreateCtx: SelectCreateContext = {
        get statutRaw()  { return data.statutRaw; },
        get client()     { return data.client; },
        get factures()   { return data.factures; },
        get totState()   { return totState; },
        calNum,
        showAlerte:      (titre, msg) => { alerteTitre=titre; alerteMessage=msg; alerteVisible=true; },
        setDevisOptions: (options) => { modalFactureDevisOptions = options; },
        setModalFacture: (mode, action, facture) => {
            modalFactureMode    = mode;
            modalFactureAction  = action;
            modalFactureFacture = facture;
            showModalFacture    = true;
        },
    };

    let bandeauVisible  = $state(false);
    let bandeauMessage  = $state('');
    let bandeauSucces   = $state(true);
    function showToast(message:string, succes=true):void {
        bandeauMessage  = message;
        bandeauSucces   = succes;
        bandeauVisible  = true;
        setTimeout(() => bandeauVisible=false, 3000);
    }

    let facAcompteToUpdate = $state<typeof data.factures[0] | null>(null);
    let annulationSituation = $state<AnnulationSituation | null>(null);

    // ─── Props (déclaré AVANT onMount pour que data.affaire soit accessible) ──
    let { data }: {
        data: {
            abonne:     Abonne;
            affaire:    Affaire;
            factures:   Facture[];
            updateForm: SuperValidated<Infer<typeof AffaireFormSchema>>;
            clients:    { id:number; libClient:string }[];
            tarifs:     import('$lib/schemas/tarif').Tarif[];
            client:     { libClient:string; adres:string|null; adresCompl:string|null; cp:string|null; ville:string|null; pays:string|null; contNom:string|null; 
                          contPhone:string|null; temoinCee:number|null; temoinTva:number|null; temoinType:number|null ; soldeCredit:number|null} | null;
            statutRaw:  string;
            recettes:   import('$lib/schemas/recette').Recette[];
        };
    } = $props();
    const supprAnnulCtx: SupprAnnulContext = {
        get factures()           { return data.factures; },
        get abonne()             { return data.abonne; },
        get affaire()            { return data.affaire; },
        get facAcompteToUpdate() { return facAcompteToUpdate; },
        showAlerte:  (titre, msg) => { alerteTitre=titre; alerteMessage=msg; alerteVisible=true; },
        showToast:   (msg) => showToast(msg),
        onSuccess:   async () => { await invalidate('app:affaire'); }
    };
    let recettes = $derived(data.recettes ?? []);
    let modalFactureDevisOptions = $state<string[]>([]);
    const totState = $state(createFactureTotauxState());

    // ─── ToolTip Ligne Liste des Factures ──────────────────────────────────
    let hoveredFacture = $state<Facture | null>(null);
    let tooltipStyleF  = $state('');
    let hideTimerF: ReturnType<typeof setTimeout> | undefined;
    function onFactureRowEnter(e: MouseEvent, facture: Facture) {
        clearTimeout(hideTimerF);
        const rect     = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleF  = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
        hoveredFacture = facture;
    }
    function onFactureRowMove(e: MouseEvent) {
        if (!hoveredFacture) return;
        clearTimeout(hideTimerF);
        const rect    = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleF = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
    }
    function onFactureRowLeave() {
        hideTimerF = setTimeout(() => { hoveredFacture = null; }, 300);
    }
    function onFactureTooltipEnter() { clearTimeout(hideTimerF); }
    function onFactureTooltipLeave() {
        hideTimerF = setTimeout(() => { hoveredFacture = null; }, 300);
    }

    // ─── État réactif – Liste des documents 'Créables' ──────────────
    const documents = $derived.by(() => {
        const devis = data.affaire.devis;
        if (!devis) return ['Devis', 'Facture'];
        const arr   = devis.split('|');
        if (arr.length > 1) {
            const result   = ['Devis'];
            const devisArr = arr.filter(Boolean);
            for (const ref of devisArr) {
                result.push('Facture par copie du Devis ' + ref);
            }
            result.push('Facture');
            return result;
        }
        return ['Devis', 'Facture'];
    });
    let mounted = $state(false);
    onMount(() => {
        mounted = true;
        document.body.style.cursor = '';
    });

    // ── Calcul du N° de Devis ou du N° numéro provisoire d'une "Facture Brouillon" au format (hhmmjjmmaaaa) ────────────────────
    function calNum(): string {
        const d      = new Date();
        const jour   = String(d.getDate()).padStart(2, '0');
        const mois   = String(d.getMonth() + 1).padStart(2, '0');
        const an     = d.getFullYear();
        const heure  = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        return heure + minute + jour + mois + an;
    }

    // ─── SuperForm – modification Affaire ────────────────────────
    const initialForm = data.updateForm;
    const {form:affaireForm, errors:affaireErrors, enhance:enhanceAffaire, submitting:affaireSubmitting,  reset:resetAffaire,} = superForm(initialForm, {
        id:'affaire',
        onResult: ({ result }: { result:ActionResult }) => {
            if (result.type === 'success') {
                affaireDialog?.close();
                resetAffaire();
            }
        },
    });

    // ─── Modal Alerte ─────────────────────────────────────────
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');

    // ─── Refs modales (Affaire + Suppression Facture) ─────────────
    let affaireDialog       = $state<HTMLDialogElement | null>(null);
    let deleteAffaireDialog = $state<HTMLDialogElement | null>(null);

    // ─── État – ModalFacture ──────────────────────────────────────
    let showModalFacture    = $state(false);
    let modalFactureMode    = $state<'create' | 'update'>('create');
    let modalFactureAction  = $state('');
    let modalFactureFacture = $state<Facture | null>(null);

    // ─── État – autres modales ────────────────────────────────────
    let deletingAffaire    = $state(false);
    let factureToDelete    = $state<Facture | null>(null);
    let factureToEncaisser: Facture | null = $state(null);
    let showModalPdf       = $state(false);
    let pdfFacture         = $state<Facture | null>(null);

    async function handleOpenPdf() {
        if (modalFactureFacture) {
            // Toujours utiliser modalFactureFacture qui contient les mutations en cours
            await tick();
            pdfFacture   = modalFactureFacture;
            showModalPdf = true;
        }
    }

    // ─── Variables utilisées par la fonction conditionDeleteAnnulFacture ────────────────────────────────────
    type DeleteSituation =
        | { type: 'devis-simple' }
        | { type: 'devis-seul';         fbId: number }
        | { type: 'devis-et-fb';        fbId: number }
        | { type: 'fb-simple' }
        | { type: 'fb-avec-devis';      devId: number }
        | { type: 'fb-avec-facAcompte'; faId: number };
    let deleteSituation = $state<DeleteSituation | null>(null);

    // ─── Variables Modale Confirm ────────────────────────────────────
    let confirmDeleteFactureVisible  = $state(false);
    let confirmDeleteFactureMessage  = $state('');
    let confirmAnnulFactureVisible   = $state(false);
    let confirmAnnulFactureMessage   = $state('');

    // ─── Modale à 3 boutons (Devis en relation avec une Facture Brouillon) ──
    let choixSuppressionDevisVisible = $state(false);
    let choixSuppressionDevisMessage = $state('');
    let fbEnRelationId = $state<number | null>(null);

    // ─── Handlers – Affaire ───────────────────────────────────────
    function openUpdateAffaire() {
        prepareUpdateAffaire(data.affaire, (lib, cid) => {
            $affaireForm.libAffaire = lib;
            $affaireForm.clientId   = cid;
        });
        affaireDialog?.showModal();
    }
    function closeUpdateAffaire() {
        affaireDialog?.close();
        resetAffaire();
    }
    function openDeleteAffaire(): void {
        if (checkAffaireSupprimable(data.factures ?? [], {
            setVisible: (v) => alerteVisible = v,
            setTitre:   (v) => alerteTitre   = v,
            setMessage: (v) => alerteMessage = v,
        })) {
            deleteAffaireDialog?.showModal();
        }
    }
    function enhanceDeleteAffaire(formEl: HTMLFormElement) {
        formEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            deletingAffaire = true;
            const resp = await fetch(formEl.action, {
                method: 'POST',
                body:    new FormData(formEl),
            });
            deletingAffaire = false;
            if (resp.ok) { closeDeleteAffaire(); window.location.href = '/affaire'; }
        });
    }
    function closeDeleteAffaire() { deleteAffaireDialog?.close(); }

    // ─────────────────────────────────────────────────────────────────────────────
    // Fonctions d'Affichage des "Boutons-Icon" d'Action sur les lignes des Devis et Facture
    // ─────────────────────────────────────────────────────────────────────────────
    function afficheIconModifier(f:Facture) {
        if ( (f.codeType == 10 && Number((f.acompMont ?? '0').replace(/[,]/, '.')) > 0 && f.statutCode == 20) || // Devis avec Acompte Réglé
            (f.codeType == 20) || // Facture d'Acompte
            (f.codeType == 30 && (f.statutCode < 13 || f.statutCode > 16)) || // Facture Validée
            (f.codeType == 40) ) { // Facture d'Avoir
            return false;
        } else {
            return true;
        }
    }
    function afficheIconEncaissement(f:Facture) {
        let retour = true;
        switch ( f.codeType ) {
            case 10 : // Devis ----
                if (String(f.statutCode).slice(0, 1) === '2') {
                    retour = false;
                } else {
                    if (Number(f.acompTaux) == 0) { retour = false }
                }
                break;
            case 20 : // Facture d'Acompte ----
                retour = false;
                break;
            case 30 : // Facture ----
                if (f.statutCode == 1) { // Facture Annulée
                    retour = false;
                }
                if (f.statutCode >= 13 && f.statutCode < 17) { // "Facture Brouillon"
                    retour = false;
                }
                if (f.statutCode == 21) { // Facture Réglée
                    retour = false;
                }
                if (f.statutCode == 22) { // Facture Réglée avec excédent
                    retour = false;
                }
                if (f.statutCode > 22 && f.statutCode < 28) { // Facture Validée en Instance d'Encaissement ou Facture Réglée partiellement
                    retour = true;
                }
                if (f.statutCode == 28) { // Facture à Annuler (Perte de la Franchise Tva)
                    retour = false;
                }
                break;
            case 40: { // Facture d'Avoir ----
                retour = false;
            }
        };
        return retour;
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Handlers – ModalFacture (Création / Modification) - from '$lib/components/affaire/affaireSelectCreate.utils';
    // ─────────────────────────────────────────────────────────────────────────────
    async function onHandleSelectCreate(e: Event) {
        await handleSelectCreate(e, selectCreateCtx);
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Edition d'un Devis / Facture pour Modification
    // ─────────────────────────────────────────────────────────────────────────────
    function conditionUpdateFacture(f: Facture) {
        const { statutFiscal0 } = parseStatut(data.statutRaw);
        if (statutFiscal0 === '') {
            alerteTitre   = 'Saisies obligatoires';
            alerteMessage = "Avant de Modifier un Devis ou une Facture,<br>il convient au préalable de saisir votre Statut Fiscal<br>accessible par le menu <strong>'Mon Compte / Fiscalité'</strong>.";
            alerteVisible = true;
            return;
        }
        // ── Alimenter devisOptions pour le select FactureEntete ───────
        if (f.refDevis) {
            const devisAffaire = (data.affaire.devis ?? '').split('|').filter(Boolean);
            modalFactureDevisOptions = [...new Set([f.refDevis, ...devisAffaire])];
        } else {
            modalFactureDevisOptions = (data.affaire.devis ?? '').split('|').filter(Boolean);
        }
        // ── Réinitialisation de totState ──────────────────────────────
        const fresh = createFactureTotauxState();
        Object.assign(totState, fresh);
        modalFactureMode    = 'update';
        modalFactureAction  = '';
        modalFactureFacture = { ...f };
        showModalFacture    = true;
    }
    function closeModalFacture() {
        showModalFacture    = false;
        modalFactureFacture = null;
        modalFactureAction  = '';
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Examen des conditions de Suppression / Annulation d'une ligne de Devis ou Facture 
    // ─────────────────────────────────────────────────────────────────────────────
    function conditionDeleteAnnulFacture(f:Facture) {
        alerteVisible    = false;
        factureToDelete  = f;
        deleteSituation  = null;
        switch (true) {
            // ─── Suppression d'un Devis ────────────────────────────────
            case f.codeType == 10: {
                if (f.statutCode !== 20) {
                    // I.1.1 / I.1.2 — non Signé/Réglé (avec ou sans acompte : même comportement)
                    if (!f.refDevis) {
                        // I.1.1.1 / I.1.2.1
                        deleteSituation             = { type:'devis-simple' };
                        confirmDeleteFactureMessage = "Confirmez-vous la Suppression de ce Devis ?";
                        confirmDeleteFactureVisible = true;
                    } else {
                        // I.1.1.2 / I.1.2.2 — en relation avec une Facture Brouillon
                        const fb = data.factures.find(fac => fac.codeType === 30 && fac.refFac === f.refDevis);
                        if (fb) {
                            fbEnRelationId               = fb.id;
                            choixSuppressionDevisMessage = "Le Devis à supprimer est en relation avec la 'Facture Brouillon' (" + fb.refFac + "). Que souhaitez-vous faire ?";
                            choixSuppressionDevisVisible = true;
                        }
                    }
                } else {
                    // I.2 — Devis Signé/Réglé
                    const statut = String(f.statut ?? '');
                    if (statut.includes('Devis Signé')) {
                        alerteTitre   = "Information sur la Suppression du Devis";
                        alerteMessage = "Par soucis de cohérence, vous devez d'abord Annuler la Facture d'Imputation (" + f.refDevis + ") avant de Supprimer ce Devis";
                        alerteVisible = true;
                    } else if (statut.includes('Devis Acompte Réglé')) {
                        alerteTitre   = "Information sur la Suppression du Devis";
                        alerteMessage = "Par soucis de cohérence, vous devez d'abord Annuler la Facture d'Acompte (" + f.refDevis + ") avant de Supprimer ce Devis";
                        alerteVisible = true;
                    }
                }
                break;
            }
            // ─── Suppression d'une Facture "Brouillon" ─────────────────
            case f.codeType == 30 && [13, 14, 15, 16].includes(Number(f.statutCode)): {
                if (!f.refDevis && !f.refPre) { // II.1
                    deleteSituation             = { type:'fb-simple' };
                    confirmDeleteFactureMessage = "Confirmez-vous la Suppression de cette 'Facture Brouillon' ?";
                    confirmDeleteFactureVisible = true;
                } else if (f.refDevis && !f.refPre) { // II.2.1
                    const dev = data.factures.find(fac => fac.codeType === 10 && fac.refFac === f.refDevis);
                    if (dev) {
                        deleteSituation             = { type:'fb-avec-devis', devId:dev.id };
                        confirmDeleteFactureMessage = "Confirmez-vous la Suppression de cette 'Facture Brouillon' ?";
                        confirmDeleteFactureVisible = true;
                    }
                } else if (!f.refDevis && f.refPre) { // II.2.2
                    const fa = data.factures.find(fac => fac.codeType === 20 && fac.refFac === f.refPre);
                    if (fa) {
                        deleteSituation             = { type:'fb-avec-facAcompte', faId:fa.id };
                        confirmDeleteFactureMessage = "Confirmez-vous la Suppression de cette 'Facture Brouillon' ?";
                        confirmDeleteFactureVisible = true;
                    }
                }
                break;
            }
            // ─── Tentative d'Annulation ────────────────────────────
            case (f.codeType == 20 || f.codeType == 30) && f.statutCode == 1 : // d'une Facture déjà Annulée ----
                alerteTitre   = "Annulation non autorisée";
                alerteMessage =  "Cette Facture est déjà Annulée et ne peut l'être de nouveau.";
                alerteVisible = true;
                break;
            case f.codeType == 40 : // d'une Facture d'Avoir -------
                alerteTitre   = "Annulation non autorisée";
                alerteMessage = "Conformément à la Réglementation fiscale et comptable, cette Facture d’Avoir ne peut être ni Supprimée, ni Annulée.";
                alerteVisible = true;
                break;
            // Annulation d'une Facture d'Acompte ────────────────────────────
            case f.codeType == 20 && f.statutCode == 21: {
                if (f.refPre != '' && f.refPre != null) {
                    const facImput = data.factures.find(fi => fi.codeType == 30 && fi.refPre === f.refFac);
                    if (facImput && facImput.refFac.slice(0, 2) == 'FB') {
                        annulationSituation        = { type: 'acompte-avec-fb', fbId: facImput.id };
                        confirmAnnulFactureMessage = "L'Annulation de cette Facture d'Acompte créera automatiquement une Facture d'Avoir.<br>De plus, cet Acompte ayant été imputé sur la `Facture Brouillon` (" + facImput.refFac + "), cette dernière sera Supprimée.<br> Confirmez-vous l'Annulation de cette Facture d'Acompte ?";
                        confirmAnnulFactureVisible = true;
                    } else {
                        alerteTitre   = "Information sur l'Annulation de la Facture d'Acompte";
                        alerteMessage = "Par soucis de cohérence, avant d'Annuler cette Facture d'Acompte, il convient d'Annuler d'abord la Facture d'Imputation (" + f.refPre + ") de cette Acompte.";
                        alerteVisible = true;
                    }
                } else {
                    annulationSituation        = { type: 'acompte-simple' };
                    confirmAnnulFactureMessage = "Confirmez-vous l'Annulation de cette Facture d'Acompte (cette opération est irréversible) ?<br> N.B. Dans l'affirmative, une Facture d'Avoir sera créée.";
                    confirmAnnulFactureVisible = true;
                }
                break;
            }
            // Annulation d'une "Facture Validée" autre qu'une Facture d’Acompte ────────────────────────────
            case f.codeType == 30 && [22, 23, 24, 25, 26, 27, 28].includes(Number(f.statutCode)): {
                const facAcompte = (f.refPre != '' && f.refPre != null)
                    ? data.factures.find(fa => fa.codeType == 20 && fa.refPre === f.refFac)
                    : undefined;
                annulationSituation = facAcompte
                    ? { type: 'validee-avec-facAcompte', faId: facAcompte.id }
                    : { type: 'validee-simple' };
                confirmAnnulFactureMessage = "Confirmez-vous l'Annulation de cette Facture (cette opération est irréversible) ?<br> N.B. Dans l'affirmative, une Facture d'Avoir sera créée.";
                confirmAnnulFactureVisible = true;
            }
        };
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Handlers Encaissement : Ouvrir ModalFacture (Création / Modification)
    // ─────────────────────────────────────────────────────────────────────────────
    function openEncaissement(f: Facture) {
        factureToEncaisser = { ...f };
    }
    function closeEncaissement() {
        factureToEncaisser = null;
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Affichage de la Modal de l'Option PDF à choisir
    // ─────────────────────────────────────────────────────────────────────────────
    async function openModalChoixPdf(f: Facture) {
        const fresh = createFactureTotauxState();
        Object.assign(totState, fresh);
        const fac = data.factures.find(fa => fa.refFac === f.refFac);
        if (!fac) return;
        if (fac.codeType === 30 && fac.refPre) {
            const facAcompte = data.factures.find(fa => fa.refFac === fac.refPre);
            if (facAcompte) {
                totState.imputAcomp0     = fac.regimeTva !== 'B' ? '2' : '3';
                totState.acompteId0      = facAcompte.id;
                totState.acompPresta0    = String(facAcompte.totPrestaHt ?? '0,00');
                totState.acompVente0     = String(facAcompte.totVenteHt  ?? '0,00');
                if (fac.regimeTva === 'B' && facAcompte.total) {
                    totState.acompMontArray0 = facAcompte.total.split('|').map((row: string) => {
                        const lig = row.split('¤');
                        return `${lig[0] ?? ''}¤${lig[2] ?? '0,00'}`;
                    });
                }
            }
        }
        if (fac.codeType === 20) {
            traitColSpan(fac, totState);
            traitLibTotaux(fac, totState);
            traitLibBasPage(fac, totState);
        } else if (fac.codeType === 30 && parseFloat(String(fac.imputCreCli ?? '0').replace(',', '.')) > 0) {
            // ← Facture brouillon avec imputation : ne pas recalculer facture.total
            traitLibTotaux(fac, totState);
            traitColSpan(fac, totState);
            totState.colSpanTot0 += 1;
            traitLibBasPage(fac, totState);
        } else {
            traitLigneTotal(fac, totState);
            traitLibBasPage(fac, totState);
        }
        await tick();
        pdfFacture   = fac;
        showModalPdf = true;
    }
    const libType: Record<string, string> = {
        10:'Devis', 20:'Acompte', 30:'Facture', 40:'Avoir'
    };
</script>

<!-- ═══ BANDEAU MESSAGE ══════════════════════════════════════════ -->
{#if bandeauVisible}
    <div class="sg-bandeau {bandeauSucces ? 'sg-bandeau--succes' : 'sg-bandeau--erreur'}">
        {bandeauMessage}
    </div>
{/if}

<!-- Confirmation suppression Devis/Facture brouillon (2 boutons)  -->
<ModalConfirm bind:visible={confirmDeleteFactureVisible} titre="Suppression du document" message={confirmDeleteFactureMessage} labelConfirm="Supprimer"
    onconfirm={async () => {
        confirmDeleteFactureVisible = false;
        if (factureToDelete && deleteSituation) await deleteFacture(factureToDelete, supprAnnulCtx, deleteSituation);
    }}
    onannuler={() => confirmDeleteFactureVisible = false}
/>
<!-- Confirmation suppression Devis/Facture brouillon (3 boutons)  -->
<ModalConfirm bind:visible={choixSuppressionDevisVisible} titre="Suppression du Devis" message={choixSuppressionDevisMessage}
    labelConfirm = "Supprimer le Devis et la Facture Brouillon"
    labelAutre   = "Supprimer uniquement le Devis"
    labelAnnuler = "Annuler"
    onconfirm={async () => {
        choixSuppressionDevisVisible = false;
        if (factureToDelete && fbEnRelationId) {
            await deleteFacture(factureToDelete, supprAnnulCtx, { type:'devis-et-fb', fbId:fbEnRelationId });
        }
    }}
    onautre={async () => {
        choixSuppressionDevisVisible = false;
        if (factureToDelete && fbEnRelationId) {
            await deleteFacture(factureToDelete, supprAnnulCtx, { type:'devis-seul', fbId:fbEnRelationId });
        }
    }}
    onannuler={() => { choixSuppressionDevisVisible = false; fbEnRelationId = null; }}
/>
<!-- Confirmation annulation Facture validée -->
<ModalConfirm bind:visible={confirmAnnulFactureVisible} titre="Annulation de la Facture" message={confirmAnnulFactureMessage} labelConfirm="Confirmer l'Annulation" maxWidth="1000px"
    onconfirm={async () => {
        confirmAnnulFactureVisible = false;
        if (factureToDelete && annulationSituation) await annulationFacture(factureToDelete, supprAnnulCtx, annulationSituation);
    }}
    onannuler={() => { confirmAnnulFactureVisible = false; annulationSituation = null; }}
/>
{#if mounted}
    <div class="facture-page" in:fade="{{ duration:1500 }}">
        <!-- ===== EN-TÊTE ===== -->
        <h3 style="text-align:center">
            Liste des Factures : <em>{data.affaire.libAffaire}</em> — {data.affaire.libClient}
        </h3>
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-top:5px;margin-bottom:30px">
            <!-- 4 – Retour (gauche, inchangé) -->
            <button class="sg-link btn-retour" style="font-size:16px" onclick={() => { window.location.href = '/affaire'; }}> ← Retour à la Liste des Affaires</button>
            <!-- 3 – Créer un document (centré) -->
            <div style="position:absolute;left:50%;transform:translateX(-50%)">
                <select class="sg-select" style="margin-top:32px" onchange={onHandleSelectCreate}>
                    <option value="" disabled selected hidden>Créer un Nouveau Devis ou une Nouvelle Facture …</option>
                    {#each documents as document (document)}
                        <option value={document}>{document}</option>
                    {/each}
                </select>
            </div>
            <!-- 2 & 1 – Actions affaire (droite) -->
            <div style="display:flex;gap:24px;align-items:center">
                <button class="sg-link" style="font-size:16px" onclick={openUpdateAffaire}>Modifier l'Affaire</button>
                <button class="sg-link btn-danger" style="font-size:16px" onclick={openDeleteAffaire}>Supprimer l'Affaire</button>
            </div>
        </div>
        <!-- ===== TABLEAU DES FACTURES ===== -->
        <div class="table-wrapper">
            <table class="sg-myTable">
                <thead>
                    <tr style="color:gray">
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Référence</th>
                        <th>Date d'émission</th>
                        <th style="text-align:center">Délai</th>
                        <th class="col-montant">Total TTC</th>
                        <th class="col-montant">Réglé</th>
                        <th class="col-montant">Solde</th>
                        <th class="sg-thOverlay"></th>
                    </tr>
                </thead>
                <tbody>
                    {#if data.factures.length === 0}
                        <tr class="sg-trSha">
                            <td colspan="10" class="empty-state">Aucune facture pour cette affaire.</td>
                        </tr>
                    {:else}
                        {#each data.factures as facture (facture.id)}
                            <tr class="sg-trSha {hoveredFacture?.id === facture.id ? 'sg-trSha--hovered' : ''}" onmouseenter={(e)=>{clearTimeout(hideTimerF);onFactureRowEnter(e, facture)}}
                                onmousemove={onFactureRowMove} onmouseleave={onFactureRowLeave}>
                                <td><span class="badge-type badge-type--{facture.codeType}">{libType[facture.codeType] ?? facture.codeType}</span></td>
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                <td>{@html facture.statut}</td>
                                <td class="col-ref">{facture.refFac}</td>
                                <td>{formatDate(facture.dateEmis)}</td>
                                <td style="text-align:center">{libFacTypeDelai(facture.typeDelai, facture.delai)}</td>
                                <td class="col-montant">{formatMontant(facture.totTtc)}</td>
                                <td class="col-montant col-regle">{formatMontant(facture.totRegl)}</td>
                                <td class="col-montant col-solde">{formatMontant(facture.solde)} </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
            {#if hoveredFacture}
                {@const hovered = hoveredFacture}
                <div role="toolbar" tabindex="-1"style="position:fixed;{tooltipStyleF};z-index:100;display:flex;gap:13px;padding:4px 12px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);pointer-events:auto"
                    onmouseenter={onFactureTooltipEnter} onmouseleave={onFactureTooltipLeave}>
                    <button class="sg-btn ttBtn" data-tooltip={hovered.codeType === 10 ? "Supprimer le Devis"
                                        : hovered.refFac.slice(0, 2) === 'FB' ? "Supprimer la Facture Brouillon"
                                        : hovered.codeType === 20 ? "Annuler la Facture d'Acompte" : "Annuler la Facture"} onclick={()=>conditionDeleteAnnulFacture(hovered)}><img src="/trash.png" alt="Supprimer"/>
                    </button>
                    {#if afficheIconModifier(hovered)}
                        <button class="sg-btn ttBtn" data-tooltip={hovered.codeType === 10 ? "Editer le Devis" : "Editer/Valider la Facture Brouillon"} onclick={()=>conditionUpdateFacture(hovered)}>
                            <img src="/pencil.png" alt="Modifier"/>
                        </button>
                    {/if}
                    {#if afficheIconEncaissement(hovered)}
                        <button class="sg-btn ttBtn" data-tooltip="Enregistrer un Encaissement" onclick={()=>openEncaissement(hovered)}><img src="/money.png" alt="Encaissement"/></button>
                    {/if}
                    <button class="sg-btn ttBtn" data-tooltip="Télécharger la version PDF" onclick={()=>openModalChoixPdf(hovered)}><img src="/pdf.png" alt="PDF"/></button>
                </div>
            {/if}
        </div>
    </div>
{/if}
<!-- ═══════════════════════════════════════════════════════════════════
     MODAL ALERTE
════════════════════════════════════════════════════════════════════════ -->
<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} onclose={()=>alerteVisible=false}/>

<!-- ═══════════════════════════════════════════════════════════════════
     MODAL FACTURE — Création ET Modification
════════════════════════════════════════════════════════════════════════ -->
{#if showModalFacture}
    <ModalFacture affaireId={data.affaire.id} clientId={data.affaire.clientId ?? 0} affaire={data.affaire} mode={modalFactureMode} action={modalFactureAction}
                  bind:facture={modalFactureFacture} clients={data.clients} client={data.client} factures={data.factures} abonne={data.abonne} devisOptions={modalFactureDevisOptions}
                  tarifs={data.tarifs ?? []} statutRaw={data.statutRaw} onclose={closeModalFacture} onrefresh={async()=>{ await invalidate('app:affaire')}} {totState} onOpenPdf={handleOpenPdf}/>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════
     MODALE – MODIFICATION AFFAIRE
════════════════════════════════════════════════════════════════════════ -->
<dialog bind:this={affaireDialog} class="sg-divDialog">
    <fieldset class="sg-fieldset">
        <legend class="sg-legende" style="font-size:14px">Modification de l'Affaire</legend>
        <button class="sg-dialogFermer" title="Annuler" onclick={closeUpdateAffaire}><img src="/close.png" alt=""/></button>
        {#if $affaireErrors.libAffaire || $affaireErrors.clientId}
            <div class="form-errors">
                {#if $affaireErrors.libAffaire}<p class="field-error">⚠ Libellé : {$affaireErrors.libAffaire}</p>{/if}
                {#if $affaireErrors.clientId}<p class="field-error">⚠ Client : {$affaireErrors.clientId}</p>{/if}
            </div>
        {/if}
        <form method="POST" action="?/updateAffaire" use:enhanceAffaire>
            <input type="hidden" name="id" value={data.affaire.id} />
            <div class="sg-row" style="margin-top:15px">
                <span class="sg-asterix">*</span>
                <div class="sg-field" style="flex:1">
                    <input id="upd-libAffaire" name="libAffaire" type="text" class="sg-input" placeholder=" " bind:value={$affaireForm.libAffaire} required/>
                    <label for="upd-libAffaire" class="sg-label">Libellé</label>
                </div>
                <span class="sg-asterix">*</span>
                <div style="flex:1">
                    <select class="sg-select" id="upd-clientId" name="clientId" value={$affaireForm.clientId || ''} onchange={(e) => $affaireForm.clientId = Number(e.currentTarget.value)}>
                        <option value="" disabled>— Sélectionner un client —</option>
                        {#each data.clients as client (client.id)}
                            <option value={client.id}>{client.libClient}</option>
                        {/each}
                    </select>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;white-space:nowrap;flex:0 0 auto;margin-top:4px">
                    <span style="font-size:0.85rem;font-weight:600;color:#475569;margin:0;">Créée le</span>
                    <span class="form-info-inline">{formatDate(data.affaire.createdAt)}</span>
                </div>
            </div>
            <div class="sg-dialogFooter">
                <button type="submit" class="sg-button" disabled={$affaireSubmitting}>{$affaireSubmitting ? 'En cours…' : 'Modifier'}</button>
                <button type="button" class="sg-button" onclick={closeUpdateAffaire}>Annuler</button>
            </div>
        </form>
    </fieldset>
</dialog>

<!-- ═══════════════════════════════════════════════════════════════════
     MODALE – SUPPRESSION AFFAIRE
════════════════════════════════════════════════════════════════════════ -->
<dialog bind:this={deleteAffaireDialog} class="sg-divDialog">
    <fieldset class="sg-fieldset">
        <legend class="sg-legende" style="font-size:14px">Suppression de l'Affaire</legend>
        <button class="sg-dialogFermer" title="Annuler" onclick={closeDeleteAffaire}><img src="/close.png" alt=""/></button>
        <p class="confirm-text" style="font-size:16px">Confirmez-vous la Suppression l'Affaire<strong>« {data.affaire.libAffaire} »</strong>. Cette Suppression entraînera celle de toutes ses Devis et Factures ? Cette action est irréversible.</p>
        <form method="POST" action="?/deleteAffaire" use:enhanceDeleteAffaire style="margin-top:10px">
            <input type="hidden" name="id" value={data.affaire.id} />
            <div class="sg-dialogFooter">
                <button type="submit" class="btn-delete-confirm" disabled={deletingAffaire}>{deletingAffaire ? 'Suppression…' : 'Supprimer'}</button>
                <button type="button" class="btn-cancel" onclick={closeDeleteAffaire}>Annuler</button>
            </div>
        </form>
    </fieldset>
</dialog>

<!-- ═══════════════════════════════════════════════════════════════════
     MODALE – ENCAISSEMENT (composant externe – stub)
════════════════════════════════════════════════════════════════════════ -->
{#if factureToEncaisser}
    <ModalEncaissement facture={factureToEncaisser} factures={data.factures} recette={createRecetteVide()} recettes={recettes} affaire={data.affaire} abonne={data.abonne} onclose={closeEncaissement}
                        onrefresh={async()=>{ await invalidate('app:affaire')}} />
{/if}

<!--Affichage Choix du type de PDF / Factur-X -->
{#if showModalPdf && pdfFacture}
    <ModalChoixPdf facture={pdfFacture} abonne={data.abonne} totState={totState} libAffaire={data.affaire.libAffaire} onclose={()=>{showModalPdf=false; pdfFacture=null}}/>
{/if}

<style>
    [title] {
        position: relative;
    }
    [title]:hover::after {
        content: attr(title);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 100;
        pointer-events: none;
    }
    .facture-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    /* ── Bandeau Message ── */
    .sg-bandeau {
        width:        100%;
        padding:      10px 20px;
        text-align:   center;
        font-size:    14px;
        font-weight:  600;
        border-radius: 4px;
        margin-bottom: 10px;
    }
    .sg-bandeau--succes {
        background: #dcfce7;
        color:       #16a34a;
        border:      1px solid #86efac;
    }
    .sg-bandeau--erreur {
        background: #fee2e2;
        color:       #dc2626;
        border:      1px solid #fca5a5;
    }
    /* ── Barre d'actions ── */
    .page-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-top: -40px;
        margin-bottom: 5px;
        padding-right: 20px;
    }
    .btn-retour { margin-right: auto; }
    .btn-danger { color: #dc2626 !important; }
    /* ── Tableau ── */
    .col-montant {
        text-align: center;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .col-ref      { font-family: monospace; font-size: 0.85rem; }
    .col-penalite { color: #d97706; }
    .col-regle    { color: #16a34a; }
    .col-solde    { color: #dc2626; font-weight: 600; }
    .empty-state {
        text-align: center;
        color: #94a3b8;
        padding: 2rem;
        font-style: italic;
    }
    .badge-type {
        display: inline-block;
        padding: 1px 7px;
        border-radius: 10px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
    }
    .badge-type--dv { background: #e0f2fe; color: #0369a1; }
    .badge-type--fa { background: #f0fdf4; color: #15803d; }
    .badge-type--av { background: #fef9c3; color: #a16207; }
    .badge-type--ac { background: #f3e8ff; color: #7e22ce; }
    :global(.sg-divDialog--large) {
        width: min(900px, 92vw);
        max-width: 92vw;
    }
    .form-errors { padding: 0.5rem 1.5rem 0; }
    .field-error {
        font-size: 0.78rem;
        color: #dc2626;
        margin: 0.2rem 0;
    }
    .form-info-inline {
        display: inline-block;
        font-size: 0.9rem;
        color: #64748b;
        padding: 0.25rem 0.6rem;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        white-space: nowrap;
    }
    .btn-cancel {
        padding: 0.5rem 1.1rem;
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-cancel:hover { background: #e2e8f0; }
    .confirm-text {
        font-size: 0.9rem;
        color: #334155;
        line-height: 1.55;
        margin: 0;
    }
    .btn-delete-confirm {
        padding: 0.5rem 1.3rem;
        background: #dc2626;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-delete-confirm:hover:not(:disabled) { background: #b91c1c; }
    .btn-delete-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

    /* Boutons du Tooltip d'actions ---------- */
    .ttBtn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        margin: 0;
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
        transition: background 0.15s;
    }
    .ttBtn img {
        display: block;
        width: 17px;
        height: 17px;
    }
</style>
