<script lang="ts">
    import { onMount }                                    from 'svelte';
    import type { ActionResult }                          from '@sveltejs/kit';
    import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
    import { invalidate, invalidateAll }                  from '$app/navigation';
    import { fade }                                       from 'svelte/transition';
    import { page }                                       from '$app/state';
    import { type Client, ClientFormSchema, parseCredit, parseDebit } from '$lib/schemas/client';
    import { drawerInfoUtils } from '$lib/utils/drawerInfo';
    import { excedent }        from '$lib/utils/messageInfo';
    import paysData            from '$lib/data/pays.json';
    import ModalConfirm        from '$lib/components/ModalConfirm.svelte';
    import ModalAlerte         from '$lib/components/ModalAlerte.svelte';
   
    let mounted = $state(false);

    onMount(() => {
        document.body.style.cursor = '';
        mounted = true;
    });

    $effect(() => {
        if ($creatingSubmitting || $updatingSubmitting) {
            document.body.classList.add('wait-cursor');
            } else {
                document.body.classList.remove('wait-cursor');
            }
        }
    );

    // ─── ToolTip Ligne de la Liste des Clients ──────────────────────────────────
    let hoveredClient = $state<Client | null>(null);
    let tooltipStyleC = $state('');
    let hideTimerC: ReturnType<typeof setTimeout> | undefined;
    function onClientRowEnter(e: MouseEvent, client: Client) {
        clearTimeout(hideTimerC);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleC  = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
        hoveredClient  = client;
    }
    function onClientRowMove(e: MouseEvent) {
        if (!hoveredClient) return;
        clearTimeout(hideTimerC);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleC = `top:${rect.top + rect.height / 2}px;left:${e.clientX}px;transform:translate(-50%,-50%)`;
    }
    function onClientRowLeave() {
        hideTimerC = setTimeout(() => { hoveredClient = null; }, 300);
    }
    function onClientTooltipEnter() { clearTimeout(hideTimerC); }
    function onClientTooltipLeave() {
        hideTimerC = setTimeout(() => { hoveredClient = null; }, 300);
    }
    // ─── ToolTip de l'Entête de colonne "Rembousement" de la Table du compte Client ──────────────────────────────
    let thTooltipVisible = $state(false);
    let thTooltipStyle   = $state('');
    function onThEnter(e: MouseEvent) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const dialogRect = compteDialog?.getBoundingClientRect() ?? { top: 0, left: 0 };
        thTooltipStyle   = `top:${rect.top - dialogRect.top - 30}px;left:${rect.left - dialogRect.left + rect.width / 2}px;transform:translateX(-50%)`;
        thTooltipVisible = true;
    }
    function onThLeave() {
        thTooltipVisible = false;
    }
    // ─── ToolTip Ligne de la Table du compte Client ──────────────────────────────
    let hoveredLigne   = $state<{ refFac0: string; solde0: string; soldeRemb0: string } | null>(null);
    let tooltipStyleL  = $state('');
    let tooltipToutL   = $state<ReturnType<typeof setTimeout> | null>(null);

    // ─── Contexte de retour ──────────────────────────────────────────
    const fromAffaire = $derived(page.url.searchParams.get('from') === 'affaire');

    // ─── Props ───────────────────────────────────────────────────
    let { data }: {
        data: {
            clients:    Client[];
            createForm: SuperValidated<Infer<typeof ClientFormSchema>>;
        };
    } = $props();
    // svelte-ignore state_referenced_locally
    const initialForm = data.createForm;

    // ─── Typage du PAYS ───────────────────────────────────────────
    type Pays = { nom: string; ue: number };
    const pays: Pays[] = paysData as Pays[];

    // ─── Superforms instances ────────────────────────────────────
    const {
        form:       createForm,
        enhance:    enhanceCreate,
        submitting: creatingSubmitting,
        message:    createMessage,
        reset:      resetCreate
    } = superForm(initialForm, {
        id: 'create',
        onUpdate: ({ form }) => {
            if (!form.valid) afficherBandeauErreur(form.errors as Record<string, unknown>);
        },
        onResult: ({ result }: { result: ActionResult }) => {
            if (result.type === 'success') {
                clientDialog?.close();
                resetCreate();
                bandeauVisible = false;
                // ─── Retour vers affaire si navigation depuis affaire ─────
                if (fromAffaire) {
                    const newClientId    = (result.data as { client?: { id: number } })?.client?.id ?? 0;
                    window.location.href = `/affaire?from=client&newClientId=${newClientId}`;
                    return;
                }
                // ─── Rafraîchir la liste des clients (cache layout) ───────
                invalidate('app:clients');
            }
        }
    });
    const {
        form:       updateForm,
        enhance:    enhanceUpdate,
        submitting: updatingSubmitting,
    } = superForm(initialForm, {
        id: 'update',
        onUpdate: ({ form }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!form.valid) afficherBandeauErreur(form.errors as any);
        },
        onResult: ({ result }: { result: ActionResult }) => {
            if (result.type === 'success') {
                clientDialog?.close();
                resetCreate();
                bandeauVisible = false;
                if (fromAffaire) {
                    const newClientId = (result.data as { client?: { id: number } })?.client?.id ?? 0;
                    window.location.href = `/affaire?from=client&newClientId=${newClientId}`;
                    return;
                }
                // ─── Rafraîchir la liste des clients (cache layout) ───────
                invalidate('app:clients');
            }
        }
    });

    function formatFrLocal(val: number): string {
        return val.toFixed(2).replace('.', ',');
    }

    // ─── Refs modales ────────────────────────────────────────────
    let clientDialog  = $state<HTMLDialogElement | null>(null);
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');

    // ─── État ────────────────────────────────────────────────────
    let modalMode            = $state<'create' | 'update'>('create');
    let paysInput            = $state('');
    let clientToEdit         = $state<Client | null>(null);
    let clientToDelete       = $state<Client | null>(null);
    let confirmDeleteVisible = $state(false);
    let bandeauVisible       = $state(false);
    let bandeauMessage       = $state('');

    // ─── Compte Client ───────────────────────────────────────────
    let compteDialog   = $state<HTMLDialogElement | null>(null);
    let rembDialog     = $state<HTMLDialogElement | null>(null);
    let barDialog      = $state<HTMLDialogElement | null>(null);
    let clientCompte   = $state<Client | null>(null);
    let activeTab      = $state<'credit' | 'debit'>('credit');
    // Remboursement ------------
    let rembRefFac     = $state('');
    let rembSoldeMax   = $state('');
    let rembMontant    = $state('');
    let rembDate       = $state('');
    let rembErrors     = $state<string[]>([]);
    let rembSubmitting = $state(false);
    // Annulation remboursement ------------
    let barRefFac       = $state('');
    let barSoldeRemb    = $state('');
    let barMontant      = $state('');
    let barDate         = $state('');
    let barErrors       = $state<string[]>([]);
    let showRembConfirm = $state(false);
    let showBarConfirm  = $state(false);
    let barSubmitting   = $state(false);
    // ─── Fonctions ToolTip Ligne de la Table du compte Client ──────────────────────────────
    function onLigneEnter(e: MouseEvent, ligne: { refFac0: string; solde0: string; soldeRemb0: string }) {
        if (tooltipToutL) clearTimeout(tooltipToutL);
        hoveredLigne     = ligne;
        const dialogRect = compteDialog?.getBoundingClientRect() ?? { top: 0, left: 0 };
        const rowRect    = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleL = `top:${rowRect.top + rowRect.height / 2 - dialogRect.top}px;left:${e.clientX - dialogRect.left}px;transform:translate(-50%,-50%)`;
    }
    function onLigneLeave() {
        tooltipToutL = setTimeout(() => { hoveredLigne = null; }, 300);
    }
    function onLigneTooltipEnter() {
        if (tooltipToutL) clearTimeout(tooltipToutL);
    }
    function onLigneTooltipLeave() {
        tooltipToutL = setTimeout(() => { hoveredLigne = null; }, 300);
    }
    function onLigneRowMove(e: MouseEvent) {
        if (!hoveredLigne) return;
        if (tooltipToutL) clearTimeout(tooltipToutL);
        const dialogRect = compteDialog?.getBoundingClientRect() ?? { top: 0, left: 0 };
        const rowRect    = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipStyleL    = `top:${rowRect.top + rowRect.height / 2 - dialogRect.top}px;left:${e.clientX - dialogRect.left}px;transform:translate(-50%,-50%)`;
    }
    // ─── Gestion modale client ───────────────────────────────────
    function afficherBandeauErreur(errors: Record<string, unknown>): void {
        const msgs = Object.values(errors)
            .flat()
            .filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
        if (msgs.length) {
            bandeauMessage = msgs.join(' — ');
            bandeauVisible = true;
        }
    }
    function openCreateModal() {
        modalMode = 'create';
        paysInput = '';
        resetCreate();
        clientDialog?.showModal();
    }
    function openUpdateModal(client: Client) {
        modalMode    = 'update';
        clientToEdit = { ...client };
        $updateForm.libClient  = client.libClient;
        $updateForm.temoinType = client.temoinType ?? 0;
        $updateForm.adres      = client.adres      ?? '';
        $updateForm.adresCompl = client.adresCompl ?? '';
        $updateForm.cp         = client.cp         ?? '';
        $updateForm.ville      = client.ville      ?? '';
        $updateForm.pays       = client.pays       ?? '';
        paysInput              = client.pays       ?? '';
        $updateForm.temoinCee  = client.temoinCee  ?? 0;
        $updateForm.temoinTva  = client.temoinTva  ?? 0;
        $updateForm.siren      = client.siren      ?? '';
        $updateForm.tvaIntra   = client.tvaIntra   ?? '';
        $updateForm.phone      = client.phone      ?? '';
        $updateForm.mail       = client.mail       ?? '';
        $updateForm.contNom    = client.contNom    ?? '';
        $updateForm.contPhone  = client.contPhone  ?? '';
        $updateForm.contTexte  = client.contTexte  ?? '';
        clientDialog?.showModal();
    }
    function closeClientModal() {
        clientDialog?.close();
        if (modalMode === 'update') clientToEdit = null;
    }

    // ─── Gestion modale suppression ──────────────────────────────
    function openDeleteModal(client: Client) {
        clientToDelete       = client;
        confirmDeleteVisible = true;
    }
    async function deleteClient() {
        if (!clientToDelete) return;
        const fd = new FormData();
        fd.append('id', String(clientToDelete.id));
        const resp = await fetch(location.pathname + '?/delete', { method: 'POST', body: fd });
        const result = await resp.json();
        if (!resp.ok || result?.type === 'failure') {
            confirmDeleteVisible = false;
            alerteTitre   = 'Suppression impossible';
            alerteMessage = result?.data?.message ?? 'Une erreur est survenue.';
            alerteVisible = true;
            return;
        }
        confirmDeleteVisible = false;
        clientToDelete       = null;
        // ─── Rafraîchir la liste des clients localement ───────────
        invalidate('app:clients');
    }
    // ─── Formatage ───────────────────────────────────────────────
    function formatMontant(val: number | null | undefined): string {
        if (val == null) return '—';
        return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    // ─── Recherche PAYS ───────────────────────────────────────────────
    function handleInput(event: Event) {
        const val   = (event.target as HTMLInputElement).value;
        paysInput   = val;
        const found = pays.find((etat: Pays) => val === etat.nom);
        if (!found) return;
        if (modalMode === 'create') {
            $createForm.pays      = found.nom;
            $createForm.temoinCee = found.ue;
        } else {
            $updateForm.pays      = found.nom;
            $updateForm.temoinCee = found.ue;
        }
    }
    // ─── Affichage Message ────────────────────────────────────────
    $effect(() => {
        if ($createMessage) {
            const timer = setTimeout(() => { $createMessage = ''; }, 3000);
            return () => clearTimeout(timer);
        }
    });

    // ─── Helpers compte ───────────────────────────────────────────
    function parseFrLocal(val: string): number {
        return parseFloat(val.replace(/\s/g, '').replace(',', '.')) || 0;
    }
    function formatDateFr(dateStr: string): string {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
    
    // ─── Gestion modale compte ────────────────────────────────────
    function openCompteModal(client: Client) {
        clientCompte = { ...client };
        activeTab    = 'credit';
        compteDialog?.showModal();
    }
    function closeCompteModal() {
        compteDialog?.close();
        clientCompte = null;
    }
    function openRembModal(refFac: string, soldeMax: string) {
        rembRefFac      = refFac;
        rembSoldeMax    = soldeMax;
        rembMontant     = '';
        rembDate        = '';
        rembErrors      = [];
        showRembConfirm = false;    // ← AJOUTER
        rembDialog?.showModal();
    }
    function openBarModal(refFac: string, soldeRemb: string) {
        barRefFac      = refFac;
        barSoldeRemb   = soldeRemb;
        barMontant     = '';
        barDate        = '';
        barErrors      = [];
        showBarConfirm = false;
        barDialog?.showModal();
    }
    // ─── Submit remboursement ─────────────────────────────────────
    function submitRemboursement() {
        rembErrors = [];
        if (!rembMontant.trim()) rembErrors.push('Le montant est obligatoire.');
        if (!rembDate.trim())    rembErrors.push('La date est obligatoire.');
        if (!rembErrors.length) {
            const montantNum = parseFrLocal(rembMontant);
            const soldeNum   = parseFrLocal(rembSoldeMax);
            if (montantNum <= 0)       rembErrors.push('Le montant doit être supérieur à 0.');
            if (montantNum > soldeNum) rembErrors.push(`Le montant ne peut dépasser le solde (${rembSoldeMax}).`);
        }
        if (rembErrors.length) return;
        showRembConfirm = true;   // ← affiche la confirmation
    }
    async function confirmRemboursement() {
        showRembConfirm = false;
        rembSubmitting  = true;
        const fd        = new FormData();
        fd.append('clientId', String(clientCompte!.id));
        fd.append('refFac0',  rembRefFac);
        fd.append('montant',  rembMontant.trim());
        fd.append('date',     formatDateFr(rembDate));
        const resp = await fetch('?/rembourser', { method: 'POST', body: fd });
        rembSubmitting = false;
        if (resp.ok) {
            rembDialog?.close();
            const clientId = clientCompte!.id;
            await invalidateAll();
            // Rafraîchir clientCompte avec les données mises à jour
            clientCompte = data.clients.find(c => c.id === clientId) ?? null;
        }
    }

    // ─── Submit annulation remboursement ──────────────────────────
    function submitBarValidate() {
        barErrors = [];
        if (!barMontant.trim()) barErrors.push('Le montant est obligatoire.');
        if (!barDate.trim())    barErrors.push('La date est obligatoire.');
        if (!barErrors.length) {
            const montantNum   = parseFrLocal(barMontant);
            const soldeRembAbs = Math.abs(parseFrLocal(barSoldeRemb));
            if (montantNum <= 0)          barErrors.push('Le montant doit être supérieur à 0.');
            if (montantNum > soldeRembAbs) barErrors.push(`Le montant ne peut dépasser ${formatFrLocal(soldeRembAbs)}.`);
        }
        if (barErrors.length) return;
        showBarConfirm = true;
    }
    async function confirmBarAnnulation() {
        showBarConfirm = false;
        barSubmitting  = true;
        const fd = new FormData();
        fd.append('clientId', String(clientCompte!.id));
        fd.append('refFac0',  barRefFac);
        fd.append('montant',  barMontant.trim());
        fd.append('date',     formatDateFr(barDate));
        const resp = await fetch('?/annulerRemboursement', { method: 'POST', body: fd });
        barSubmitting = false;
        if (resp.ok) {
            barDialog?.close();
            const clientId = clientCompte!.id;
            await invalidateAll();
            // Rafraîchir clientCompte avec les données mises à jour
            clientCompte = data.clients.find(c => c.id === clientId) ?? null;
        }
    }
    // ─── Modal d'Information ─────────────────────────────────────────
    function modalInfo(): void {
        drawerInfoUtils.ouvrir({
            titre:   "Encaissement Excédentaire : Conséquences Fisacles et Sociales",
            message: excedent,
            largeur: '900px',
        });
    }
</script>

<!-- ═══════════════════════════════════════════════════════════════
    CORPS du formulaire (champs partagés) reçoit les valeurs courantes + un setter générique afin d'être compatible avec les deux instances Superforms.
════════════════════════════════════════════════════════════════ -->
{#snippet formFields({ vals, setField }: {
    vals:     typeof $createForm,
    setField: (key: keyof typeof $createForm, value: unknown) => void
})}
    <div class="modal-columns">
        <!-- COLONNE DE GAUCHE ==========================================================  -->
        <div class="colGauche">
            <!-- Section : Informations générales -->
            <fieldset class="sg-fieldset">
                <legend class="sg-legende">Identification</legend>
                <div class="sg-row">
                    <span class="sg-asterix">*</span>
                    <div class="sg-field" style="flex:1">
                        <input id="f-libClient" name="libClient" type="text" class="sg-input" placeholder=" " value={vals.libClient} oninput={(e) => setField('libClient', e.currentTarget.value)} autocomplete="new-password"/>
                        <label for="f-libClient" class="sg-label">Nom Client</label>
                    </div>
                    <div class="radio-row" style="margin-top:7px">
                        <span class="fiscal-label" style="margin-left:10px">Type de Client :</span>
                        <label class="radio-label" style="margin-left:-5px"><input type="radio" name="type" value="0" checked={vals.temoinType === 0} onchange={() => setField('temoinType', 0)}/>Professionnel</label>
                        <label class="radio-label" style="margin-left:-3px"><input type="radio" name="type" value="1" checked={vals.temoinType === 1} onchange={() => setField('temoinType', 1)}/> Particulier</label>
                    </div>
                </div>
                <div class="sg-row">
                    <span class="sg-asterix">*</span>
                    <div class="sg-field" style="flex:1">
                        <input id="f-adres" name="adres" type="text" class="sg-input" placeholder=" " maxlength="255" value={vals.adres ?? ''} oninput={(e) => setField('adres', e.currentTarget.value)} autocomplete="new-password"/>
                        <label for="f-adres" class="sg-label">Adresse</label>
                    </div>
                    <div class="sg-field" style="flex:0.8">
                        <input id="f-adresCompl" name="adresCompl" type="text" class="sg-input" placeholder=" " maxlength="255" value={vals.adresCompl ?? ''} oninput={(e) => setField('adresCompl', e.currentTarget.value)} autocomplete="new-password"/>
                        <label for="f-adresCompl" class="sg-label">Complément d'adresse</label>
                    </div>
                </div>
                <div class="sg-row">
                    <span class="sg-asterix">*</span>
                    <div class="sg-field" style="flex:0.2">
                        <input id="f-cp" name="cp" type="text" class="sg-input" placeholder=" " maxlength="5" value={vals.cp ?? ''} oninput={(e) => setField('cp', e.currentTarget.value)} autocomplete="new-password"/>
                        <label for="f-cp" class="sg-label" style="margin-left:-10px">Code postal</label>
                    </div>
                    <span class="sg-asterix">*</span>
                    <div class="sg-field" style="flex:0.5">
                        <input id="f-ville" name="ville" type="text" class="sg-input" placeholder=" " maxlength="150" value={vals.ville ?? ''} oninput={(e) => setField('ville', e.currentTarget.value)} autocomplete="new-password"/>
                        <label for="f-ville" class="sg-label">Ville</label>
                    </div>
                    <span class="sg-asterix">*</span>
                    <div class="sg-field" style="flex:0.5">
                        <input id="f-pays" name="pays" type="text" class="sg-input" placeholder=" " maxlength="60" list="list-pays" bind:value={paysInput} oninput={handleInput}  autocomplete="off"/>
                        <label for="f-pays" class="sg-label">Pays</label>
                        <datalist id="list-pays">
                            {#each pays as etat (etat.nom)}
                                <option value={etat.nom}>{etat.nom}</option>
                            {/each}
                        </datalist>
                        <input type="hidden" name="temoinCee" value={modalMode === 'create' ? $createForm.temoinCee : $updateForm.temoinCee}/>
                    </div>
                </div>
                <div class="sg-row" style="margin-top:15px">
                    <span class="sg-asterix" style="color:white">*</span>
                    <div class="sg-field" style="flex:0.3">
                        <input id="f-phone" name="phone" type="text" class="sg-input" placeholder=" " maxlength="12" value={vals.phone ?? ''} oninput={(e) => setField('phone', e.currentTarget.value)}/>
                        <label for="f-phone" class="sg-label">Téléphone</label>
                    </div>
                    <span class="sg-asterix" style="color:white">*</span>
                    <div class="sg-field" style="flex:1">
                        <input id="f-mail" name="mail" type="text" class="sg-input" placeholder=" " maxlength="60" value={vals.mail ?? ''} oninput={(e) => setField('mail', e.currentTarget.value)}/>
                        <label for="f-mail" class="sg-label">E-mail</label>
                    </div>
                </div>
            </fieldset>
            <!-- Section : Situation du Compte -->
            <fieldset class="sg-fieldset" style="margin-top:20px">
                <legend class="sg-legende">Situation du Compte</legend>
                <div style="font-size:13px;margin-top:-10px">
                    <label for="" >Encaissement excédentaire : <span class="sg-montant">{formatMontant(clientToEdit?.soldeCredit)}</span></label>
                    <label for="" style="margin-left:20px">Reste Dû : <span class="sg-montant">{formatMontant(clientToEdit?.soldeDebit)}</span></label>
                </div>
            </fieldset>
        </div>
        <!-- COLONNE DE DROITE =======================================================================  -->
        <div class="colDroite">
            <!-- Section : Statut Réglementaire -->
            <fieldset class="sg-fieldset">
                <legend class="sg-legende">Statut Réglementaire</legend>
                <div class="sg-row">
                    <div class="radio-row">
                        <span class="fiscal-label">Assujetti à la TVA :</span>
                        <label class="radio-label" style="margin-left:-5px"><input type="radio" name="temoinTva" value="0" checked={(vals.temoinTva ?? 0) === 0} onchange={() => setField('temoinTva', 0)}/> Oui</label>
                        <label class="radio-label" style="margin-left:-3px"><input type="radio" name="temoinTva" value="1" checked={(vals.temoinTva ?? 0) === 1} onchange={() => setField('temoinTva', 1)} /> Non</label>               
                    </div>
                </div>
                <div class="sg-row">
                    <div class="sg-field" style="flex:0.8">
                        <input id="f-siren" name="siren" type="text" class="sg-input" placeholder=" " maxlength="60" value={vals.siren ?? ''} oninput={(e) => setField('siren', e.currentTarget.value)}/>
                        <label for="f-adres" class="sg-label">Siren</label>
                    </div>
                    <div class="sg-field" style="flex:1">
                        <input id="f-tvaIntra" name="tvaIntra" type="text" class="sg-input" placeholder=" " maxlength="60" value={vals.tvaIntra ?? ''} oninput={(e) => setField('tvaIntra', e.currentTarget.value)}/>
                        <label for="f-adresCompl" class="sg-label">N° TVA intracommunautaire</label>
                    </div>
                </div>
            </fieldset>
            <!-- Section : Contact -->
            <fieldset class="sg-fieldset" style="margin-top:10px">
                <legend class="sg-legende">Contact</legend>
                <div class="sg-row">
                    <div class="sg-field" style="flex:1">
                        <input id="f-contNom" name="contNom" type="text" class="sg-input" placeholder=" " maxlength="60" value={vals.contNom ?? ''} oninput={(e) => setField('contNom', e.currentTarget.value)}/>
                        <label for="f-contNom" class="sg-label">Nom du contact</label>
                    </div>
                    <div class="sg-field" style="flex:0.5">
                        <input id="f-contPhone" name="contPhone" type="text" class="sg-input" placeholder=" " maxlength="12" value={vals.contPhone ?? ''} oninput={(e) => setField('contPhone', e.currentTarget.value)}/>
                        <label for="f-contPhone" class="sg-label">Tél. du contact</label>
                    </div>
                </div>
                <div class="form-group">
                    <textarea id="f-contTexte" name="contTexte" rows="3" value={vals.contTexte ?? ''} oninput={(e) => setField('contTexte', e.currentTarget.value)} placeholder="Saisissez vos commentaires ici ..."></textarea>
                </div>
            </fieldset>
        </div>
    </div>
{/snippet}

<!-- ═══════════════════════════════════════════════════════════════
     LISTE DES CLIENTS
════════════════════════════════════════════════════════════════ -->
{#if mounted}
    <div class="client-page" in:fade="{{ duration: 1500 }}">
        <div class="page-header">
            <h1>Liste des Clients</h1>
            <button class="sg-link" onclick={openCreateModal}>Créer un Nouveau Client</button>
        </div>
        <div class="table-wrapper">
            <table class="sg-myTable">
                <thead>
                    <tr style="color:gray">
                        <th>Nom Client</th>
                        <th>Adresse</th>
                        <th>Complément Adresse</th>
                        <th>Code postal</th>
                        <th>Ville</th>
                        <th>Pays</th>
                        <th>Solde Débit</th>
                        <th>Solde Crédit</th>
                        <th class="sg-thOverlay"></th>
                    </tr>
                </thead>
                <tbody>
                    {#if data.clients.length === 0}
                        <tr><td colspan="10" class="empty-state">Aucun client trouvé.</td></tr>
                    {:else}
                        {#each data.clients as client (client.id)}
                            <tr class="sg-trSha {hoveredClient?.id === client.id ? 'sg-trSha--hovered' : ''}" style="cursor:pointer" onmouseenter={(e)=>{clearTimeout(hideTimerC);onClientRowEnter(e, client)}}
                                onmousemove={onClientRowMove} onmouseleave={onClientRowLeave}>
                                <td>{client.libClient}</td>
                                <td>{client.adres}</td>
                                <td>{client.adresCompl}</td>
                                <td>{client.cp}</td>
                                <td>{client.ville ?? '—'}</td>
                                <td>{client.pays  ?? '—'}</td>
                                <td>{formatMontant(client.soldeDebit)}</td>
                                <td>{formatMontant(client.soldeCredit)}</td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
            {#if hoveredClient}
                {@const hovered = hoveredClient}
                <div role="toolbar" tabindex="-1" style="position:fixed;{tooltipStyleC};z-index:100;display:flex;gap:13px;padding:4px 12px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);pointer-events:auto"
                     onmouseenter={onClientTooltipEnter} onmouseleave={onClientTooltipLeave}>
                    <button class="sg-btn ttBtn" data-tooltip="Supprimer ce Client" onclick={() => openDeleteModal(hovered)}><img src="/trash.png" alt=""/></button>
                    <button class="sg-btn ttBtn" data-tooltip="Consulter ou Mettre à jour ce Client" onclick={() => openUpdateModal(hovered)}><img src="/pencil.png" alt=""/></button>
                    <button class="sg-btn ttBtn" data-tooltip="Consulter le Compte Client" onclick={() => openCompteModal(hovered)}><img src="/compte.png" alt=""/></button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════
     MODALE UNIQUE : CRÉATION / MODIFICATION
     • modalMode === 'create' → form action ?/create + enhanceCreate
     • modalMode === 'update' → form action ?/update + enhanceUpdate
     Le snippet formFields est rendu dans les deux cas avec les valeurs et le setter propres à chaque instance Superforms.
════════════════════════════════════════════════════════════════ -->
<dialog bind:this={clientDialog} class="sg-divDialog">
    <button class="sg-dialogFermer" title="Annulation de l'Opération" onclick={closeClientModal}><img src="/close.png" alt=""/></button>
    {#if bandeauVisible}
        <div class="bandeau"><span>⚠ {bandeauMessage}</span></div>
    {/if}
    <!-- En-tête : titre dynamique selon le mode -->
    <div class="modal-header">
        <h2>{modalMode === 'create' ? "Création d'un Client" : "Modification d'un Client"}</h2>
    </div>
    <!-- ── Formulaire CRÉATION ── -->
    {#if modalMode === 'create'}
        <form method="POST" action="?/create" use:enhanceCreate>
            {@render formFields({
                vals:     $createForm,
                setField: (key, value) => { ($createForm[key] as unknown) = value; }
            })}
            <div class="modal-footer">
                <button type="submit" class="btn-submit" disabled={$creatingSubmitting}>{$creatingSubmitting ? 'Créer' : 'Créer'}</button>
                <button type="button" class="btn-cancel" onclick={closeClientModal}>Annuler</button>
            </div>
        </form>
    <!-- ── Formulaire MODIFICATION ── -->
    {:else if clientToEdit}
        <form method="POST" action="?/update" use:enhanceUpdate>
            <input type="hidden" name="id" value={clientToEdit.id} />
            {@render formFields({
                vals:     $updateForm,
                setField: (key, value) => { ($updateForm[key] as unknown) = value; }
            })}
            <div class="modal-footer">
                <button type="submit" class="btn-submit" style="width:100px" disabled={$updatingSubmitting}>{$updatingSubmitting ? 'Modifier' : 'Modifier'}</button>
                <button type="button" class="btn-cancel" style="width:100px" onclick={closeClientModal}>Annuler</button>
            </div>
        </form>
    {/if}
</dialog>
<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} onclose={()=>alerteVisible=false}/>
<ModalConfirm bind:visible={confirmDeleteVisible} titre="Suppression du Client" message="Êtes-vous sûr de vouloir supprimer le client <strong>« {clientToDelete?.libClient ?? ''} »</strong> ?<br>Cette action est irréversible." labelConfirm="Supprimer" onconfirm={()=>deleteClient()} onannuler={()=>clientToDelete=null}/>

<!-- ═══════════════════════════════════════════════════════════════
     MODALE COMPTE CLIENT
════════════════════════════════════════════════════════════════ -->
<dialog bind:this={compteDialog} style="max-width:min(1050px,98vw);width:min(1050px,98vw);position:fixed;top:100px;left:50%;transform:translateX(-50%);margin:0;max-height:calc(100vh - 80px);overflow:visible;border:none;padding:0.0rem;box-shadow:0 25px 60px rgba(0,0,0,0.45),0 8px 20px rgba(0,0,0,0.25)" aria-modal="true">
    <div style="position:relative;padding-top:1.5rem;overflow:visible">
        <button class="sg-dialogFermer" title="Fermer" style="top:-1.0rem;right:-1.0rem;z-index:10" onclick={closeCompteModal}><img src="/close.png" alt=""/></button>
        <!-- Onglets -->
        <div class="tabs">
            <button type="button" class="tab {activeTab === 'credit' ? 'tab-active' : ''}"  onclick={()=>activeTab='credit'}>Mouvements Créditeur</button>
            <div style="margin-top:8px;margin-left:-18px">
                <button type="button" onclick={()=>modalInfo()} title="Informations sur les Types de Pénalités de Retard de Règlement" style="background:none;border:none;padding:0;cursor:pointer;line-height:0">
                    <img src="/question.png" alt="Informations" width="20px" height="20px"/>
                </button>
            </div>
            <button type="button" class="tab {activeTab === 'debit' ? 'tab-active' : ''}" onclick={()=>activeTab='debit'}>Mouvements Débiteur</button>
        </div>
        <div class="tab-content">
            {#if activeTab === 'credit'}
                {@const creditLignes = parseCredit(clientCompte?.credit) ?? []}
                <div class="table-wrapper">
                    <table class="sg-myTable">
                        <thead>
                            <tr>
                                <th title="Facture à l'Origine de l'Excédent">Facture Origine</th>
                                <th class="col-montant" title="Solde remboursable">Solde</th>
                                <th class="col-montant" title="Solde des Remboursements encore possible" style="cursor:help;position:relative" onmouseenter={onThEnter} onmouseleave={onThLeave}>Remboursement <span style="color:red">(?)</span></th>
                                <th>Nature</th>
                                <th>Date</th>
                                <th class="col-montant">Montant</th>
                                <th>Facture Imputée</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each creditLignes as ligne (ligne.refFac0)}
                                {#each ligne.mouvements0 as mouv, i (i)}
                                    <tr class:tr-first={i === 0} onmouseenter={(e) => onLigneEnter(e, ligne)}  onmousemove={onLigneRowMove} onmouseleave={onLigneLeave}>
                                        {#if i === 0}
                                            <td class="cell-ref" title="Facture à l'Origine de l'Excédent">{ligne.refFac0}</td>
                                            <td class="col-montant cell-solde" title="Solde remboursable">{ligne.solde0}</td>
                                            <td class="col-montant cell-solde">{ligne.soldeRemb0}</td>
                                        {:else}
                                            <td></td>
                                            <td></td>
                                            <td></td>
                                        {/if}
                                        <td>{mouv.nature0}</td>
                                        <td>{mouv.date0}</td>
                                        <td class="col-montant">{mouv.montant0}</td>
                                        <td>{mouv.facImput0}</td>
                                    </tr>
                                {/each}
                                <tr class="tr-separator"><td colspan="8"></td></tr>
                            {/each}
                            <tr class="tr-total">
                                <td style="text-align:center">Solde total</td>
                                <td colspan="7" style="text-align:left !important">{formatMontant(clientCompte?.soldeCredit)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            {/if}
            <!--  ──────  ONGLET DEBIT ──────  -->
            {#if activeTab === 'debit'}
                {@const debitLignes = parseDebit(clientCompte?.debit) ?? []}
                <div class="table-wrapper">
                    <table class="sg-myTable">
                        <thead>
                            <tr>
                                <th title="Facture à l'Origine du Reste Dû" style="width:170px">Facture d'Origine</th>
                                <th class="col-montant">Solde</th>
                                <th>Nature</th>
                                <th>Date</th>
                                <th class="col-montant">Montant</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each debitLignes as ligne (ligne.refFac0)}
                                {#each ligne.mouvements0 as mouv, i (i)}
                                    <tr class:tr-first={i === 0}>
                                        {#if i === 0}
                                            <td class="cell-ref" title="Facture à l'Origine du Reste Dû">{ligne.refFac0}</td>
                                            <td class="col-montant cell-solde">{ligne.solde0}</td>
                                        {:else}
                                            <td></td>
                                            <td></td>
                                        {/if}
                                        <td>{mouv.nature0}</td>
                                        <td>{mouv.date0}</td>
                                        <td class="col-montant">{mouv.montant0}</td>
                                    </tr>
                                {/each}
                                <tr class="tr-separator"><td colspan="5"></td></tr>
                            {/each}
                            <tr class="tr-total">
                                <td>Solde total</td>
                                <td colspan="4" style="text-align:left">{formatMontant(clientCompte?.soldeDebit)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>
        <div class="sg-dialogFooter">
            <button type="button" class="sg-button" style="margin-bottom:15px" onclick={closeCompteModal}>Fermer</button>
        </div>
    </div>
    <!-- Tooltip ligne-facture -->
    {#if hoveredLigne}
        {@const hovered   = hoveredLigne}
        {@const solde     = parseFrLocal(hovered.solde0)}
        {@const soldeRemb = parseFrLocal(hovered.soldeRemb0)}
        <div role="toolbar" tabindex="-1"
             style="position:fixed;{tooltipStyleL};z-index:1000;display:flex;gap:8px;padding:4px 12px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);pointer-events:auto;white-space:nowrap"
             onmouseenter={onLigneTooltipEnter} onmouseleave={onLigneTooltipLeave}>
            {#if solde > 0}
                <button class="btn-remb" onclick={()=>openRembModal(hovered.refFac0, hovered.solde0)}><span style="font-size:15px;font-weight:700">&#8364;</span>Rembourser</button>
            {/if}
            {#if soldeRemb < 0}
                <button class="btn-bar" onclick={()=>openBarModal(hovered.refFac0, hovered.soldeRemb0)}><span style="font-size:15px;font-weight:700">&#8634;</span>Annuler le Remboursement</button>
            {/if}
        </div>
    {/if}
     <!-- Tooltip de l'Entête de la colonne "Remboursement de la Table des Comptes" -->
    {#if thTooltipVisible}
        <div style="position:absolute;{thTooltipStyle};z-index:200;background:#1e293b;color:white;font-size:11px;white-space:nowrap;padding:4px 8px;border-radius:4px;pointer-events:none">
            Solde des Remboursements encore possible
        </div>
    {/if}
</dialog>  <!-- fermeture du compteDialog -->

<!-- ═══════════════════════════════════════════════════════════════
     MODALE REMBOURSEMENT
════════════════════════════════════════════════════════════════ -->
<dialog bind:this={rembDialog}
        style="max-width:min(780px,98vw);width:min(600px,98vw);position:fixed;top:100px;left:50%;transform:translateX(-50%);margin:0;max-height:calc(100vh - 80px);overflow:visible;border:none;padding:0.75rem;box-shadow:0 25px 60px rgba(0,0,0,0.45),0 8px 20px rgba(0,0,0,0.25)" aria-modal="true">
    <div style="position:relative;padding-top:1.5rem;overflow:visible;">
        <button class="sg-dialogFermer" title="Annuler" style="top:-1.4rem;right:-1.4rem;z-index:10" onclick={()=>rembDialog?.close()}><img src="/close.png" alt=""/></button>
        <fieldset class="sg-fieldset">
            <legend class="sg-legende">Remboursement de l'Excédent issu de la Facture N° {rembRefFac}  —  Maximum : {rembSoldeMax}€</legend>
            {#if rembErrors.length}
                <div class="remb-errors" style="margin-bottom:0.75rem">
                    {#each rembErrors as err, i (i)}<p>• {err}</p>{/each}
                </div>
            {/if}
            <!-- Champs sur la même ligne -->
            <div class="sg-row" style="margin-top:-15px;gap:30px;justify-content:center">
                <div style="margin-top:20px;margin-left:2px">
                    <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Montant</legend>
                    <div class="row" style="margin-top:0px;margin-right:-10px">
                        <div class="champIn">
                            <input id="remb-montant" type="text" placeholder="0,00" autocomplete="new-password" bind:value={rembMontant} style="width:100px;height:30px;text-align:center" required>
                        </div>
                    </div>
                </div>
                <div style="margin-top:20px">
                    <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Date</legend>
                    <input id="remb-date" type="date" bind:value={rembDate} style="width:120px;height:30px;padding-top:2px;font-size:13px">
                </div>
                <button class="btn-submit" onclick={submitRemboursement} disabled={rembSubmitting} style="margin-left:-10px;margin-top:32px;width:120px;height:32px">{rembSubmitting ? 'En cours…' : 'Enregistrer'}</button>
            </div>
        </fieldset>
        <div class="sg-dialogFooter">
            <button type="button" class="sg-button" onclick={() => rembDialog?.close()}>Fermer</button>
        </div>
        <!-- Overlay de confirmation -->
        {#if showRembConfirm}
            <div class="confirm-overlay">
                <div class="confirm-box">
                    <p class="confirm-question">Confirmez-vous le Remboursement ?</p>
                    <div class="confirm-btns">
                        <button type="button" class="sg-button" style="background:#2563eb;color:white;border-color:#2563eb" onclick={confirmRemboursement} disabled={rembSubmitting}>Oui</button>
                        <button type="button" class="sg-button" onclick={() => showRembConfirm = false}>Non</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</dialog>

<!-- ═══════════════════════════════════════════════════════════════
     MODALE ANNULATION REMBOURSEMENT
════════════════════════════════════════════════════════════════ -->
<dialog bind:this={barDialog} style="max-width:min(780px,98vw);width:min(600px,98vw);position:fixed;top:100px;left:50%;transform:translateX(-50%);margin:0;max-height:calc(100vh - 80px);overflow:visible;border:none;padding:0.75rem;box-shadow:0 25px 60px rgba(0,0,0,0.45),0 8px 20px rgba(0,0,0,0.25)" aria-modal="true">
    <div style="position:relative;padding-top:1.5rem;overflow:visible">
        <button class="sg-dialogFermer" title="Annuler" style="top:-1.4rem;right:-1.4rem;z-index:10" onclick={()=>barDialog?.close()}><img src="/close.png" alt=""/></button>
        <fieldset class="sg-fieldset">
            <legend class="sg-legende">Annulation du Remboursement issu de la Facture N° {barRefFac}  — Maximum : {formatFrLocal(Math.abs(parseFrLocal(barSoldeRemb)))} €</legend>
            {#if barErrors.length}
                <div class="remb-errors" style="margin-bottom:0.75rem">
                    {#each barErrors as err, i (i)}<p>• {err}</p>{/each}
                </div>
            {/if}
            <!-- Champs sur la même ligne -->
            <div class="sg-row" style="margin-top:-15px;gap:30px;justify-content:center">
                <div style="margin-top:20px;margin-left:2px">
                    <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Montant</legend>
                    <div class="row" style="margin-top:0px;margin-right:-10px">
                        <div class="champIn">
                            <input id="remb-montant" type="text" placeholder="0,00" autocomplete="new-password" bind:value={barMontant} style="width:100px;height:30px;text-align:center" required>
                        </div>
                    </div>
                </div>
                <div style="margin-top:20px">
                    <legend style="font-size:11px"><span style="color:red">*&nbsp;</span>Date</legend>
                    <input id="remb-date" type="date" bind:value={barDate} style="width:120px;height:30px;padding-top:2px;font-size:13px">
                </div>
                <button class="btn-submit" onclick={submitBarValidate} disabled={barSubmitting} style="margin-left:-10px;margin-top:33px;width:120px;height:31px">{barSubmitting ? 'En cours…' : 'Enregistrer'}</button>
            </div>
           </fieldset>
        <div class="sg-dialogFooter">
            <button type="button" class="sg-button" onclick={() => barDialog?.close()}>Fermer</button>
        </div>
        <!-- Overlay de confirmation -->
        {#if showBarConfirm}
            <div class="confirm-overlay">
                <div class="confirm-box">
                    <p class="confirm-question">Confirmez-vous l'annulation ?</p>
                    <div class="confirm-btns">
                        <button type="button" class="sg-button" style="background:#dc2626;color:white;border-color:#dc2626" onclick={confirmBarAnnulation} disabled={barSubmitting}>Oui</button>
                        <button type="button" class="sg-button" onclick={()=>showBarConfirm=false}>Non</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</dialog>

<style>
    /* ── Layout principal de la page ── */
    .client-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        font-family: Verdana, Geneva, Tahoma, sans-serif;
    }
    /* ── En-tête ── */
    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .page-header h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text, #1e293b);
        margin: 0;
    }
    /* ── Tableau ── */
    .table-wrapper {
        overflow-x: auto;
        border-radius: 10px;
        border: 1px solid var(--color-border, #e2e8f0);
        box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }
    .sg-montant {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .empty-state {
        text-align: center;
        color: #94a3b8;
        padding: 2rem;
        font-style: italic;
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
        transition: background 0.15s;
    }
    .ttBtn img {
        display: block;
        width: 17px;
        height: 17px;
    }
    /* ── En-tête de modale ── */
    .bandeau {
        position: sticky;
        top: 0;
        z-index: 11;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        background-color: #f8d7da;
        color:#721c24;
        border: 1px solid #f5c6cb;
        border-radius: 3px;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .modal-header {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        padding: 1.25rem 1.5rem 0.75rem;
        position: sticky;
        top: 0;
        background: #fff;
        z-index: 1;
        border-bottom: 1px solid #f1f5f9;
    }
    .modal-header h2 {
        font-size: 1.1rem;
        font-weight: 700;
        color: #1e293b;
        margin: 0;
    }
    .modal-columns {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }
    .colGauche {
        flex: 1 1 0;
        min-width: 0;
        padding-right: 0.5rem;
    }
    .colDroite {
        flex: 1 1 0;
        min-width: 0;
    }
    /* ── Overlay de confirmation ── */
    .confirm-overlay {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        z-index: 10;
    }
    .confirm-box {
        background: #fff;
        border-radius: 10px;
        padding: 1.5rem 2rem;
        text-align: center;
        min-width: 220px;
    }
    .confirm-question {
        font-size: 0.95rem;
        font-weight: 600;
        color: #1e293b;
        margin: 0 0 1.25rem;
    }
    .confirm-btns {
        display: flex;
        justify-content: center;
        gap: 1rem;
    }
    /* ── Groupes label + input ── */
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 0.75rem;
    }
    .form-group textarea {
        padding: 0.55rem 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 0.875rem;
        color: #1e293b;
        /*font-family: inherit;*/
        transition: border-color 0.15s, box-shadow 0.15s;
        outline: none;
        width: 100%;
        box-sizing: border-box;
    }
    .form-group textarea {
        resize: vertical;
    }
    .form-group textarea:focus {
        border-color: var(--color-primary, #2563eb);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }
    ::placeholder { 
        font-size: 12px !important;
    }
    /* ── Radio boutons ── */
    .radio-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 10px;
        font-size: 12px;
    }
    .radio-label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        color: #444;
    }
    .radio-label input[type="radio"] {
        accent-color: #78a7db;
    }
    /* ── Pied de Modal ── */
    .modal-footer {
        margin-top: 20px;
        display: flex;
        justify-content: center; /* Centre horizontalement */
        gap: 15px;              /* Espace entre les deux boutons */
        padding-top: 15px;
        width: 100%;
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
    .btn-submit {
        /*padding: 0.5rem 1.3rem;*/
        background: var(--color-primary, #6e8cf0);
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 0.850rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-submit:hover:not(:disabled) {
        background: var(--color-primary-dark, #1d4ed8);
    }
    .btn-submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    /* ──  Table compte : Onglets ── */
    .tabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid #e2e8f0;
        padding: 0 1.5rem;
        /*background: #f8fafc;*/
    }
    .tab {
        padding: 0.65rem 1.4rem;
        background: none;
        border: none;
        border-bottom: 3px solid transparent;
        font-size: 0.875rem;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        margin-bottom: -2px;
        transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: #334155; }
    .tab-active {
        color: var(--color-primary, #2563eb);
        border-bottom-color: var(--color-primary, #2563eb);
    }
    /* ── Table Compte : Ligne-facture ── */
    .tab-content {
        padding: 1rem 1.5rem 1.5rem;
        overflow-x: auto;
        overflow-y: auto;
        max-height: calc(100vh - 240px);
    }
    .cell-ref {
        font-weight: 700;
        color: #1e293b;
        vertical-align: top;
        padding-top: 0.55rem;
    }
    .cell-solde {
        font-weight: 700;
        vertical-align: top;
        padding-top: 0.55rem;
    }
    .tr-separator td {
        padding: 0.2rem 0;
        border-bottom: 2px solid #e2e8f0;
    }
    .tr-total td {
        /*background: #f8fafc;*/
        font-weight: 700;
        color: #1e293b;
        border-top: 2px solid #cbd5e1;
        padding: 0.6rem 0.75rem;
    }
    .tr-total td:first-child {
        text-align: center;
    }
    .tr-total td:not(:first-child) {
        text-align: left;
    }
    /* ── Tooltip dans la table compte ── */
    .tab-content {
        padding: 1rem 1.5rem 1.5rem;
        overflow-x: auto;
        overflow-y: visible;             /* ← remplacer auto par visible */
        max-height: calc(100vh - 240px);
    }
    /* ── Corps modale remboursement ── */
    .remb-errors {
        background: #fef2f2;
        border: 1px solid #fca5a5;
        border-radius: 6px;
        padding: 0.75rem 1rem;
        color: #dc2626;
        font-size: 0.85rem;
    }
    .remb-errors p { margin: 0 0 0.25rem; }
    .remb-errors p:last-child { margin: 0; }
    
    /* ── Boutons "Rembourser" / "Annuler le Remboursement" ── */
    .btn-remb {
        display: block;
        /*margin-bottom: 0.2rem;*/
        padding: 0.25rem 0.65rem;
        background: #eff6ff;
        color: #2563eb;
        border: 1px solid #bfdbfe;
        border-radius: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-remb:hover { background: #dbeafe; }
    .btn-bar {
        display: block;
        /*margin-bottom: 0.2rem;*/
        padding: 0.25rem 0.65rem;
        background: #fff7ed;
        color: #c2410c;
        border: 1px solid #fed7aa;
        border-radius: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-bar:hover { background: #ffedd5; }
</style>