<script lang="ts">
    import { onMount, onDestroy }  from 'svelte';
    import { deserialize }         from '$app/forms';
    import { type Facture, parseClientFacture, createFactureVide } from '$lib/schemas/facture';
    import type { Recette }                                        from '$lib/schemas/recette';
    import type { Affaire }                                        from '$lib/schemas/affaire';
    import type { Abonne }                                         from '$lib/schemas/abonne';
    import { numberToFrStr, formatDate, formatMontant } from '$lib/utils/format';
    import { numericDecimal }                           from '$lib/utils/numeric';
    import { drawerInfoUtils }                          from '$lib/utils/drawerInfo';
    import { fiscPena, excedent }                       from '$lib/utils/messageInfo';
    import ModalConfirm                                 from '$lib/components/ModalConfirm.svelte';
    import { createFacAcompteRec, prepaRecetteInitTva, prepaRecetteInitFranchise, prepaRecetteComplTva, prepaRecetteComplFranchise } from '$lib/components/encaissement/encaissement';
    import { rt }                                       from '$lib/stores/encaissementStore.svelte';
   

    // ─── Props ────────────────────────────────────────────────────
    let {
        facture,
        factures,
        recette,
        recettes,
        affaire,
        abonne,
        onclose,
        onrefresh,
    }: {
        facture   : Facture;
        factures  : Facture[];
        recette   : Recette;
        recettes  : Recette[];
        affaire   : Affaire;
        abonne    : Abonne;
        onclose   : () => void;
        onrefresh : () => Promise<void>;
    } = $props();
    
    let Ope0 = $state('');

    $effect(() => {
        if (vuDivSaisieEncais === 'saisieEncais') {
            if (Ope0 === 'U') {
                // Modification : focus sur le select Mode Encaissement
                (document.getElementById("modeEncaissId") as HTMLSelectElement)?.focus();
            }
            // Création : pas de focus automatique
        }
    });
    onDestroy(() => {
        if (bandeauTimer) clearTimeout(bandeauTimer);
    });

    // ─── Affichage conditionnel ───────────────────────────────────────────────
    let dialog          = $state<HTMLDialogElement>();
    let bandeauVisible  = $state(false);
    let bandeauSucces   = $state(false);
    let bandeauMessage  = $state('');
    let bandeauTimer: ReturnType<typeof setTimeout> | undefined;

    // ─── État local ───────────────────────────────────────────────
    let titre1                  = $state('');
    let titre2                  = $state('');
    let titreSaisieEncaissement = $state('');
    let marginBottom            = $state(0);
    let dateInputEncais         = $state('');
    let inputColor              = $state('black');
    let vuDivSaisieEncais       = $state('');
    let btnNonOk                = $state(false);
    let elemNonOk               = $state(false);
    let facColorSolde0          = $state('');
    let facTotalRecetteArray0   = $state<string[]>([]);
    let facColorExcedent0       = $state('');
    let isExcedent = $state(false);
    let modeEncaissements       = $state(["Virement", "Carte Bancaire", "Chèque", "Espèce", "Prélèvement"]);

    // ─── ModalConfirm ───────────────────────────────────────────────
    let vueDiffSaisieEncais           = $state(false);
    let messageDiffSaisieEncais       = $state('');
    let vueConfirmAbandonSaisieEncais = $state(false);

    let recetteLocale = $state({ ...recette });

    // ─── ToolTip Ligne d'Encaissement ────────────────────────────
    let hoveredRecette    = $state<Recette | null>(null);
    let hoveredRecetteIndex = $state(-1);
    let tooltipStyleR    = $state('');
    let hideTimerR: ReturnType<typeof setTimeout> | undefined;
    function onRecetteRowEnter(e: MouseEvent, recette: Recette, r: number) {
        clearTimeout(hideTimerR);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleR    = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
        hoveredRecette    = recette; // ← mise à jour immédiate
        hoveredRecetteIndex = r;
    }
    function onRecetteRowMove(e: MouseEvent) {
        if (!hoveredRecette) return;
        clearTimeout(hideTimerR);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleR = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
    }
    function onRecetteRowLeave() {
        hideTimerR = setTimeout(() => { hoveredRecette = null; hoveredRecetteIndex = -1; }, 300);
    }
    function onRecetteTooltipLeave() {
        hideTimerR = setTimeout(() => { hoveredRecette = null; hoveredRecetteIndex = -1; }, 300);
    }
    function onRecetteTooltipEnter() {
        clearTimeout(hideTimerR);
    }

    onMount(() => {
        dialog?.showModal();
        marginBottom = 30;
        titre2 = "Affaire : " + affaire.libAffaire + "  -  Client : " + (parseClientFacture(facture.client)?.libClient0 ?? '');
        // Encaissement du Règlement de l'Acompte mentionné dans un Devis ─────────────────────────────
        if (facture.codeType == 10) {
            titre1 = "Devis N° " + facture.refFac + " : Encaissement de l`Acompte";
            rt.acompteMont0  = facture.acompMont ?? '0,00';
            rt.facMontantDu0 = facture.acompMont ?? '0,00';
            // Devis : les Recettes sont liées à la Facture d'Acompte issue de ce Devis
            const facAcompte = factures.find(f => f.refDevis === facture.refFac && f.codeType === 20);
            rt.selRecettes = facAcompte
                ? recettes.filter((r: Recette) => r.factureId === facAcompte.id)
                : [];
        }
        // Encaissement du Règlement d'une Facture ─────────────────────────────
        if (facture.codeType == 30) {
            titre1 = "Encaissement des Règlements de la Facture";
            // Sélection des Recettes de la Facture
            rt.selRecettes = recettes.filter((r: Recette) => r.factureId === facture.id);
            // Couleur du Solde
            const statut = facture.statut ?? '';
            const borne1 = statut.indexOf("color");
            const borne2 = statut.indexOf(">");
            const couleur = statut.slice(borne1, borne2 + 1);
            facColorSolde0   = "<mark style='background:white;" + couleur + (facture.solde ?? '0,00');
            rt.facMontantDu0 = facture.soldeStr;
            rt.facMontFacturer0 = (Number(facture.soldeStr.replace(',', '.')) - Number(facture.soldePenaliteStr.replace(',', '.'))).toString();
            facTotalRecetteArray0 = (facture.total ?? '').split('|');
            if (facture.regimeTva === 'B') { // Imposition à la TVA ─────────────────────────────
                facTotalRecetteArray0.sort((a, b) => b.slice(0, 4).localeCompare(a.slice(0, 4)));
                rt.facTotalRecetteArray2 = [];
                for (let i = 0; i < facTotalRecetteArray0.length; i++) {
                    const lig = facTotalRecetteArray0[i].split('¤');
                    if (lig[0].slice(0, 4) === '00,0') {
                        rt.facTotalRecetteArray2.push(
                            rt.selRecettes.length === 0
                            ? { tva:lig[0].slice(0,4), montHtDu:lig[2], montTtcDu:lig[2], soldeTtc:lig[2], imput:'0,00' }
                            : { tva:lig[0].slice(0,4), montHtDu:lig[2], montEncais:'0,00', soldeHt:lig[2], soldeTtc:lig[2], imput:'0,00' }
                        );
                    } else {
                        rt.facTotalRecetteArray2.push(
                            rt.selRecettes.length === 0
                            ? { tva:lig[0].slice(0,4), montHtDu:lig[2], montTtcDu:lig[6], soldeTtc:lig[6], imput:'0,00' }
                            : { tva:lig[0].slice(0,4), montHtDu:lig[4], montEncais:'0,00', soldeHt:lig[4], soldeTtc:'0,00', imput:'0,00' }
                        );
                    }
                }
            } else {// Franchise TVA : calcul du montant Débours ───────
                rt.facMontDebours0 = '0,00';
                for (let i = 0; i < facTotalRecetteArray0.length; i++) {
                    const lig = facTotalRecetteArray0[i].split('¤');
                    if (lig[0].slice(4, 6) === '20') {
                        rt.facMontDebours0 = lig[2].replace(',', '.');
                    }
                }
            }
        }
    });

    function afficherBandeau(message: string, succes: boolean, dureeMs: number = 5000) {
        bandeauMessage = message;
        bandeauSucces  = succes;
        bandeauVisible = true;
        if (bandeauTimer) clearTimeout(bandeauTimer);
        bandeauTimer = setTimeout(() => {
            bandeauVisible = false;
        }, dureeMs);
    }

    // ─── Modal d'Information ─────────────────────────────────────────
    function modalInfo(origine:number): void {
        if (origine == 1) {
            drawerInfoUtils.ouvrir({
                titre:   "Encaissement Excédentaire : Conséquences Fisacles et Sociales",
                message: excedent,
                largeur: '900px',
             });
        } else {
            drawerInfoUtils.ouvrir({
                 titre:   "Informations sur la Fiscalité des Pénalités de retard",
                message: fiscPena,
                largeur: '500px',
            });
        }
    }

    // ─── Initialisation des données de la Création d'une Recette avant Ouverture du Formulaire de Saisie ( Div d`Encaissement ] ──────────────────
    function initRecette() {
        marginBottom = 110;
        Ope0 = '';
        titreSaisieEncaissement = "Création d`un Encaissement";
        recetteLocale.dateEmis  = facture.dateEmis;
        dateInputEncais         = '';
        recetteLocale.refFac    = facture.refFac;
        recetteLocale.cliNom    = parseClientFacture(facture.client)?.libClient0 ?? '';
        recetteLocale.libelle   = affaire.libAffaire;
        recetteLocale.regimeTva = facture.regimeTva;
        recetteLocale.modeRegl  = '';
        rt.saisiAImputer0       = '0,00';
        inputColor              = 'black';
        elemNonOk               = false;
        vuDivSaisieEncais       = 'saisieEncais';
    }

    // Modification du Mode d'Encaissement ────────────────────────────
    function editRecette(rec: Recette) {
        Ope0 = 'U';
        recetteLocale           = { ...rec };  // ← copie dans la variable réactive
        marginBottom            = 110;
        titreSaisieEncaissement = "Modification du mode d`Encaissement";
        modeEncaissements       = ["Virement", "Carte Bancaire", "Chèque", "Espèce", "Prélèvement"];
        elemNonOk               = true;
        inputColor              = '#D1D1D1';
        btnNonOk                = false;
        const d                 = new Date(rec.dateEmis);
        dateInputEncais         = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        rt.saisiAImputer0       = String(rec.montRegl ?? '0,00');
        vuDivSaisieEncais       = 'saisieEncais';
    }

    // Vérification des données de la Saisie d'un Encaissement ─────────────────
    async function verifSaisieEncais() {
        btnNonOk = true;
        // ── Mise à jour du Mode de Règlement ──────────────────────────
        if (Ope0 === 'U') {
            vuDivSaisieEncais = '';
            const fd = new FormData();
            fd.append('recetteId', String(recetteLocale.id));
            fd.append('modeRegl',  recetteLocale.modeRegl);
            try {
                const response = await fetch('/recette?/updateModeReglRecette', { method: 'POST', body: fd });
                const result   = deserialize(await response.text());
                if (result.type === 'success') {
                    afficherBandeau("Mode de règlement mis à jour avec succès.", true, 3000);
                    rt.selRecettes = rt.selRecettes.map(r => r.id === recetteLocale.id ? { ...r, modeRegl: recetteLocale.modeRegl } : r);
                    onrefresh();
                    setTimeout(() => { onclose(); }, 2000);
                } else {
                    afficherBandeau("Erreur lors de la mise à jour du mode de règlement.", false);
                    setTimeout(() => { onclose(); }, 2000);
                }
            } catch {
                afficherBandeau("Erreur réseau lors de la mise à jour du mode de règlement.", false);
                setTimeout(() => { onclose(); }, 2000);
            }
        } else {
            // Saisie d'un encaissement ────────────────────────────────────────────────────
            const erreurs: string[] = [];
            if (!dateInputEncais) {
                erreurs.push("La date d'encaissement est obligatoire.");
            }
            if (!recetteLocale.modeRegl) {
                erreurs.push("Un mode de règlement doit être sélectionné.");
            }
            if (!rt.saisiAImputer0 || Number(rt.saisiAImputer0.replace(',', '.')) === 0) {
                erreurs.push("Un montant de règlement doit être saisi.");
            }
            if (erreurs.length > 0) {
                afficherBandeau(erreurs.join('<br>'), false);
                btnNonOk = false;
                return;   // ← pas de fermeture ici : erreurs de saisie, l'utilisateur doit corriger
            }
            bandeauVisible = false;
            if (Number((rt.saisiAImputer0 ?? '0').replace(',', '.')) === Number((rt.facMontantDu0 ?? '0').replace(',', '.'))) {

                // Devis : Encaissement du Règlement de l'Acompte ────────────
                if (facture.codeType == 10) {
                    vuDivSaisieEncais = '';
                    recetteLocale.dateRegl = new Date(
                        parseInt(dateInputEncais.slice(0, 4)),
                        parseInt(dateInputEncais.slice(5, 7)) - 1,
                        parseInt(dateInputEncais.slice(8, 10))
                    );
                    recetteLocale.montRegl = rt.saisiAImputer0;
                    const nouvelleFacture = createFactureVide();
                    afficherBandeau("⏳ Création en cours …", true, 60000);
                    document.body.style.cursor = 'wait';

                    const { ok, recetteId } = await createFacAcompteRec(
                        1, facture, nouvelleFacture, recetteLocale, rt, abonne, 'Acompte',
                        (s) => { afficherBandeau(s.message, s.succes); },
                        (v) => { btnNonOk = v; }
                    );
                    document.body.style.cursor = 'default';

                    if (!ok) {
                        setTimeout(() => { onclose(); }, 2000);
                        return;
                    }
                    if (recetteId) recetteLocale.id = recetteId;
                    //facture.statutCode = 20;
                    //facture.statut     = "<mark style='background:white;color:#0488fd'>Devis Acompte Réglé";
                    rt.selRecettes     = [...rt.selRecettes, { ...recetteLocale }];
                    afficherBandeau("Encaissement enregistré avec succès.", true, 2000);
                    await onrefresh();
                    setTimeout(() => { onclose(); }, 2000);
                }
                // Création de la Recette relative au Règlement de la Facture ────────────
                if (facture.codeType == 30) {
                    facture.statutCode = 21;
                    rt.facTotReglSav0 = numberToFrStr(facture.totRegl);
                    await typePreparation();
                    if (facture.refDevis) {
                        const devisLie = factures.find(f =>
                            f.refFac.slice(0, 1) === 'D' && f.statutCode !== 20 && f.refFac === facture.refDevis
                        );
                        if (devisLie) {
                            devisLie.statutCode = 20;
                            devisLie.statut     = "<mark style='background:white;color:#0488fd'>Devis Signé";
                            const fdDevisLie    = new FormData();
                            fdDevisLie.append('factureId',  String(devisLie.id));
                            fdDevisLie.append('statutCode', String(devisLie.statutCode));
                            fdDevisLie.append('statut',     devisLie.statut);
                            try {
                                const responseDevisLie = await fetch('?/updateStatutFacture', { method: 'POST', body: fdDevisLie });
                                const resultDevisLie   = deserialize(await responseDevisLie.text());
                                if (resultDevisLie.type !== 'success') {
                                    afficherBandeau("Erreur lors de la mise à jour du statut du Devis lié.", false);
                                }
                            } catch {
                                afficherBandeau("Erreur réseau lors de la mise à jour du statut du Devis lié.", false);
                            }
                        }
                    }
                    setTimeout(() => { onclose(); }, 2000);
                }
            } else {
                // Si DIFFERENCE entre le montant Dû et le montant encaissé ────────────────────────
                afficheDiffSaisieEncais();
                // ← pas de fermeture : ouvre un autre flux de saisie (répartition/écart), l'utilisateur doit continuer
            }
        }
    }

    function afficheDiffSaisieEncais() {
        isExcedent = false;   // ← reset par défaut
        if (facture.codeType == 10) {
            messageDiffSaisieEncais = "Le montant saisi (" + rt.saisiAImputer0 + ") est différent du montant Du (" + rt.facMontantDu0 + ").</br>";
            messageDiffSaisieEncais += "Confirmez-vous cette différence ?";
        }
        if (facture.codeType == 30) {
            const dif  = Number(rt.saisiAImputer0.replace(/\s/g, '').replace(',', '.')) - Number(rt.facMontantDu0.replace(/\s/g, '').replace(',', '.'));
            const dif1 = dif.toFixed(2).replace('.', ',');
            if (dif > 0) {
                isExcedent = true;
                messageDiffSaisieEncais = "Le montant saisi (" + rt.saisiAImputer0 + ") excède le `montant Du` (" + rt.facMontantDu0 + ").</br>";
                messageDiffSaisieEncais += "Si cet excédent de " + dif1 + "€ est confirmé, il sera porté au Crédit du Compte du Client</br>";
                messageDiffSaisieEncais += "Il vous sera possible :</br>";
                messageDiffSaisieEncais += "- si vous le remboursez, de saisir ce remboursement via l’écran `Compte Client`,</br>";
                messageDiffSaisieEncais += "- sinon d'imputer ce Crédit sur le `Total Du` lors de la prochaine facturation de ce Client.</br>";
                messageDiffSaisieEncais += "Confirmez-vous cet excédent ?";
            }
            if (dif < 0) {
                messageDiffSaisieEncais = "Le montant saisi (" + rt.saisiAImputer0 + ") est inférieur au montant Du (" + rt.facMontantDu0 + ").</br>";
                messageDiffSaisieEncais += "Confirmez-vous cette différence ?";
            }
        }
        vueDiffSaisieEncais = true;
    }

    // Confirmation de la Différence entre le montant saisi et le Montant Dû----
    async function confirmDiffSaisieEncais() {
        vueDiffSaisieEncais = false;   // ← ligne dupliquée supprimée
        // DEVIS - FACTURE d'ACOMPTE : Constitution d'une occurrence de Recette -----
        if (facture.codeType == 10) {
            const calSaisi = Number((rt.saisiAImputer0 ?? '0').replace(',', '.'));
            const calDu    = Number((rt.facMontantDu0  ?? '0').replace(',', '.'));
            const coef     = calSaisi / calDu;
            rt.acompteMont0 = rt.saisiAImputer0;
            const nouvelleFacture = createFactureVide();
            vuDivSaisieEncais = '';   // ← ajout : ferme la div de saisie
            afficherBandeau("⏳ Création en cours …", true, 60000);
            document.body.style.cursor = 'wait';
            const { ok, recetteId } = await createFacAcompteRec(
                coef, facture, nouvelleFacture, recetteLocale, rt, abonne, 'Acompte',
                (s) => { afficherBandeau(s.message, s.succes); },
                (v) => { btnNonOk = v; }
            );
            document.body.style.cursor = 'default';
            if (!ok) {
                setTimeout(() => { onclose(); }, 2000);
                return;
            }
            if (recetteId) recetteLocale.id = recetteId;
            //facture.statutCode = 20;
            //facture.statut     = "<mark style='background:white;color:#0488fd'>Devis Acompte Réglé";
            rt.selRecettes      = [...rt.selRecettes, { ...recetteLocale }];
            afficherBandeau("Encaissement enregistré avec succès.", true, 2000);
            onrefresh();
            setTimeout(() => { onclose(); }, 2000);
        }

        // FACTURE : Constitution d'une occurrence de Recette -----
        if (facture.codeType == 30) {
            if (Number(rt.saisiAImputer0.replace(/[,]/, '.')) > Number(rt.facMontantDu0.replace(/[,]/, '.'))) {
                facture.statutCode = 22;
            } else {
                facture.statutCode = 27;
            }
            await typePreparation();
            setTimeout(() => { onclose(); }, 2000);   // ← ajout
        }
    }   

    // Détermination du Type de Préparation pour la Création de l'Occurrence de Recette de la Facture (Facture d'Acompte non concernée)
    async function typePreparation() {
        if (rt.selRecettes.length == 0) { // Saisie d'un Encaissement Initial ────
            if (facture.regimeTva == 'B') {
                prepaRecetteInitTva(facture, recetteLocale, rt);
            } else {
                prepaRecetteInitFranchise(facture, recetteLocale, rt);
            }
            // ── Appel serveur createRecette ───────────────────────────────────
            const fd = new FormData();
            fd.append('dateEmis',      recetteLocale.dateEmis.toISOString());
            fd.append('dateRegl',      recetteLocale.dateRegl?.toISOString() ?? new Date().toISOString());
            fd.append('refFac',        recetteLocale.refFac);
            fd.append('cliNom',        recetteLocale.cliNom);
            fd.append('libelle',       recetteLocale.libelle);
            fd.append('regimeTva',     recetteLocale.regimeTva               ?? '');
            fd.append('modeRegl',      recetteLocale.modeRegl);
            fd.append('montRegl',      recetteLocale.montRegl                ?? '0,00');
            fd.append('montHt',        recetteLocale.montHt                  ?? '0,00');
            fd.append('ventilTva',     recetteLocale.ventilTva               ?? '');
            fd.append('montTva',       recetteLocale.montTva                 ?? '0,00');
            fd.append('montTtc',       recetteLocale.montTtc                 ?? '0,00');
            fd.append('debours',       recetteLocale.debours                 ?? '0,00');
            fd.append('penalite',      recetteLocale.penalite                ?? '0,00');
            fd.append('nature',        recetteLocale.nature                  ?? '');
            fd.append('factureId',     String(facture.id));
            fd.append('clientId',      String(facture.clientId));
            fd.append('affaireId',     String(affaire.id));
            fd.append('totRegl',       String(facture.totRegl                ?? 0));
            fd.append('montCli',       String(facture.montCli                ?? 0));
            fd.append('solde',         String(facture.solde                  ?? 0));
            fd.append('soldePenalite', String(facture.soldePenalite          ?? 0));
            try {
                const response = await fetch('/recette?/createRecette', { method: 'POST', body: fd });
                const result    = deserialize(await response.text());
                if (result.type === 'success') {
                    const recetteId = (result.data as { recetteId?: number })?.recetteId;
                    if (recetteId) recetteLocale.id = recetteId;
                    rt.selRecettes = [...rt.selRecettes, { ...recetteLocale }];
                    afficherBandeau("Encaissement enregistré avec succès.", true, 3000);
                    onrefresh();
                } else {
                    afficherBandeau("Erreur lors de la création de l'encaissement.", false);
                    btnNonOk = false;
                }
            } catch {
                afficherBandeau("Erreur réseau lors de la création de l'encaissement.", false);
                btnNonOk = false;
            }
        } else { // Saisie d'un Encaissement Complémentaire ───────────────────────
            if (facture.regimeTva == 'B') {
                prepaRecetteComplTva(facture, recetteLocale, rt);
            } else {
                prepaRecetteComplFranchise(facture, recetteLocale, rt);
            }
        }
    }

    function confirmAbandonSaisieEncais() {
        // Création ou Modification : demande confirmation d'abandon
        vueConfirmAbandonSaisieEncais = true;
    }
</script>
<!-- ModalConfirm ────────────────────────  -->
{#if vueDiffSaisieEncais}
    <ModalConfirm bind:visible={vueDiffSaisieEncais} titre={isExcedent ? "Encaissement : Montant Saisi Supérieur au Montant Dû" : "Encaissement : Montant Saisi Différent du Montant Dû"}
        message={messageDiffSaisieEncais} labelConfirm="Confirmer" maxWidth="700px" onconfirm={()=>confirmDiffSaisieEncais()} onannuler={()=>{vueDiffSaisieEncais=false}}>
        {#if isExcedent}
            <button type="button" onclick={()=>modalInfo(1)} title="Informations sur les encaissements excédentaires" style="background:none;border:none;padding:0;cursor:pointer;line-height:0;vertical-align:middle;margin-left:6px;margin-top:-1px">
                <img src="/question.png" alt="Informations" width="18px" height="18px"/>
            </button>
        {/if}
    </ModalConfirm>
{/if}
{#if vueConfirmAbandonSaisieEncais}
    <ModalConfirm bind:visible={vueConfirmAbandonSaisieEncais} titre="Abandon de la saisie"
        message={Ope0 === 'U' ? "Confirmez-vous l'Abandon de la Modification ?" : "Confirmez-vous l'Abandon de la Saisie ?"}
        labelAnnuler="Non" labelConfirm="Confirmer" onconfirm={()=>{vueConfirmAbandonSaisieEncais=false;vuDivSaisieEncais=''}} onannuler={()=>vueConfirmAbandonSaisieEncais=false}/>
{/if}

<!-- Formulaire d'Encaissement : Devis ou Facture -->
<dialog bind:this={dialog} class="sg-divDialog sg-divDialog--large dialogStyle">
    {#if bandeauVisible}
        <div style="position:sticky;top:0;z-index:10;padding:8px 16px;font-size:13px;font-weight:600;text-align:center;border-radius:3px;margin-bottom:6px;background-color:{bandeauSucces?'#d4edda':'#f8d7da'};color:{bandeauSucces?'#155724':'#721c24'};border: 1px solid {bandeauSucces?'#c3e6cb':'#f5c6cb'}">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html bandeauMessage}
        </div>
    {/if}
    <!-- Titre -->
    <div class="divTitre">
        <div class="divTitre">
            <div style="display:flex;flex-direction:row;align-items:center;color:black;font-size:13px;font-weight:700;margin:0 3px">
                <hr style="flex:1;border:none;border-top:1px solid white;margin-right:5px"/>{titre1}<hr style="flex:1;border:none;border-top:1px solid white;margin-left:5px"/>
            </div>
        </div>
        <p style="font-size:13px;color:black;font-weight:500;font-style:italic;text-align:center;margin-top:5px">{titre2}</p>
    </div>
    <button class="sg-dialogFermer" title="Annuler ou Fermer" onclick={()=>{dialog?.close(); onclose()}}><img src="/close.png" alt=""/></button>
    <!-- Entete  -->
    <div class="divEntete">
        <div class="divTitre">
            <div style="display:flex;flex-direction:row;align-items:center;color:#60A2F2;font-size:13px;margin:0 3px;opacity:0.8">
                <hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-right:5px"/>Données Générales<hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-left:5px"/>
            </div>
        </div>
        <table class="tableEntete">
            <thead>
                <tr style="height:30px">
                    <th>Date Emission</th>
                    {#if facture.codeType == 10}
                        <th>Acompte Du</th>
                    {:else}
                        <th>€ Facturé</th>
                    {/if}
                    {#if Number(facture.montCliStr.replace(',', '.')) < 0}
                        <th>Excédent</th>
                    {/if}
                    <th>Solde</th>
                    {#if facture.codeType == 30 && Number(facture.soldeStr.replace(/[,]/, '.')) != 0 && Number(facture.soldePenaliteStr.replace(/[,]/, '.')) != 0}
                        <th>dont Pénalité</th>
                    {/if}
                    <th>Statut</th>
                </tr>
            </thead>
            <tbody>
                <tr style="height:30px">
                    <td style="font-size:14px !important">{formatDate(facture.dateEmis)}</td>
                    {#if facture.codeType == 10}
                        <td style="font-size:14px !important">{facture.acompMont}</td>
                    {:else}
                        <td style="font-size:14px !important">{facture.totTtc}</td>
                    {/if}
                    {#if Number(facture.montCliStr.replace(/[,]/, '.')) < 0}
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        <td style="font-size:14px !important">{@html facColorExcedent0}</td>
                    {/if}
                    {#if facture.codeType == 10}
                        <td style="font-size:14px !important">{facture.acompMont}</td>
                    {:else}
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        <td style="font-size:14px !important">{@html facColorSolde0}</td>
                    {/if}
                    {#if Number(facture.soldeStr.replace(/[,]/, '.')) != 0 && Number(facture.soldePenaliteStr.replace(/[,]/, '.')) != 0}
                        <td style="font-size:14px !important">
                            <div style="display:flex;flex-direction:row;justify-content:center">{facture.soldePenalite}
                                <button type="button" onclick={()=>modalInfo(2)} title="Informations sur la Fiscalité des Pénalités de retard" style="background:none;border:none;padding:0;cursor:pointer;line-height:0">
                                    <img src="/question.png" alt="Informations" width="20px" height="20px"/>
                                </button>
                            </div>
                        </td>
                    {/if}
                    <td style="font-size:14px !important">
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        {@html facture.statut}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <!--  Formulaire d`Encaissement ¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤¤  -->
    <div style="margin-bottom:{marginBottom}px;display:flex;justify-content:center">
        {#if vuDivSaisieEncais == 'saisieEncais'}<!--  Div de Saisie (ou d'Edition) des Données d'un Encaissement -->
            <div class="divSaisieEncais">
                <fieldset class="sg-fieldset" style="width:100%">
                    <legend class="sg-legende">{titreSaisieEncaissement}</legend>
                    <button class="fermer" title="Fermer la Fenêtre de Saisie" onclick={()=>confirmAbandonSaisieEncais()}><img src="/close.png" alt=""/></button>
                    <div class="sg-row" style="gap:20px;align-items:flex-end;justify-content:space-between;width:100%">
                        <div style="margin-top:-5px">
                            <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Date Encaissement</legend>
                            <input type="date" bind:value={dateInputEncais} disabled={elemNonOk} style="height:30px;padding-top:2px;font-size:13px" onchange={()=>btnNonOk=false}>
                        </div>
                        <div style="margin-top:-5px">
                            <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Mode Encaissement</legend>
                            <select id="modeEncaissId" class="sg-select" bind:value={recetteLocale.modeRegl} style="width:170px;height:30px" onchange={()=>btnNonOk=false}>
                                <option value="" selected hidden>Sélectionner ...</option>
                                {#each modeEncaissements as encaissement (encaissement)}
                                    <option value={encaissement}>{encaissement}</option>
                                {/each}
                            </select>
                        </div>
                        <div style="margin-top:-5px">
                            <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Montant</legend>
                            <input type="text" id="encaisMontantId" bind:value={rt.saisiAImputer0} readonly={elemNonOk} style="text-align:center;width:120px;height:30px;{inputColor}" onkeyup={(e)=>{numericDecimal(e); btnNonOk=false;}} required>
                        </div>
                        <div style="margin-top:-12px">
                            <button class="sg-button" onclick={()=>verifSaisieEncais()} disabled={btnNonOk} style="margin-top:20px;margin-left:5px;width:80px;height:30px">Valider</button>
                        </div>
                    </div>
                </fieldset>
            </div>
        {:else} <!--  Liste des Encaissements  -->
            <div class="divRecette" style="width:100%">
                <div style="position:relative;display:flex;flex-direction:row;align-items:center;color:#60A2F2;font-size:14px;font-weight:600;margin:0 3px;opacity:0.8">
                    <hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-right:5px"/>Liste des Encaissements<hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-left:5px"/>
                    {#if (facture.codeType == 10 && facture.acompMont != '0,00') || (facture.codeType == 30 && (facture.soldeStr != '0,00' || facture.montCliStr != '0,00')) || (facture.codeType == 40 && facture.montCliStr != '0,00')}
                        <button class="btn-donnees-gen" onclick={()=>initRecette()}>+ Saisir un Nouvel Encaissement</button>
                    {/if}
                </div>
                <table id="tableRecette" class="tableRecette" style="margin-top:5px">
                    <thead>
                        <tr style="height:30px">
                            <th style="width:30%">Date</th>
                            <th style="width:40%">Mode</th>
                            <th style="width:30%">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if rt.selRecettes.length != 0}
                            {#each rt.selRecettes as recette, r (recette.id)}
                                <tr class="sg-trSha {hoveredRecette?.id === recette.id ? 'sg-trSha--hovered' : ''}" style="height:30px;cursor:pointer" onmouseenter={(e)=>{clearTimeout(hideTimerR);onRecetteRowEnter(e, recette, r)}} onmousemove={onRecetteRowMove} onmouseleave={onRecetteRowLeave}>
                                    <td>{formatDate(recette.dateRegl)}</td>
                                    <td>{recette.modeRegl}</td>
                                    <td>{formatMontant(recette.montRegl)}</td>
                                </tr>
                            {/each}
                        {/if}
                    </tbody>
                </table>
                {#if hoveredRecette}
                    {@const hovered = hoveredRecette}
                    <div role="toolbar" tabindex="-1" style="position:fixed;{tooltipStyleR};z-index:100;display:flex;gap:10px;padding:4px 12px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);pointer-events:auto"
                            onmouseenter={onRecetteTooltipEnter} onmouseleave={onRecetteTooltipLeave}>
                        <button class="sg-btn ttBtn" data-tooltip="Editer l`Encaissement" onclick={()=>editRecette(hovered)}><img src="/pencil.png" alt=""/></button>
                        {#if hovered.nature == "Remboursement Excédent" && hoveredRecetteIndex == rt.selRecettes.length - 1}
                            <button class="sg-btn ttBtn" data-tooltip="Annuler le Remboursement" onclick={()=>vueDiffSaisieEncais=true}><img src="/trash.png" alt=""/></button>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</dialog>

<style>
    .dialogStyle {
        width: 860px;
        height: 93%;
        padding: 10px;
        border-radius: 0%;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
        border: 1px solid rgba(0,0,0,0.25);
    }
    .divTitre {
        height: auto;
        margin-top: 15px;
    }
    /* divTitre --------- */
    .divTitre {
        width: 100%;
    }
    /* divEntete  --------- */
    .divEntete {
        margin-top: 30px;
        min-height: 100px;
        padding-right: 10px;
    }
    .tableEntete {
        width: 100%;
        height: auto;
        padding: 0px;
    }
    .tableEntete th, td {
        width: auto;
        height: 20px;
        border: 0.5px solid #E8E8E8;
        border-collapse: collapse;
        text-align: center; 
        vertical-align: middle;
    }
    .tableEntete th {
        color: grey;
        background-color: #EDEDF1;
        font-size: 13px;
    }
    .tableEntete td {
        opacity: 1;
        font-size: 16px;
    }
    .btn-donnees-gen {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        height: 25px;
        max-height: 25px;
        line-height: 1;
        font-weight: 600;
        font-size: 13px;
        white-space: nowrap;
        background: white;
        color: #60A2F2;
        border: 1px solid #60A2F2;
        border-radius: 12px;
        padding: 0 12px;
        margin-top: -1px;
        margin-right: 20px;
        cursor: pointer;
        text-decoration: none;
        box-shadow: 2px 2px 4px rgba(0,0,0,0.25);
        transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
    }
    .btn-donnees-gen:hover {
        background: #60A2F2;
        color: white;
        text-decoration: none;
        box-shadow: 3px 3px 6px rgba(0,0,0,0.3);
    }
    /* Div de Saisie d'une Ligne d'Encaissement' --------- */
    .divSaisieEncais { /* , .divSaisieCour  !!!!!!!!!!!!!!!!!!!!!!!!  */
        display: flex; 
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 70%;
        height: auto;
        position: absolute;
        /*top: 200px;*/
        margin-left: 5px;
        margin-right: 5px;
        padding: 4px;
        background-color:white;
        z-index:8;
        box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);
    }
    /* Boutons du Tooltip d'actions ---------- */
    .ttBtn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        padding: 0;
        margin: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
        transition: background 0.15s;
    }
    .ttBtn:hover {
        background: #e2e8f0;
    }
    .ttBtn img {
        display: block;
        width: 12px;
        height: 12px;
    }

    .fermer {
        position: absolute;
        background-color: white;
        padding: 0px;
        border: none;
        top: -10px;
        right: -10px;
        cursor: pointer;
    }
    /* divRecette --------- */
    .divRecette {
        height: auto;
        margin-top: 5px;
        min-height: 150px;
        padding-right: 10px;
    }
    .tableRecette {
        width: 100%;
        height: auto;
        padding: 0px;
    }
    .tableRecette th, td {
        height: 20px;
        border: 0.5px solid #E8E8E8;
        border-collapse: collapse;
        text-align: center; 
        vertical-align: middle; 
    }
    .tableRecette th {
        color: grey;
        background-color: #EDEDF1; 
        font-size: 14px;
    }
    .tableRecette td {
        opacity: 1;
        font-size: 15px;
    }

    /* divCourrier --------- */
    /*
    .divCourrier {
        height: auto;
        margin-top: 5px;
        min-height: 70px;
        padding-right: 10px;
    }
    .imgClass {
        margin-left: 10px;
        cursor: pointer;
    }
    .tableCourrier {
        width: 100%;
        height: auto;
        padding: 0px;
    }
    .tableCourrier th, td {
        height: 20px;
        border: 0.5px solid #E8E8E8;
        border-collapse: collapse;
        text-align: center; 
        vertical-align: middle; 
    }
    .tableCourrier th {
        color: grey;
        background-color: #EDEDF1; 
        font-size: 14px;
    }
    .tableCourrier td {
        opacity: 1;
        font-size: 15px;
    }
    */
    /* Dialogue Modal Choix PDF ------------------- */
    /*
    .dialogDiv {
        display: inline-block;
        text-align: center;
        border: 1px solid #d3d3d3;
        border-radius: 3px;
        position: absolute;
        left: 50%;
        padding: 10px;
        background-color: white;
        transform: translate(-50%, -50%);
        z-index: 9;
        box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);
    }
    .dialogDivHeader {
        height: 30px;
        padding-top: 5px;
        padding-left: 5px;
        padding-right: 5px;
        z-index: 9;
        background-color: #9BBADB;
        color: #fff;
        font-weight: bold;
    }
    .divCorps {
        margin-top: 20px;
        padding-left: 5px;
        padding-right: 5px;
    }
    .close {
        color: white;
        margin-top: -59px;
        float: right;
        margin-right: 0px;
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
    }
    .close:hover {
        color: #000;
    }
    */
    /* Modal Button -------------------- */
    /*
    .encaiBtn {
        vertical-align: text-top;
        margin-left: auto;
        margin-right:auto;
        cursor: pointer;
        border: 1px solid #bbb;
        border-radius: 3px;
        font: bold 13px arial, helvetica, sans-serif;
        color: #555;
        background-color: #ddd;
        background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(255,255,255,1)), to(rgba(255,255,255,0)));
        box-shadow: 0 1px 0 rgba(0, 0, 0, .3), 0 2px 2px -1px rgba(0, 0, 0, .5), 0 1px 0 rgba(255, 255, 255, .3) inset;
        text-shadow: 0 1px 0 rgba(255,255,255, .9);
    }
    .encaiBtn:hover {
        background-color: #eee;
        color: #555;
    }
    .encaiBtn:active {
        background: #e9e9e9;
        box-shadow: 0 1px 1px rgba(0, 0, 0, .3) inset;
    */
</style>