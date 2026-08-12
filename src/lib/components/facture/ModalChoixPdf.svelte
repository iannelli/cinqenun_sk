<script lang="ts">
    import type { Facture }                                     from '$lib/schemas/facture';
    import type { Abonne }                                      from '$lib/schemas/abonne';
    import type { FactureTotauxState }                          from '$lib/schemas/facture';
    import { traitLibTotaux, traitColSpan, traitLibBasPage }    from '$lib/utils/fonctionsTotaux';
    import { generateDocumentPdf, type PdfContext }             from '$lib/utils/generateDocumentPdf';
    import ModalAlerte                                          from '$lib/components/ModalAlerte.svelte';

    let {
        facture,
        abonne,
        totState,
        libAffaire,
        onclose,
    }: {
        facture:    Facture | null;
        abonne:     Abonne;
        totState:   FactureTotauxState;
        libAffaire: string;
        onclose:    () => void;
    } = $props();

    const logoBase64 = $derived.by((): string | null => {
        const abo = abonne as Record<string, unknown>;
        if (Number(abo.temoinLogo ?? 0) !== 1) return null;
        const data     = abo.logoData as Uint8Array | null;
        const mimeType = String(abo.logoMimeType ?? 'image/png');
        if (!data) return null;
        // ← Conversion sûre pour les grands buffers
        const uint8 = new Uint8Array(data);
        let binary  = '';
        const chunk = 1024;
        for (let i = 0; i < uint8.length; i += chunk) {
            binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);
        return `data:${mimeType};base64,${base64}`;
    });

    // ── Dialog ────────────────────────────────────────────────────
    let dialog = $state<HTMLDialogElement | null>(null);
    $effect(() => {
        if (dialog && !dialog.open) {
            dialog.showModal();
        }
    });

    // ── Alerte ────────────────────────────────────────────────────
    let alerteVisible = $state(false);
    let alerteMessage = $state('');

    // ── Éligibilité FacturX ───────────────────────────────────────
    const selFacturX = $derived(
        facture !== null && (
            facture.codeType === 20 ||
            (facture.codeType === 30 && (facture.refFac ?? '').slice(0, 2) !== 'FB') ||
            facture.codeType === 40
        )
    );

    // ── Nom du fichier PDF ────────────────────────────────────────
    const nomPdfGauche = $derived(facture ? (facture.codeType === 10 ? 'devis_' : 'facture_') : '');
    const nomPdfDroite = $derived(facture ? (facture.refFac ?? '').replace(/\//g, '-') : '');

    // ── Validation ────────────────────────────────────────────────
    function validerSIREN(siren: string): { valide: boolean; message: string } {
        const s = siren.replace(/\s/g, '');
        if (!s || s.length !== 9) return { valide: false, message: 'N° SIREN invalide (9 chiffres requis)' };
        return { valide: true, message: '' };
    }
    function verifTvaIntra(tva: string): { valide: boolean; message: string } {
        if (!tva || tva.length < 4) return { valide: false, message: 'N° TVA intracommunautaire invalide' };
        return { valide: true, message: '' };
    }

    // ── Sélection d'une option ────────────────────────────────────
    async function selectOption(action: string) {
        if (!facture) return;
       // ── Validation FacturX (AVANT onclose, sinon l'alerte ne peut pas s'afficher)
        if (action === 'facturX') {
            let msg = '';
            const r1 = validerSIREN(abonne.siren0 ?? '');
            if (!r1.valide) msg += r1.message + '<br>' + "Saisir le N° Siren dans le menu 'Mon Compte / Identification'<br>";
            const r2 = verifTvaIntra(String(abonne.tvaIntra ?? ''));
            if (!r2.valide) msg += r2.message + '<br>' + "Saisir le N° Tva Intracommunautaire dans le menu 'Mon Compte / Fiscalité'<br>";
            if (msg) {
                alerteMessage = "La confection d'une Facture au format « Factur-X » nécessite la présence "
                            + "de vos numéros Siren et de Tva intra-communautaire.<br><br>" + msg;
                alerteVisible = true;
                return;
            }
        }
        // ── Snapshots et totaux ───────────────────────────────────
        const factureSnapshot  = $state.snapshot(facture) as Facture;
        const totStateSnapshot = $state.snapshot(totState) as FactureTotauxState;
        const logoSnapshot     = logoBase64;
        const nomGaucheSnap    = nomPdfGauche;   // ← capturer AVANT onclose
        const nomDroiteSnap    = nomPdfDroite;   // ← capturer AVANT onclose
        if (!totStateSnapshot.arrTot10?.length) {
            traitLibTotaux(factureSnapshot, totStateSnapshot);
            traitColSpan(factureSnapshot, totStateSnapshot);
            traitLibBasPage(factureSnapshot, totStateSnapshot);
        }
        onclose();  // remet pdfFacture = null dans +page.svelte
        // ── Génération PDF ────────────────────────────────────────
        const ctx: PdfContext = {
            facture:      factureSnapshot,
            abonne,
            totState:     totStateSnapshot,
            libAffaire,
            nomPdfGauche: nomGaucheSnap,
            nomPdfDroite: nomDroiteSnap,
            logoBase64:   logoSnapshot,
        };
        try {
            await generateDocumentPdf(action, ctx);
        } catch (err) {
            console.error('Erreur generateDocumentPdf:', err instanceof Error ? err.message : String(err));
        }
    }
</script>

<ModalAlerte bind:visible={alerteVisible} titre="Informations manquantes" message={alerteMessage} onclose={()=>alerteVisible=false}/>

<dialog bind:this={dialog} class="sg-divDialog" style="width:fit-content;max-width:95vw;z-index:200;margin:auto" aria-modal="true">
    <fieldset class="sg-fieldset">
        <legend class="sg-legende" style="font-size:14px;font-weight:700;margin:0 auto">
            Affichage du PDF : Choisissez une option
        </legend>
        <button class="sg-dialogFermer" title="Annuler ou Fermer" onclick={onclose}><img src="/close.png" alt=""/></button>
        <div style="display:flex;flex-direction:row;gap:10px;padding:20px 10px;justify-content:center">
            <button class="sg-button" onclick={() => selectOption('open')}>L'Ouvrir uniquement</button>
            <button class="sg-button" onclick={() => selectOption('download')}>L'Ouvrir et le Télécharger</button>
            <button class="sg-button" onclick={() => selectOption('print')}>L'Imprimer uniquement</button>
            {#if selFacturX}
                <button class="sg-button" onclick={() => selectOption('facturX')}>Générer au format FacturX</button>
            {/if}
        </div>
    </fieldset>
</dialog>