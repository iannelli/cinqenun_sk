<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidate } from '$app/navigation';
    import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
    import { type Client, ClientFormSchema } from '$lib/schemas/client';
    import ModalConfirm from '$lib/components/ModalConfirm.svelte';
    import ModalAlerte from '$lib/components/ModalAlerte.svelte';
    import type { ActionResult } from '@sveltejs/kit';
    import { fade } from 'svelte/transition';
    import paysData from '$lib/data/pays.json';
    import { page } from '$app/state';

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
                    const newClientId = (result.data as { client?: { id: number } })?.client?.id ?? 0;
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

    // ─── Refs modales ────────────────────────────────────────────
    let clientDialog = $state<HTMLDialogElement | null>(null);
    let alerteVisible = $state(false);
    let alerteTitre   = $state('');
    let alerteMessage = $state('');

    // ─── État ────────────────────────────────────────────────────
    let modalMode      = $state<'create' | 'update'>('create');
    let paysInput = $state('');
    let clientToEdit   = $state<Client | null>(null);
    let clientToDelete = $state<Client | null>(null);
    let confirmDeleteVisible = $state(false);
    let bandeauVisible = $state(false);
    let bandeauMessage = $state('');

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
        paysInput = client.pays ?? '';
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
</script>

<!-- ═══════════════════════════════════════════════════════════════
     SNIPPET : corps du formulaire (champs partagés) reçoit les valeurs courantes + un setter générique afin d'être compatible avec les deux instances Superforms.
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
     PAGE
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
                        <tr><td colspan="9" class="empty-state">Aucun client trouvé.</td></tr>
                    {:else}
                        {#each data.clients as client (client.id)}
                            <tr class="sg-trSha">
                                <td>{client.libClient}</td>
                                <td>{client.adres}</td>
                                <td>{client.adresCompl}</td>
                                <td>{client.cp}</td>
                                <td>{client.ville ?? '—'}</td>
                                <td>{client.pays  ?? '—'}</td>
                                <td>{formatMontant(client.soldeDebit)}</td>
                                <td>{formatMontant(client.soldeCredit)}</td>
                                <td class="sg-tdOverlay">
                                    <div class="sg-rowActions sg-rowActions--clients">
                                        <button class="sg-btn" data-tooltip="Consulter ou Mettre à jour ce Client" onclick={() => openUpdateModal(client)}><img style="height:18px" src="/pencil.png" alt=""/></button>
                                        <button class="sg-btn" data-tooltip="Supprimer ce Client" onclick={() => openDeleteModal(client)}><img style="height:18px" src="/trash.png" alt=""/></button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
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
                <button type="submit" class="btn-submit" disabled={$updatingSubmitting}>{$updatingSubmitting ? 'Modifier' : 'Modifier'}</button>
                <button type="button" class="btn-cancel" onclick={closeClientModal}>Annuler</button>
            </div>
        </form>
    {/if}
</dialog>
<ModalAlerte bind:visible={alerteVisible} titre={alerteTitre} message={alerteMessage} onclose={()=>alerteVisible=false}/>
<ModalConfirm bind:visible={confirmDeleteVisible} titre="Suppression du Client" message="Êtes-vous sûr de vouloir supprimer le client <strong>« {clientToDelete?.libClient ?? ''} »</strong> ?<br>Cette action est irréversible." labelConfirm="Supprimer" onconfirm={()=>deleteClient()} onannuler={()=>clientToDelete=null}/>
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
    /* ── Pied de modale ── */
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
        padding: 0.5rem 1.3rem;
        background: var(--color-primary, #6e8cf0);
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
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
</style>