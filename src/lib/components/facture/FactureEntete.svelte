<script lang="ts">
    import type { Facture } from '$lib/schemas/facture';
    import type { Affaire } from '$lib/schemas/affaire';
    import ModalAlerte from '$lib/components/ModalAlerte.svelte';
    import ModalConfirm from '$lib/components/ModalConfirm.svelte';
    import { onlyNumeric, formatEntierInput } from '$lib/utils/numeric';
    import { colorStatut, type FactureStatutState } from '$lib/utils/colorStatut';
    import { libFacTypeDelai } from '$lib/utils/format';
    import { drawerInfoUtils } from '$lib/utils/drawerInfo';
    import { penaReglement }    from '$lib/utils/messageInfo';

    let {
        facture = $bindable(null),
        affaire,
        affaireId,   // eslint-disable-line @typescript-eslint/no-unused-vars
        clients,     // eslint-disable-line @typescript-eslint/no-unused-vars
        action = '',
        onrefresh,   // eslint-disable-line @typescript-eslint/no-unused-vars
        dateEcheanceDate0 = $bindable(''),
        devisOptions = [],
        factures = [],
        onAbandonner,
    }: {
        facture   : Facture | null;
        affaire   : Affaire;
        affaireId : number;
        clients   : { id: number; libClient: string }[];
        action    : string;
        onrefresh : () => void;
        dateEcheanceDate0?: string;
        devisOptions: string[];
        factures  : Facture[];
        onAbandonner: () => void;
    } = $props();

    // ─────────────────────────────────────────────────────────────────────────────
    // Variables Utilisées  --------------------------------------------------------
    // ─────────────────────────────────────────────────────────────────────────────
    let etatEntete0      = $state('table');
    let libDelai0        = $state('');
    let legendTypePena   = $state('Choisir le …');
    let legendTypeDelai  = $state('Sélectionner un ...');
    let typeDelaiLib = [
        { ind: 1, lib: "Délai (en jour)" },
        { ind: 2, lib: "45 jours fin de mois" },
        { ind: 3, lib: "45 jours date émission" },
        { ind: 4, lib: "60 jours date émission" },
    ];

    // Variable locale synchronisée avec facture.refDevis
    const refDevisStr = $derived(facture?.refDevis ?? '');
    // Variables d'état réactif pour les champs dérivés (nommés *Schema par cohérence avec le template)
    let dateEcheanceSchema  = $state({ date0: '', couleurHtml0: '#000000' });
    let penaliteSchema      = $state({ typePenalite0: '' as number | '', montPenalite0: 0.00, indemForfait0: 0.00 });
    let factureClientSchema = $state({ typeCli0: 0 });
    // Variables utilisée par la ModalAlerte -----------
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');
    // ─── Variables ModalConfirm (Facture Brouillon / Devis avec acompte non réglé) ──
    let confirmVisibleFb = $state(false);
    let confirmMessageFb = $state('');

    $effect(() => {
        if (!facture) return;
        // ─── Initialisation dateEcheanceSchema depuis facture.dateEcheance ──
        if (facture.dateEcheance) {
            const parts = facture.dateEcheance.split('|');
            dateEcheanceSchema.date0       = parts[0] ?? '';
            dateEcheanceSchema.couleurHtml0 = parts[1] ?? '#000000';
            dateEcheanceDate0 = parts[0] ?? '';
        }
        // ─── Initialisation libDelai0 depuis facture.typeDelai et facture.delai ────────
        libDelai0 = libFacTypeDelai(facture.typeDelai, facture.delai);
        // ─── Initialisation legendTypeDelai ─────────────────────────────────
        if (facture.typeDelai && facture.typeDelai > 0) {
            legendTypeDelai = typeDelaiLib.find(t => t.ind === facture!.typeDelai)?.lib
                ?? 'Sélectionner un ...';
        }
    });

    // ─── Modal d'Information ─────────────────────────────────────────
    function modalInfo(): void {
        drawerInfoUtils.ouvrir({
            titre:   "Retard de Règlement : Types de Pénalités applicables",
            message: penaReglement,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Fonctions Utilisées  --------------------------------------------------------
    // ───────────────────
    // ─── Date d'émission — format YYYY-MM-DD pour <input type="date"> ────
    function toInputDate(d: Date | string | undefined | null): string {
        if (!d) return new Date().toISOString().split('T')[0];
        if (d instanceof Date) return d.toISOString().split('T')[0];
        if (String(d).includes('T')) return String(d).split('T')[0];
        return String(d).slice(0, 10);
    }
    let dateEmisStr = $state(toInputDate(facture?.dateEmis));
    $effect(() => {
        if (facture && dateEmisStr) {
            facture.dateEmis = new Date(dateEmisStr);
        }
    });
    function updateDelai(e: Event) {
        if (!facture) return;
        facture.typeDelai = (e.target as HTMLSelectElement).selectedIndex;
        legendTypeDelai = "Type de délai sélectionné";
    }
    function showAlert(titre: string, message: string): void {
        alerteTitre   = titre;
        alerteMessage = message;
        alerteVisible = true;
    }

    // Validation avant la Création d'un Devis ou d'une "Facture Brouillon" ───────────────────────────
    function valider() {
        if (!facture) return;
        // Contrôles spécifiques à la création d'une Facture Brouillon ----
        const estFactureBrouillon = (facture.refFac ?? '').slice(0, 2) === 'FB';
        if (estFactureBrouillon && facture.refDevis) {
            const dev = factures.find(f => f.codeType === 10 && f.refFac === facture!.refDevis);
            if (dev && dev.acompTaux != null && String(dev.acompTaux) !== '') {
                // Devis avec Acompte nonRéglé ----
                if (dev.statutCode !== 20) {
                    confirmMessageFb =
                        `La 'Facture Brouillon' en cours de Création fait référence au devis <strong>${dev.refFac}</strong> dont l'Acompte n'a pas été encore Réglé.<br>` +
                        `En conséquence, cette Facture ne sera pas imputée de cet Acompte.<br>` +
                        `Confirmez-vous cette Création ?`;
                    confirmVisibleFb = true;
                    return; // ← suspend la validation, reprise via ModalConfirm
                }
                // Devis avec Acompte Réglé ----
                if (dev.statutCode === 20) {
                    const fa = factures.find(f => f.codeType === 20 && f.refFac === dev.refDevis);
                    if (fa && fa.refPre !== facture!.refFac) {
                        showAlert(
                            'Information',
                            `La 'Facture Brouillon' en cours de Création fait référence au Devis <strong>${dev.refFac}</strong> dont l'Acompte a déjà été imputé sur une autre Facture.<br>` +
                            `En conséquence, cette Facture ne sera pas imputée de cet Acompte.`
                        );
                    }
                }
            }
        }
        validerSuite();
    }
    // ─── Suite de la validation ──────────────────
    function validerSuite() {
        if (!facture) return;
        const errs: string[] = [];
        // Date d'émission — vérification directe ----
        if (!facture.dateEmis) {
            errs.push('• La Date d\'émission doit être renseignée.');
        }
        // Type de Délai ---
        if (!facture.typeDelai || facture.typeDelai === 0) {
            errs.push('• Un Type de Délai doit être sélectionné.');
        }
        // Nombre de jours (délai libre) ----
        if (facture.typeDelai === 1) {
            const nbJours = Number(facture.delai);
            if (!facture.delai || nbJours <= 0) {
                errs.push('• Le nombre de jours doit être saisi.');
            } else if (nbJours > 30) {
                errs.push('• Le nombre de jours ne peut pas dépasser 30.');
            }
        }
        // Type de Pénalité (Facture client professionnel) ----
        if (facture.codeType == 30 && factureClientSchema.typeCli0 == 0
            && penaliteSchema.typePenalite0 === '') {
            errs.push('• Un Type de Pénalité de Retard doit être sélectionné.');
        }
        if (errs.length > 0) {
            showAlert('Saisies obligatoires', errs.join('<br>'));
            return;
        }
        // Calculs (tous les champs valides) ----
        const dateLimite = calculDateLimite();
        dateEcheanceSchema.date0 = dateLimite;
        switch (facture.typeDelai) {
            case 1:  libDelai0 = facture.delai + ' j';    break;
            case 2:  libDelai0 = '45j fin de mois';       break;
            case 3:  libDelai0 = '45j date émission';     break;
            case 4:  libDelai0 = '60j date émission';     break;
        }
        if (facture.typeDelai !== 1) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            const todayMidnight = new Date().setHours(0, 0, 0, 0);
            facture.delai = Math.ceil((new Date(dateEcheanceSchema.date0).getTime() - todayMidnight) / (1000 * 60 * 60 * 24));
        }
        colorStatut(dateEcheanceSchema.date0, dateEcheanceSchema, facture as FactureStatutState);
        (facture as Record<string, unknown>).dateEcheance = dateEcheanceSchema.date0 + '|' + dateEcheanceSchema.couleurHtml0;
        dateEcheanceDate0 = dateEcheanceSchema.date0;
        etatEntete0 = 'table';
    }

    // Calcul de la Date Limite ──────────────────
    function calculDateLimite(): string {
        if (!facture) return '';
        function toSlash(date: Date | string | undefined | null): string {
            if (!date) return '';
            if (date instanceof Date) {
                return String(date.getDate()).padStart(2, '0') + '/'
                    + String(date.getMonth() + 1).padStart(2, '0') + '/'
                    + date.getFullYear();
            }
            if (date.includes('-')) {
                const [y, m, d] = date.split('-');
                return `${d}/${m}/${y}`;
            }
            return date;
        }
        const dateEmisStr = toSlash(facture.dateEmis);
        if (!dateEmisStr) return '';   // date d'émission absente → calcul impossible
        function addDays(ds: string, jours: number): string {
            const [d, m, y] = ds.split('/').map(Number);
            const date = new Date(y, m - 1, d + jours);
            return String(date.getDate()).padStart(2, '0') + '/'
                + String(date.getMonth() + 1).padStart(2, '0') + '/'
                + date.getFullYear();
        }
        let dateLimite = '';
        switch (facture.typeDelai) {
            case 1:
                dateLimite = addDays(dateEmisStr, Number(facture.delai));
                break;
            case 2: {
                const mFin        = parseInt(dateEmisStr.slice(3, 5), 10);
                const yFin        = parseInt(dateEmisStr.slice(6, 10), 10);
                const dernierJour = getDaysInMonth(mFin, yFin);
                dateLimite = addDays( String(dernierJour).padStart(2, '0') + '/' + String(mFin).padStart(2, '0') + '/' + yFin, 45);
                break;
            }
            case 3:
                dateLimite = addDays(dateEmisStr, 45);
                break;
            case 4:
                dateLimite = addDays(dateEmisStr, 60);
        };
        return dateLimite;
    }
    // Détermine le dernier jour pour le mois et l'année considérée
    function getDaysInMonth(m: number, y: number): number {
        return m==2 ? y & 3 || !(y%25) && y & 15 ? 28 : 29 : 30 + (m+(m>>3)&1);
    }
    // Restitue le libellé du Type de Pénalité choisi
    const libellesPenalite = [
        `Intérêt Légal<br>Avec Indemnité Forfaitaire`,
        `Intérêt Légal<br>Sans Indemnité Forfaitaire`,
        `Intérêt BCE<br>Avec Indemnité Forfaitaire`,
        `Intérêt BCE<br>Sans Indemnité Forfaitaire`,
        `Intérêt Légal - CGV<br>Avec Indemnité Forfaitaire`,
        `Intérêt Légal - CGV<br>Sans Indemnité Forfaitaire`,
        `Intérêt BCE - CGV<br>Avec Indemnité Forfaitaire`,
        `Intérêt BCE - CGV<br>Sans Indemnité Forfaitaire`,
        `Mention CGV<br>Sans Calcul de Taux`
    ];
    function libTypePena(typePenalite: number): string {
        const texte = libellesPenalite[typePenalite];
        return texte ? `<span style="font-size:12px">${texte}</span>` : '';
    }
</script>

<div class="divTitre">
    <div style="display:flex;flex-direction:row;align-items:center;color:#60A2F2;font-size:13px;margin:0 3px;opacity:0.8">
        <hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-right:5px"/>Données Générales<hr style="flex:1;border:none;border-top:1px solid #60A2F2;opacity:0.5;margin-left:5px"/>
    </div>
</div>
{#if facture} 
    <!--  TABLE D'AFFICHAGE des Données Saisie  =================================================   -->
    {#if etatEntete0 == 'table'} 
        <table class="cssTable">
            <thead>
                <tr>
                    <th>N° {action !== '' ? action : (facture?.codeType === 10 ? 'Devis' : 'Facture')}</th>
                    {#if action == 'Facture' && facture.refDevis != ''}
                        <th>N° Devis</th>
                    {/if}
                    <th>Date Emission</th>
                    <th>Délai</th>
                    <th>Date Echéance</th>
                    {#if facture.codeType ==30 && factureClientSchema.typeCli0 == 0} <!-- Si Facture et type de Client Professionnel -->
                        <th>Type de Pénalité</th>
                    {/if}
                    <th style="width:30px"></th>
                </tr>
            </thead>
            <tbody>
                <tr style="height:20px">
                    <td style="font-size:14px !important">{facture.refFac}</td>
                    {#if action == 'Facture' && facture.refDevis != ''}
                        <td style="font-size:14px !important">{facture.refDevis}</td>
                    {/if}
                    <td style="font-size:14px !important">{facture.dateEmis instanceof Date
                        ? facture.dateEmis.toLocaleDateString('fr-FR')
                        : String(facture.dateEmis).includes('-')
                        ? String(facture.dateEmis).split('-').reverse().join('/')
                        : facture.dateEmis}
                    </td>
                    <td style="font-size:14px !important">{libDelai0}</td>
                    <td style="color:{dateEcheanceSchema.couleurHtml0};font-weight:bold;font-size:14px !important">{dateEcheanceSchema.date0}</td>
                    {#if facture.codeType == 30 && factureClientSchema.typeCli0 == 0}
                        <td class="td-pena" style="font-size:14px !important">
                            <span class="pena-tooltip">(*)
                                {#if penaliteSchema.typePenalite0 !== ''}
                                    <span class="pena-tooltip-content">
                                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                        {@html libTypePena(Number(penaliteSchema.typePenalite0))}
                                    </span>
                                {/if}
                            </span>
                        </td>
                    {/if}
                    <td style="font-size:14px !important">
                        <button class="sg-link" style="margin-top:-10px;font-weight:600" title="Modifier les Données Générales" onclick={()=>etatEntete0='saisie'}>{dateEcheanceSchema.date0==='' ? 'Compléter':'Modifier'}</button>
                    </td>
                </tr>
            </tbody>
        </table>
    {:else}
    <!--  DIV DE SAISIE des Données d'Entete  =================================================  -->
        <div class="saisieEntete" style="margin-left:10px; margin-right:10px">
            <div class="sg-row" style="margin-top:-15px">
                {#if facture.codeType != 0}
                    <div style="margin-top:20px">
                        <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Date Emission</legend>
                        <input type="date" name="dateEmis" bind:value={dateEmisStr} style="height:30px;padding-top:2px;font-size:13px">
                    </div>
                    {#if facture.codeType == 30 && affaire.devis && affaire.devis.length > 0} <!-- Facture : Choix d’un N° de Devis -->
                        <div style="margin-top:20px;margin-left:10px">
                            <legend style="font-size:11px">Référence Devis</legend>
                            <select class="sg-select" value={refDevisStr} onchange={(e)=>{ if (facture) facture.refDevis = (e.target as HTMLSelectElement).value}} style="width:120px;height:30px">
                                <option value="" disabled hidden>Choisir ...</option>
                                {#each [...new Set([...(facture?.refDevis ? [facture.refDevis] : []), ...devisOptions])] as devis (devis)}
                                    <option value={devis}>{devis}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}
                    <div style="margin-top:20px;margin-left:10px">
                        <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>{legendTypeDelai}</legend>
                        <select class="sg-select" onchange={(e) => updateDelai(e)} bind:value={facture.typeDelai} style="width:170px;height:30px">
                            <option value={0} disabled hidden>Type de Délai</option>
                            {#each typeDelaiLib as delai (delai.ind)}
                                <option value={delai.ind}>{delai.lib}</option>
                            {/each}
                        </select>
                    </div>
                    {#if facture.typeDelai == 1}
                        <div style="margin-top:20px;margin-left:2px">
                            <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Jours</legend>
                            <div class="row" style="margin-top:0px;margin-right:-10px">
                                <div class="champIn">
                                    <input type="text" value={!isNaN(Number(facture.delai)) ? String(Number(facture.delai) || 0):'0'} onkeydown={(e)=>onlyNumeric(e)} onblur={(e)=>formatEntierInput(e, (v)=>{if(facture) facture.delai=v})} style="width:38px;height:30px;text-align:center" required maxlength="2">
                                </div>
                            </div>
                        </div>
                    {/if}
                    {#if facture.codeType == 30 && factureClientSchema.typeCli0 == 0} <!-- Facture : choix du Type de Pénalité de Retard -->
                        <div style="margin-top:20px;margin-left:10px">
                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                            <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>{legendTypePena}</legend>
                            <select class="sg-select" bind:value={penaliteSchema.typePenalite0} onchange={()=>legendTypePena="Type de pénalité sélectionné"} style="width:185px;height:30px" title="Choisir un Type de pénalité &#13; Pour plus d'information, cliquer sur `Précisions sur les Pénalités de Retard`">
                            <option value="" disabled hidden>Type de Pénalité</option>
                            <option disabled style="font-weight:bold">Calcul Taux d’Intérêt Légal</option>
                            <option value={0}>&nbsp;&nbsp;Avec Indem. Forfait.</option>
                            <option value={1}>&nbsp;&nbsp;Sans Indem. Forfait.</option>
                            <option disabled style="font-weight:bold">Calcul Taux de la BCE</option>
                            <option value={2}>&nbsp;&nbsp;Avec Indem. Forfait.</option>
                            <option value={3}>&nbsp;&nbsp;Sans Indem. Forfait.</option>
                            <option disabled style="font-weight:bold"> Calcul Taux d’Intérêt Légal avec Mention CGV</option>
                            <option value={4}>&nbsp;&nbsp;Avec Indem. Forfait.</option>
                            <option value={5}>&nbsp;&nbsp;Sans Indem. Forfait.</option>
                            <option disabled style="font-weight:bold"> Calcul Taux de la BCE avec Mention CGV</option>
                            <option value={6}>&nbsp;&nbsp;Avec Indem. Forfait.</option>
                            <option value={7}>&nbsp;&nbsp;Sans Indem. Forfait.</option>
                            <option value={8} style="font-weight:bold;color:grey"> Sans Calcul de Taux avec Mention CGV </option>
                            </select>
                        </div>
                        <div style="margin-top:40px;margin-left:1px">
                            <button type="button" onclick={()=>modalInfo()} title="Informations sur les Types de Pénalités de Retard de Règlement" style="background:none;border:none;padding:0;cursor:pointer;line-height:0">
                                <img src="/question.png" alt="Informations" width="20px" height="20px"/>
                            </button>
                        </div>
                    {/if}
                    <button class="btnNormal" onclick={() => valider()} style="margin-top:34px;width:60px;height:30px">Valider</button>
                {/if}
            </div>
        </div>
    {/if}
{/if}
<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} onclose={()=>alerteVisible = false}/>
<ModalConfirm bind:visible={confirmVisibleFb} titre="Confirmation" message={confirmMessageFb} labelConfirm="Oui" labelAnnuler="Non"
              onconfirm={()=>{confirmVisibleFb=false; validerSuite()}} onannuler={()=>{confirmVisibleFb=false;onAbandonner()}} />

<style>
    .divTitre {
        height: auto;
        margin-top: 15px;
    }
    .row {
        display: flex;
        flex-direction: row;
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
    .saisieEntete {
        display:flex;
        flex-direction:row;
        justify-content:center;
    }
    .td-pena {
        position: relative;
        cursor: pointer;
    }
    .pena-tooltip {
        position: relative;
        display: inline-block;
        font-size: 12px;
        font-weight: 400;
        color: #475569;
    }
    .pena-tooltip:hover {
        font-size: 16px;   /* ← agrandi au survol */
        color: red;      /* ← changement de couleur optionnel */
    }
    .pena-tooltip-content {
        display: none;
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 6px 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        white-space: nowrap;
        z-index: 100;
        font-size: 11px;
        color: #334155;
    }
    .pena-tooltip:hover .pena-tooltip-content {
        display: block;
    }
</style>