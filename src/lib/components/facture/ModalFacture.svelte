<script lang="ts">
    import { onMount } from 'svelte';
    import { deserialize } from '$app/forms';
    import { parseStatut } from '$lib/schemas/abonne';
    import ModalAlerte from '$lib/components/ModalAlerte.svelte';
    import ModalConfirm from '$lib/components/ModalConfirm.svelte';
    import type { Abonne } from '$lib/schemas/abonne';
    import type { Affaire } from '$lib/schemas/affaire';
    import type { Facture } from '$lib/schemas/facture';
    import { dateEcheanceSchema, createFactureTotauxState, parseLigne, parseClientFacture, serializeClientFacture, type LigneCell, type FactureTotauxState } from '$lib/schemas/facture';
    import FactureEntete  from './FactureEntete.svelte';
    import FactureLignes  from './FactureLignes.svelte';
    import FactureTotaux  from './FactureTotaux.svelte';
    import ModalChoixPdf from '$lib/components/facture/ModalChoixPdf.svelte';

    let dateEcheanceDate0 = $state('');   // mis à jour par FactureEntete
    let vueConfirmEnregistrement = $state(false);
    let vueConfirmValidation = $state(false);
    let {
        affaireId,
        clientId,
        abonne,
        affaire,
        mode      = 'create',
        action    = '',
        facture   = $bindable(null),
        factures  = [],
        clients   = [],
        client    = null,
        tarifs    = [],
        statutRaw = '',
        onclose,
        onrefresh,
        devisOptions = [],
        totState,
        onOpenPdf,
    }: {
        affaireId : number;
        clientId  : number;
        abonne    : Abonne;
        affaire   : Affaire;
        mode      : 'create' | 'update';
        action    : string;
        facture   : Facture | null;
        factures  : Facture[];
        clients   : { id: number; libClient: string }[];
        client    : { soldeCredit: number | null } | null;
        tarifs    : import('$lib/schemas/tarif').Tarif[];
        statutRaw : string;
        onclose   : () => void;
        onrefresh : () => void;
        devisOptions: string[];
        totState: FactureTotauxState;
        onOpenPdf?: () => void;
    } = $props();

    let messageEnregistrement = $state('');
    let totaux = $state(createFactureTotauxState());
    let factureTotauxRef = $state<ReturnType<typeof FactureTotaux> | null>(null);
    let enregistrement = $state(false);
    let factureEnregistree = $state(false);

     // ─── Bandeau résultat enregistrement ────────────────────────────
    let bandeauVisible = $state(false);
    let bandeauSucces  = $state(true);
    let bandeauMessage = $state('');
    function afficherBandeau(succes: boolean, message: string): void {
        bandeauSucces  = succes;
        bandeauMessage = message;
        bandeauVisible = true;
        setTimeout(()=>{bandeauVisible=false}, 4000);
    }

    // ─── Variables alerte statut fiscal (ferme la modale) ───────────
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');
    onMount(() => {
        const { statutFiscal0 } = parseStatut(statutRaw);
        if (statutFiscal0 === '') {
            alerteTitre   = 'Saisie obligatoire';
            alerteMessage = "Avant de Créer ou de Modifier un Devis ou une Facture,<br>il convient au préalable de saisir votre Statut Fiscal.<br>Rendez-vous sur la page accessible par le menu <strong>'Mon Compte / Fiscalité'</strong>.";
            alerteVisible = true;
            return;   // ← n'ouvre pas le dialog principal
        }
        dialog?.showModal();
    });
    // Variable utilisée si une Imputation d'un Excédent d'Encaissement a été saisi dans FactureTotaux.svelte ───────────
    let montantImputerSaisiValeur = $state<number | null>(null);

    // ─── Titre (dérivé réactif — évite la capture initiale) ───────
    const titre1 = $derived(
        mode === 'create'
        ? (action === 'Devis' ? "Création d'un Devis" : "Création d'une Facture")
        : (facture?.codeType === 10  ? "Edition d'un Devis"   : "Edition d'une Facture")
    );
    const titre2 = $derived(
        `Affaire : ${affaire.libAffaire}${affaire.libClient ? '\u00A0\u00A0\u00A0\u00A0──\u00A0\u00A0\u00A0\u00A0Client : ' + affaire.libClient : ''}`
    );

    // ─── Dialog ref ───────────────────────────────────────────────
    let dialog = $state<HTMLDialogElement | null>(null);

    // ─── Modal PDF ───────────────────────────────────────────────
    let showModalPdf = $state(false);
    let pdfFacture   = $state<Facture | null>(null);

    // Fonction de contrôle séparé qui déclenche la confirmation
    function demanderConfirmationEnregistrement(): void {
        const isDevis      = facture?.codeType === 10;
        const lignesParsed = facture?.ligne ? parseLigne(facture.ligne) : null;
        const aLigneValide = lignesParsed?.some(
            (ligne: LigneCell) => ligne.typeLig0?.slice(4, 6) !== '30'
        ) ?? false;
        if (!aLigneValide) {
            afficherBandeau(false, isDevis
                ? 'le Devis doit comporter au moins une ligne de facturation'
                : 'la Facture doit comporter au moins une ligne de facturation');
            return;
        }
        const echeance = facture?.dateEcheance ?? '';
        if (!echeance || echeance.trim() === '') {
            afficherBandeau(false, isDevis
                ? "le Devis doit comporter une Date d'Echéance"
                : "la Facture doit comporter une Date d'Echéance");
            return;
        }
        // ─── Contrôles OK → afficher la confirmation ─────────────────
        messageEnregistrement = isDevis
            ? "Confirmez-vous l'Enregistrement du Devis ?"
            : "Confirmez-vous l'Enregistrement de la Facture ?";
        vueConfirmEnregistrement = true;
    }

// ─── Contrôles avant validation → confirmation ─────────────────
function demanderConfirmationValidation(): void {
        if (!facture) return;
        // dateEcheance présente et valide en la forme
        const [date0 = '', couleurHtml0 = ''] = String(facture.dateEcheance ?? '').split('|');
        const check = dateEcheanceSchema.safeParse({ date0, couleurHtml0 });
        if (!check.success) {
            afficherBandeau(false, "La Facture doit comporter une Date d'Echéance valide");
            return;
        }
        vueConfirmValidation = true;
    }

    // ─── VALIDATION ───────────────────────────────────────────────────
    async function valider():Promise<void> {
        if (enregistrement || !facture) return;
        vueConfirmValidation = false;
        enregistrement = true;
        try {
            const fd = new FormData();
            fd.append('factureId', String(facture.id));
            const response = await fetch('?/validerFacture', { method:'POST', body:fd });
            const result   = deserialize(await response.text());
            if (result.type !== 'success') {
                const msg = (result.type === 'failure' && (result.data as { message?: string })?.message) || 'La validation de la Facture a échoué';
                throw new Error(String(msg));
            }
            const refFac   = (result.data as { refFac?: string })?.refFac ?? '';
            facture.refFac = refFac; // affiche le n° définitif dans la modale
            afficherBandeau(true, `Facture validée sous le n° ${refFac}`);
            factureEnregistree = true;
            onrefresh();
        } catch (erreur) {
            afficherBandeau(false, `Une erreur est survenue lors de la validation : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        } finally {
            enregistrement = false;
        }
    }

    // ─── ENREGISTRER ───────────────────────────────────────────────
    async function enregistrer():Promise<void> {
        if (enregistrement) return;
        vueConfirmEnregistrement = false;
        const isDevis = facture?.codeType === 10;
        enregistrement = true;
        try {
            // Enregistrement de la Facture en base -----
            const fd = new FormData();
            const clientRaw    = facture?.client ? parseClientFacture(facture.client) : null;
            const clientSerial = clientRaw ? serializeClientFacture(clientRaw) : '';
            fd.append('client',        clientSerial);
            fd.append('regimeTva',     facture?.regimeTva            ?? '');
            fd.append('typeDelai',     String(facture?.typeDelai     ?? 0));
            fd.append('delai',         String(facture?.delai         ?? 0));
            fd.append('dateEcheance',  facture?.dateEcheance         ?? '');
            fd.append('ligne',         facture?.ligne                ?? '');
            fd.append('total',         facture?.total                ?? '');
            fd.append('remTot',        String(facture?.remTot        ?? 0));
            fd.append('totTtc',        String(facture?.totTtc        ?? 0));
            fd.append('acompTaux',     String(facture?.acompTaux     ?? ''));
            fd.append('totPrestaHt',   String(facture?.totPrestaHt   ?? 0));
            fd.append('totVenteHt',    String(facture?.totVenteHt    ?? 0));
            fd.append('imputCreCli',   String(facture?.imputCreCli   ?? 0));
            fd.append('totRegl',       String(facture?.totRegl       ?? 0));
            fd.append('montCli',       String(facture?.montCli       ?? 0));
            fd.append('solde',         String(facture?.solde         ?? 0));
            fd.append('soldePenalite', String(facture?.soldePenalite ?? 0));
            fd.append('acompMont',     facture?.acompMont            ?? '');
            fd.append('acompteId',     String(totState.acompteId0    ?? 0));
            let response:Response;
            if (montantImputerSaisiValeur !== null && montantImputerSaisiValeur > 0) {
                fd.append('montantImputerSaisi', String(montantImputerSaisiValeur));
            }
            if (mode === 'create') {
                fd.append('codeType',   String(facture?.codeType     ?? 0));
                fd.append('refFac',     facture?.refFac              ?? '');
                fd.append('refDevis',   facture?.refDevis            ?? '');
                // Détermination de statutCode et statut effectué côté serveur
                fd.append('dateEmis',   facture?.dateEmis ? new Date(facture.dateEmis).toISOString() : new Date().toISOString());
                fd.append('clientId',   String(clientId));
                response = await fetch('?/createFacture', { method:'POST', body:fd });
            } else {
                fd.append('factureId', String(facture?.id ?? 0));
                response = await fetch('?/updateFacture', { method:'POST', body:fd });
            }
            if (!response.ok) {
                let msgErreur = `Erreur HTTP ${response.status}`;
                try {
                    const texte = await response.text();
                    const data  = JSON.parse(texte);
                    if (data?.message) msgErreur = data.message;
                } catch {
                    /* on garde le message par défaut */ 
                }
                throw new Error(msgErreur);
            }
            // Message de Succès -----
            const msgSucces = isDevis
                ? (mode === 'create' ? 'Création du Devis effectuée' : 'Modification du Devis effectuée')
                : (mode === 'create' ? 'Création de la Facture effectuée' : 'Modification de la Facture effectuée');
            afficherBandeau(true, msgSucces);
            factureEnregistree = true;
            montantImputerSaisiValeur = null;
            onrefresh();
        } catch (erreur) {
            afficherBandeau(false, `Une erreur est survenue lors de l'enregistrement : ${erreur instanceof Error ? erreur.message:String(erreur)}`);
        } finally {
            enregistrement = false;
            document.body.style.cursor = '';
        }
    }
</script>

<dialog bind:this={dialog} class="sg-divDialog sg-divDialog--large dialogStyle">
    {#if bandeauVisible}
        <div style="position:sticky;top:0;z-index:10;padding:8px 16px;font-size:13px;font-weight:600;text-align:center;border-radius:3px;margin-bottom:6px;
                    background-color:{bandeauSucces?'#d4edda':'#f8d7da'};color:{bandeauSucces?'#155724':'#721c24'};border: 1px solid {bandeauSucces?'#c3e6cb':'#f5c6cb'}">
            {bandeauMessage}
        </div>
    {/if}
    {#if enregistrement}
        <div  class="enAttente">⏳ Enregistrement en cours…</div>
    {/if}
    <div class="divTitre">
        <div style="display:flex;flex-direction:row;align-items:center;color:black;font-size:13px;font-weight:700;margin:0 3px">
            <hr style="flex:1;border:none;border-top:1px solid white;margin-right:5px"/>{titre1}<hr style="flex:1;border:none;border-top:1px solid white;margin-left:5px"/>
        </div>
    </div>
    <p style="font-size:13px;color:black;font-weight:500;font-style:italic;text-align:center;margin-top:5px">{titre2}</p>
    <button class="sg-dialogFermer" title="Annuler ou Fermer" onclick={() => {
        if (!factureEnregistree && factureTotauxRef?.hasUnsavedChanges?.()) {
            factureTotauxRef.confirmCloseTotaux(() => { onrefresh(); onclose(); });
        } else {
            if (factureEnregistree) {
                onrefresh();
            }
            onclose();
        }
    }}><img src="/close.png" alt=""/></button>
    <p style="margin-top:20px"></p>
    <FactureEntete bind:facture {affaire} {affaireId} {clients} {action} {onrefresh} bind:dateEcheanceDate0 {devisOptions} {factures} onAbandonner={()=>{onclose()}}/>
    <p style="margin-top:30px"></p>
    <FactureLignes bind:facture bind:totaux {tarifs} {dateEcheanceDate0} {onrefresh} />
    <p style="margin-top:30px"></p>
    <FactureTotaux bind:facture bind:totaux {totState} {client} {mode} {onrefresh} onImputationConfirmee={(montant)=>{montantImputerSaisiValeur=montant}}
/>
    <div class="divButton0">
        <div class="divButton1">
            <button type="button" onclick={() => onOpenPdf?.()} title="Afficher au format Pdf" class="btn2"><img src="/apercu.png" alt=""/> Générer le Pdf</button>
            {#if (facture?.codeType === 10 && facture?.statutCode !== 20) || facture?.refFac.slice(0,2) === 'FB'}
                <button onclick={demanderConfirmationEnregistrement} title="Enregistrer les Modifications" class="btn2"><img style="margin-left:2px;width:12%;height:auto" src="/save.png" alt=""/> Enregistrer</button>
            {/if}
            {#if facture?.refFac.slice(0,2) === 'FB' && mode === 'update'}
                <button type="button" onclick={demanderConfirmationValidation} title="Enregistrer la version définitive de la Facture" class="btn2"><img style="margin-left:2px;width:12%;height:auto" src="/check.png" alt=""/> Valider</button>
            {/if}
        </div>
    </div>
</dialog>

<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} redirect={true} onclose={onclose ?? (()=>{})} />
{#if vueConfirmEnregistrement}
    <ModalConfirm bind:visible={vueConfirmEnregistrement} titre="Enregistrement" message={messageEnregistrement} labelConfirm="Enregistrer"
                  onconfirm={()=>enregistrer()} onannuler={()=>{vueConfirmEnregistrement=false}} />
{/if}
{#if vueConfirmValidation}
    <ModalConfirm bind:visible={vueConfirmValidation} titre="Validation" message="Confirmez-vous la Validation de cette Facture ?<br>Cette action est irréversible." labelConfirm="Valider"
                  onconfirm={()=>valider()} onannuler={()=>{vueConfirmValidation=false}} />
{/if}
<!--Affichage Choix du type de PDF / Factur-X -->
{#if showModalPdf && pdfFacture}
    <ModalChoixPdf facture={pdfFacture} {abonne} {totState} libAffaire={affaire.libAffaire} onclose={()=>{showModalPdf=false;pdfFacture=null}} />
{/if}

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
    .divButton0 {
        width: 0;
        height: 100%;
    }
    .divButton1 {
        display: flex;
        flex-direction: column;
        gap: 5px;                 /* ← espacement de 10px entre les boutons */
        position: fixed;
        top: 70px;               /* ← Distance du bord supérieur de la Modal */
        /* Positionnement à droite de la modale : à ajuster selon la largeur de la modale (800px) et le centrage */
        left: calc(50% + 400px + 11px);  /* ← 50% + demi-largeur modale (400px) + 5px de décalage */
    }
    .btn2 {
        background-color: #9BBADB;
        border: none;
        width: 130px;
        color: white;
        text-align: left;
        padding: 5px 5px;
        font-size: 14px;
        cursor: pointer;
        box-shadow: rgba(50, 50, 93, 0.25) 0px 6px 12px -2px, rgba(0, 0, 0, 0.3) 0px 3px 7px -3px;
    }
    .btn2:hover {
        background-color: #1E90FF;      /*RoyalBlue;*/
    }
    .btn2 img {
        vertical-align: middle;
        width: 18px; 
        height: 18px;
    }
    .enAttente {
        position: sticky;
        top: 0;
        z-index: 11;
        padding: 6px 16px;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        background-color: #fff3cd;
        color: #856404;
        border: 1px solid #ffc107;
        border-radius: 3px;
        margin-bottom: 6px;
    }
</style>
