<script lang="ts">
    import { onMount }                          from 'svelte';
    import type { ActionResult }                from '@sveltejs/kit';
    import { page }                             from '$app/state';
    import { invalidate, goto, beforeNavigate } from '$app/navigation';
    import { fade, scale }                      from 'svelte/transition';
    import { superForm, type SuperValidated, type Infer }       from 'sveltekit-superforms';
    import { parseNbrMontAffaire, type Abonne }                 from '$lib/schemas/abonne';
    import { type Affaire, AffaireFormSchema }                  from '$lib/schemas/affaire';
    import { checkFacturesValideesFetch, prepareUpdateAffaire } from '$lib/components/affaire/AffairePage.utils';
    import ModalConfirm      from '$lib/components/ModalConfirm.svelte';
    import ModalAlerte       from '$lib/components/ModalAlerte.svelte';
    import { formatMontant } from '$lib/utils/format';

    let mounted = $state(false);
    onMount(() => {
        document.body.style.cursor = '';
        mounted = true;
    });
    beforeNavigate(() => { document.body.style.cursor = 'wait'; });
    $effect(() => {
        if ($affaireSubmitting) {
            document.body.classList.add('wait-cursor');
        } else {
            document.body.classList.remove('wait-cursor');
        }
    });

    // ─── ToolTip Ligne Liste des Affaires ──────────────────────────────────
    let hoveredAffaire = $state<Affaire | null>(null);
    let tooltipStyle   = $state('');
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    function onRowEnter(e: MouseEvent, affaire: Affaire) {
        clearTimeout(hideTimer);
        const rect     = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyle   = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
        hoveredAffaire = affaire; // ← mise à jour immédiate
    }
    function onRowMove(e: MouseEvent) {
        if (!hoveredAffaire) return;
        clearTimeout(hideTimer);
        const rect   = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyle = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
    }
    function onRowLeave() {
        hideTimer = setTimeout(() => {
            hoveredAffaire = null;
        }, 500);
    }
    function onTooltipLeave() {
        hideTimer = setTimeout(() => {
            hoveredAffaire = null;
        }, 500);
    }
    function onTooltipEnter() {
        clearTimeout(hideTimer);
    }
    // ─── Modale ALERTE ──────────────────────────────────────────
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');
    // ─── Props ───────────────────────────────────────────────────
    let { data }: {
        data: {
            abonne:     Abonne;
            affaires:   Affaire[];
            createForm: SuperValidated<Infer<typeof AffaireFormSchema>>;
            clients:    { id:number; libClient:string }[];
        };
    } = $props();
    // svelte-ignore state_referenced_locally
    const initialForm = data.createForm;

    // ─── Détection du retour depuis Client ────────────────────────────
    const fromClient  = $derived(page.url.searchParams.get('from') === 'client');
    const newClientId = $derived(parseInt(page.url.searchParams.get('newClientId') ?? '0', 10) || 0);
    // Rouvrir la modale et sélectionner le nouveau client au retour
    $effect(() => {
        if (fromClient) {
            affaireDialog?.showModal();
            if (newClientId) {
                $affaireForm.clientId = newClientId;
            }
        }
    });
    // ─── Ouvrir la page client avec contexte de retour ───────────────
    function openClientPage() {
        window.location.href = '/client?from=affaire';
    }

    // ─── Superforms instances ────────────────────────────────────
    const {form:affaireForm, errors:affaireErrors, enhance:enhanceAffaire, submitting:affaireSubmitting, message:affaireMessage, reset:resetAffaire} = superForm(initialForm, {
        id:'affaire',
        onResult: ({ result }: { result: ActionResult }) => {
            if (result.type === 'success') {
                affaireDialog?.close();
                if (!affaireToEdit) {
                    ongletCourant0 = 2;
                }
                resetAffaire();
                affaireToEdit = null;
                invalidate('app:abonne'); // nbrMontAffaire a changé (création uniquement)
            }
        }
    });

    // ─── Gestion des Onglets "Affaire" ────────────────────────────────
    // Onglet actif : 1=En Cours | 2=En Attente | 3=Inactive | 4=Soldée
    let ongletCourant0 = $state(
        data.affaires.some(a => a.situation === '20x' || a.situation === '30x') ? 1 : // Onglet Affaire en Cours
        data.affaires.some(a => a.situation === '00x' || a.situation === '10x' || a.situation === null) ? 2 : // Onglet Affaire en Attente
        data.affaires.some(a => a.situation === '11a' || a.situation === '11b') ? 3 : // Onglet Affaire Inactive
        data.affaires.some(a => a.situation === '31a' || a.situation === '31b') ? 4 : 1 // Onglet Affaire Soldée
    );
    // Compteurs issus de abonne.nbrMontAffaire (mis à jour par traitement côté serveur)
    const nbrMontAffaireArray = $derived(parseNbrMontAffaire(data.abonne.nbrMontAffaire));
    const ongletEnCourNb0     = $derived(nbrMontAffaireArray[2] + nbrMontAffaireArray[4]);   // '20x' + '30x' : Onglet Affaire en Cours
    const ongletAttenteNb0    = $derived(nbrMontAffaireArray[0] + nbrMontAffaireArray[1]);   // '00x' + '10x' : Onglet Affaire en Attente
    const ongletInactNb0      = $derived(nbrMontAffaireArray[6] + nbrMontAffaireArray[8]);   // '11a' + '11b' : Onglet Affaire Inactive
    const ongletSoldeNb0      = $derived(nbrMontAffaireArray[10] + nbrMontAffaireArray[12]); // '31a' + '31b' : Onglet Affaire Soldée
    // Liste filtrée selon l'onglet actif
    const affairesFiltrees    = $derived.by((): Affaire[] => {
        switch (ongletCourant0) {
            case 1: return data.affaires.filter(a => a.situation === '20x' || a.situation === '30x'); // Onglet Affaire en Cours
            case 2: return data.affaires.filter(a => a.situation === '00x' || a.situation === '10x' || a.situation === null); // Onglet Affaire en Attente
            case 3: return data.affaires.filter(a => a.situation === '11a' || a.situation === '11b'); // Onglet Affaire Inactive
            case 4: return data.affaires.filter(a => a.situation === '31a' || a.situation === '31b'); // Onglet Affaire Soldée
            default: return data.affaires;
        }
    });
    function selectOngletAffaire(onglet: number): void {
        ongletCourant0 = onglet;
    }

    // ─── Liste des Affaires ──────────────────────────────────────
    const hasImputCreCli = $derived(
        affairesFiltrees.some(a => parseFloat(String(a.imputCreCli ?? '0').replace(',', '.')) > 0)
    );
    const hasExcedent = $derived(
        affairesFiltrees.some(a => parseFloat(String(a.montCli ?? '0').replace(',', '.')) > 0)
    );

    // ─── État ────────────────────────────────────────────────────
    let affaireDialog        = $state<HTMLDialogElement | null>(null);
    let confirmDeleteVisible = $state(false);
    let affaireToDelete      = $state<Affaire | null>(null);
    let affaireToEdit        = $state<Affaire | null>(null);

    // ─── Gestion modales ─────────────────────────────────────────
    function openCreateModal() {
        affaireToEdit = null;
        resetAffaire();
        affaireDialog?.showModal();
    }
    function openUpdateModal(affaire: Affaire) {
        affaireToEdit = affaire;
        prepareUpdateAffaire(affaire, (lib, cid) => {
            $affaireForm.libAffaire = lib;
            $affaireForm.clientId   = cid;
        });
        affaireDialog?.showModal();
    }
    function closeAffaireModal() {
        affaireDialog?.close();
        affaireToEdit = null;
    }
    async function openDeleteModal(affaire: Affaire) {
        await checkFacturesValideesFetch(affaire.id, {
            onBloquee: (titre, message) => {
                alerteTitre          = titre;
                alerteMessage        = message;
                alerteVisible        = true;
                confirmDeleteVisible = false;
            },
            onSupprimable: (a) => {
                affaireToDelete      = a;
                confirmDeleteVisible = true;
                alerteVisible        = false;
            }
        }, affaire);
    }
    async function deleteAffaire() {
        if (!affaireToDelete) return;
        const fd = new FormData();
        fd.append('id', String(affaireToDelete.id));
        const resp = await fetch('?/delete', { method: 'POST', body: fd });
        if (resp.ok) {
            confirmDeleteVisible = false;
            affaireToDelete      = null;
            invalidate('app:abonne');   // ← nbrMontAffaire a changé
            // Il faut aussi rafraîchir data.affaires (liste des affaires) :
            invalidate('app:affaires'); // ← à ajouter si vous créez cette dépendance dans le load
        }
    }
    // ─── Formatage ───────────────────────────────────────────────
    function formatDate(date: string | Date): string {
        try {
            return new Date(date).toLocaleDateString('fr-FR');
        } catch {
            return '—';
        }
    }
    // ─── Affichage Message ────────────────────────────────────────
    $effect(() => {
        if ($affaireMessage) {
            const timer = setTimeout(() => {
                $affaireMessage = '';
            }, 2800);
            return () => clearTimeout(timer);
        }
    });
</script>

{#if mounted}
    <div class="affaire-page" in:fade="{{ duration: 1500 }}">
        <h3 style="text-align:center">Liste des Affaires</h3>
        <!-- ===== ONGLETS SLIDEMENU ===== -->
        <div class="slidemenu" in:scale="{{ duration: 2000 }}">
            <div class="tabs">
                <button type="button" class="slide-tab {ongletCourant0 === 1 ? 'active' : ''}" onclick={() => selectOngletAffaire(1)}> <span>en Cours [{ongletEnCourNb0}]</span></button>
                <button type="button" class="slide-tab {ongletCourant0 === 2 ? 'active' : ''}" onclick={() => selectOngletAffaire(2)}><span>en Attente [{ongletAttenteNb0}]</span></button>
                <button type="button" class="slide-tab {ongletCourant0 === 3 ? 'active' : ''}" onclick={() => selectOngletAffaire(3)}><span>Inactive<sub style="font-size:0.8em">&nbsp;(archivée)</sub> [{ongletInactNb0}]</span></button>
                <button type="button" class="slide-tab {ongletCourant0 === 4 ? 'active' : ''}" onclick={() => selectOngletAffaire(4)}><span>Soldée<sub style="font-size:0.8em">&nbsp;(archivée)</sub> [{ongletSoldeNb0}]</span></button>
            </div>
            <div class="slider">
                <div class="bar" style="margin-left: {(ongletCourant0 - 1) * 25}%"></div>
            </div>
        </div>
        <div style="position:relative;height:0;top:-26px">
            {#if $affaireMessage}
                <div class="alert-success">{$affaireMessage}</div>
            {/if}
        </div>
        <div class="page-header" style="margin-top:-30px">
            <button class="sg-link" style="font-size:16px" onclick={openCreateModal}>Créer une Nouvelle Affaire</button>
        </div>
        <div class="table-wrapper">
            <table class="sg-myTable">
                <thead>
                    <tr style="color:gray">
                        <th>Libellé</th>
                        <th>Date Création</th>
                        <th>Client</th>
                        <th>Etat d'Avancement</th>
                        <th class="col-montant">Montant TTC</th>
                        {#if hasImputCreCli}
                            <th class="col-montant">Crédit Client</th>
                            <th class="col-montant">Montant Dû</th>
                        {/if}
                        <th class="col-montant">Montant Réglé</th>
                        {#if hasExcedent}
                            <th class="col-montant">Excédent</th>
                        {/if}
                        <th class="col-montant">Solde</th>
                        <th class="sg-thOverlay"></th>
                    </tr>
                </thead>
                <tbody>
                    {#if affairesFiltrees.length === 0}
                        <tr class="sg-trSha">
                            <td colspan={hasImputCreCli ? 10 : 8} class="empty-state">Aucune affaire trouvée.</td>
                        </tr>
                    {:else}
                        {#each affairesFiltrees as affaire (affaire.id)}
                            <tr class="sg-trSha {hoveredAffaire?.id === affaire.id ? 'sg-trSha--hovered' : ''}" style="cursor:pointer" onmouseenter={(e)=>{clearTimeout(hideTimer);onRowEnter(e, affaire)}}
                                onmousemove={onRowMove} onmouseleave={onRowLeave} onclick={()=>window.location.href=`/affaire/${affaire.id}`}>
                                <td>{affaire.libAffaire}</td>
                                <td>{formatDate(affaire.createdAt)}</td>
                                <td>{affaire.libClient}</td>
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                <td>{@html affaire.statutLib}</td>
                                <td class="col-montant">{affaire.montFac}</td>
                                {#if hasImputCreCli}
                                    <td class="col-montant">
                                        {parseFloat(String(affaire.imputCreCli ?? '0').replace(',', '.')) > 0 ? '- ' + formatMontant(affaire.imputCreCli) : ''}
                                    </td>
                                    <td class="col-montant">
                                        {parseFloat(String(affaire.imputCreCli ?? '0').replace(',', '.')) > 0  ? formatMontant(parseFloat(String(affaire.montFac ?? '0').replace(',', '.')) - parseFloat(String(affaire.imputCreCli ?? '0').replace(',', '.'))) : ''}
                                    </td>
                                {/if}
                                <td class="col-montant">{affaire.montRegl}</td>
                                {#if hasExcedent}
                                    <td class="col-montant">
                                        {parseFloat(String(affaire.montCli ?? '0').replace(',', '.')) > 0 ? formatMontant(affaire.montCli) : ''}
                                    </td>
                                {/if}
                                <td class="col-montant">{affaire.montSolde}</td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
            {#if hoveredAffaire}
                {@const hovered = hoveredAffaire}
                <div role="toolbar" tabindex="-1" style="position:fixed;{tooltipStyle};z-index:100;display:flex;gap:13px;padding:4px 12px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);pointer-events:auto"
                    onmouseenter={onTooltipEnter} onmouseleave={onTooltipLeave}>
                    <button class="sg-btn ttBtn" data-tooltip="Supprimer cette Affaire" onclick={(e) => { e.stopPropagation(); openDeleteModal(hovered) }}><img src="/trash.png" alt=""/></button>
                    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                    <button class="sg-btn ttBtn" data-tooltip="Afficher la liste des Factures de cette Affaire" onclick={(e) => { e.stopPropagation(); goto(`/affaire/${hovered.id}`) }}><img src="/list.png" alt=""/></button>
                    <button class="sg-btn ttBtn" data-tooltip="Consulter ou Mettre à jour cette Affaire" onclick={(e) => { e.stopPropagation(); openUpdateModal(hovered) }}><img src="/pencil.png" alt=""/></button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- ===== MODALE ALERTE ===== -->
<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} onclose={()=>alerteVisible=false}/>

<!-- ===== MODALE CRÉATION / MODIFICATION ===== -->
<dialog bind:this={affaireDialog} class="sg-divDialog">
    <fieldset class="sg-fieldset">
        <legend class="sg-legende" style="font-size:14px">{affaireToEdit ? "Modification d'une Affaire" : "Création d'une Affaire"}</legend>
        <button class="sg-dialogFermer" title="Annulation de la Saisie" onclick={closeAffaireModal}><img src="/close.png" alt=""/></button>
        <!-- Bloc d'affichage des erreurs groupées -->
        {#if $affaireErrors.libAffaire || $affaireErrors.clientId}
            <div class="form-errors">
                {#if $affaireErrors.libAffaire}
                    <p class="field-error">⚠ Libellé : {$affaireErrors.libAffaire}</p>
                {/if}
                {#if $affaireErrors.clientId}
                    <p class="field-error">⚠ Client : {$affaireErrors.clientId}</p>
                {/if}
            </div>
        {/if}
        <form method="POST" action={affaireToEdit ? '?/update' : '?/create'} use:enhanceAffaire>
            {#if affaireToEdit}
                <input type="hidden" name="id" value={affaireToEdit.id} />
            {/if}
            <div class="sg-row" style="margin-top:15px">
                <span class="sg-asterix">*</span>
                <div class="sg-field" style="flex:1">
                    <input id="affaire-libAffaire" name="libAffaire" style="min-width:180px" type="text" class="sg-input" placeholder=" " bind:value={$affaireForm.libAffaire} required/>
                    <label for="affaire-libAffaire" class="sg-label">Libellé</label>
                </div>
                {#if data.clients.length > 0}
                    <span class="sg-asterix">*</span>
                    <div style="flex:1">
                        <select id="affaire-clientId" name="clientId" style="min-width:180px" value={$affaireForm.clientId || ''} onchange={(e)=>$affaireForm.clientId=Number(e.currentTarget.value)}>
                            <option value="" disabled={!!affaireToEdit}>— Sélectionner un client —</option>
                            {#each data.clients as client (client.id)}
                                <option value={client.id}>{client.libClient}</option>
                            {/each}
                        </select>
                    </div>
                {/if}
                <span class="sg-asterix" style="color:white">*</span>
                <div style="flex:1">
                    <button type="button" class="btn-submit" onclick={openClientPage}>Créer / Modifier un Client</button>
                </div>
                {#if affaireToEdit}
                    <div class="sg-field" style="flex:1">
                        <input name="dateCreation" style="width:90px" type="text" class="sg-input" placeholder=" " value={formatDate(affaireToEdit.createdAt)} required readonly/>
                        <label for="affaire-libAffaire" class="sg-label">Créée le</label>
                    </div>
                {/if}
            </div>
            <div class="sg-dialogFooter">
                <button type="submit" class="sg-button" disabled={$affaireSubmitting}>{affaireToEdit ? "Modifier l'Affaire" : "Créer l'Affaire"}</button>
                <button type="button" class="sg-button" onclick={closeAffaireModal}>Annuler</button>
            </div>
        </form>
    </fieldset>
</dialog>

<!-- ===== MODALE CONFIRME ===== -->
<ModalConfirm
    bind:visible={confirmDeleteVisible} titre="Suppression de l'Affaire" message="Êtes-vous sûr de vouloir supprimer l'affaire <strong>« {affaireToDelete?.libAffaire ?? ''} »</strong> ?<br>Cette action est irréversible."
    labelConfirm="Supprimer" onconfirm={()=>deleteAffaire()} onannuler={()=>affaireToDelete=null}
/>

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
    /* ── Layout principal ── */
    .affaire-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    /* ── En-tête ── */
    .page-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        margin-top: -10px;
        margin-bottom: 5px;
        padding-right: 20px;
    }
    /* ── Alertes Messages Création/Modification ── */
    .alert-success {
        position: absolute;
        left: 0;
        right: 0;
        padding: 3px;
        border-radius: 6px;
        font-size: 0.875rem;
        height: 25px;
        text-align: center;
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #86efac;
        z-index: 10;
    }
    /* ── Tableau ── */
    .col-montant {
        text-align: center;
        font-variant-numeric: tabular-nums;
    }
    .empty-state {
        text-align: center;
        color: #94a3b8;
        padding: 2rem;
        font-style: italic;
    }
    /* --- Style du Select --- */
    select#affaire-clientId {
        border: 1px solid #b9b9b9; /* Bordure grise standard */
        border-radius: 4px;      /* Coins légèrement arrondis */
        padding: 5px 10px;       /* Espace interne pour le texte */
        background-color: white;
        color: #a09f9f;
        width: 100%;             /* Pour qu'il occupe l'espace du parent flex */
        height: 38px;            /* Hauteur standard pour aligner avec les inputs */
        outline: none;           /* Retire le contour bleu par défaut au clic */
        font-size: 12px;
        height: 32px;
    }
    select#affaire-clientId:focus {
        border-color: #666;      /* Bordure un peu plus foncée au survol/focus */
    }
    .form-errors {
        padding: 0.5rem 1.5rem 0;
    }
    .form-errors .field-error {
        margin: 0.2rem 0;
    }
    .field-error {
        font-size: 0.78rem;
        color: #dc2626;
    }
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

    /* ── Onglets Slidemenu ── */
    .slidemenu {
        width: 60%;
        display: flex;
        flex-direction: column;
        margin: 0 auto 0.5rem auto;
        margin-top: -10px;
    }
    .slidemenu .tabs {
        display: flex;
        width: 100%;
    }
    .slide-tab {
        flex: 1;
        text-align: center;
        color: #9ca3af;
        font-size: 0.85rem;
        font-weight: 600;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.6rem 0.5rem;
        transition: color 300ms ease-in-out;
    }
    .slide-tab:hover {
        color: #6b7280;
        background: none;
    }
    .slide-tab.active {
        color: #6AA5E6;
    }
    /* ── Barre animée ── */
    .slider {
        width: 100%;
        height: 3px;
        background: #e5e7eb;
        border-radius: 2px;
        position: relative;
    }
    .slider .bar {
        position: absolute;
        width: 25%;
        height: 3px;
        background: #6AA5E6;
        border-radius: 2px;
        transition: margin-left 400ms ease-in-out;
    }
    .btn-submit {
        /*padding: 0.5rem 1.3rem;*/
        width: 160px;
        height: 33px;
        background: var(--color-primary, #93a8f0);
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        /*font-weight: 600;*/
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-submit:hover:not(:disabled) {
        background: var(--color-primary-dark, #6e91f0);
    }
    .btn-submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
</style>
