<script lang="ts">
    import { onMount }                                    from 'svelte';
    import type { ActionResult }                          from '@sveltejs/kit';
    import { fade, fly }                                  from "svelte/transition";
    import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
    import { IdentificationFormSchema, type IdentificationFormSchema as IdentificationFormSchemaType, validerSIREN } from '$lib/schemas/abonne';

    let mounted = $state(false);
    onMount(() => {
        document.body.style.cursor = '';
        mounted                    = true;
    });

    let { data }: {
        data: {
            form:         SuperValidated<Infer<typeof IdentificationFormSchemaType>>;
            initialSiren: string;
            logoBase64:   string | null;
            welcome:      { email: string } | null;
        };
    } = $props();

    // svelte-ignore state_referenced_locally
    let showWelcomeModal = $state(!!data.welcome);

    // svelte-ignore state_referenced_locally
    const sirenDejaSaisi = (data.initialSiren ?? '').trim() !== '';

    // svelte-ignore state_referenced_locally
    let logoMode = $state(data.form.data.temoinLogo ?? 0);
    $effect(() => {
        $formData.temoinLogo = logoMode;
        if ($submitting) {
            document.body.classList.add('wait-cursor');
        } else {
            document.body.classList.remove('wait-cursor');
        }
    });
    // svelte-ignore state_referenced_locally
    let logoPreview     = $state(data.logoBase64);
    let logoFileInput   = $state<HTMLInputElement | null>(null);
    let logoMessage     = $state('');
    let logoMessageType = $state<'success' | 'error'>('success');

    let showErrorPopup  = $state(false);
    let validationErrors: string[] = $state([]);

    const fieldLabels: Record<string, string> = {
        raisonSociale0:    'Raison Sociale',
        adresse0:          'Adresse',
        adresseCompl0:     "Complément d'adresse",
        cp0:               'Code postal',
        ville0:            'Ville',
        nomPrenomContact0: 'Nom - Prénom du Contact',
        telFixe0:          'Tél. Fixe',
        telPortable0:      'Tél. Portable',
        urlWeb:            'Url Site Internet',
        siren0:            'N° Siren',
        temoinCgv:         'Mention C.G.V.',
        iban0:             'Numéro IBAN',
        bic0:              'BIC',
        temoinLogo:        'Témoin Logo',
        ligne10:           'Logo ligne 1',
        ligne20:           'Logo ligne 2'
    };

    // svelte-ignore state_referenced_locally
    const initialForm = data.form;
    const { form: formData, enhance, submitting, message } = superForm(initialForm, {
        id: 'identification', resetForm: false,
        onSubmit: ({ cancel }) => {
            const errs: string[] = [];
            $formData.temoinLogo = logoMode;
            const zodResult = IdentificationFormSchema.safeParse($formData);
            if (!zodResult.success) {
                for (const issue of zodResult.error.issues) {
                    const fieldName = issue.path[0]?.toString() ?? '';
                    const label     = fieldLabels[fieldName] ?? fieldName;
                    errs.push(`${label} : ${issue.message}`);
                }
            }
            if (sirenDejaSaisi) {
                if ($formData.siren0.replace(/\s+/g, '') !== data.initialSiren.replace(/\s+/g, '')) {
                    errs.push("Le N° Siren a déjà été saisi précédemment. Il ne peut être ni modifié, ni supprimé. Veuillez consulter l'assistance.");
                    $formData.siren0 = data.initialSiren;
                }
            } else {
                const sirenResult = validerSIREN($formData.siren0);
                if (!sirenResult.valid) errs.push(`N° Siren : ${sirenResult.message}`);
            }
            if (errs.length > 0) { validationErrors = errs; showErrorPopup = true; cancel(); }
        },
        onResult: ({ result }: { result: ActionResult }) => { if (result.type === 'success') { /* géré par $message */ } }
    });

    $effect(() => {
        if ($message) {
            const isError = $message.includes('Siren') || $message.includes('SIREN') || $message.includes('Abonné') || $message.includes('assistance');
            if (isError) { validationErrors = [$message]; showErrorPopup = true; $message = ''; }
            else { const timeout = setTimeout(() => { $message = ''; }, 3000); return () => clearTimeout(timeout); }
        }
    });
    $effect(() => { if (logoMessage) { const t = setTimeout(() => { logoMessage = ''; }, 3000); return () => clearTimeout(t); } });

    function triggerFileInput() { logoFileInput?.click(); }
    async function handleLogoUpload() {
        const file = logoFileInput?.files?.[0];
        if (!file) return;
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) { logoMessage = 'Format non supporté. Utilisez JPG, JPEG ou PNG.'; logoMessageType = 'error'; return; }
        if (file.size > 500 * 1024) { logoMessage = 'Le fichier est trop volumineux (max 500 Ko).'; logoMessageType = 'error'; return; }
        const reader = new FileReader();
        reader.onload = (e) => { logoPreview = e.target?.result as string; };
        reader.readAsDataURL(file);
        const formDataUpload = new FormData();
        formDataUpload.append('logoFile', file);
        try {
            const response = await fetch('?/uploadLogo', { method: 'POST', body: formDataUpload });
            const result = await response.json();
            if (result.type === 'success') { logoMessage = 'Logo mis à jour avec succès.'; logoMessageType = 'success'; logoMode = 1; $formData.temoinLogo = 1; }
            else { const errorData = result.data; logoMessage = errorData?.logoError ?? "Erreur lors de l'upload."; logoMessageType = 'error'; }
        } catch { logoMessage = "Erreur réseau lors de l'upload."; logoMessageType = 'error'; }
    }
    function handleOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget) showErrorPopup = false; }
</script>

{#if showWelcomeModal && data.welcome}
    <div class="popup-overlay" transition:fade={{ duration: 150 }}>
        <div class="welcome-modal" transition:fly={{ y: -30, duration: 250 }}>
            <div class="welcome-icon">🎉</div>
            <h3 class="welcome-title">Bienvenue dans l'application Cinqenun !</h3>
            <p class="welcome-text">Votre adresse email a été confirmée avec succès.</p>
            <p class="welcome-text"><strong>E-mail de connexion :</strong> {data.welcome.email}</p>
            <p class="welcome-text">Vous bénéficiez d'un essai gratuit de 30 jours.</p>
            <p class="welcome-text">Veuillez compléter votre inscription en remplissant les données ci-dessous.</p>
            <div class="welcome-footer">
                <button class="welcome-btn" onclick={() => (showWelcomeModal = false)}>Commencer</button>
            </div>
        </div>
    </div>
{/if}

{#if showErrorPopup}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="popup-overlay" onclick={handleOverlayClick} transition:fade={{ duration: 150 }}>
        <div class="popup-erreurs" transition:fly={{ y: -30, duration: 250 }}>
            <button class="popup-close" onclick={() => (showErrorPopup = false)} aria-label="Fermer">✕</button>
            <div class="popup-header">
                <span class="popup-icon">⚠</span>
                <h3 class="popup-title">Erreurs de saisie</h3>
            </div>
            <div class="popup-body">
                {#each validationErrors as errMsg, i (i)}
                    <p class="popup-error-item">• {errMsg}</p>
                {/each}
            </div>
            <div class="popup-footer">
                <button class="popup-btn" onclick={() => (showErrorPopup = false)}>Corriger</button>
            </div>
        </div>
    </div>
{/if}

{#if mounted}
    <div class="identification-page">
        <h3 class="page-title">Mon Compte : mes Données d'Identification</h3>
        {#if $message}
            <div class="alert-success" transition:fade={{ duration: 300 }}>{$message}</div>
        {/if}
        <form method="POST" action="?/update" use:enhance class="form-grid" in:fade="{{ duration: 1500 }}">
            <div class="col-gauche">
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Informations Personnelles</legend>
                    <div class="sg-row">
                        <span class="sg-asterix">*</span>
                        <div class="sg-field sg-w-full">
                            <input id="raisonSociale0" name="raisonSociale0" type="text" class="sg-input" placeholder=" " bind:value={$formData.raisonSociale0}>
                            <label for="raisonSociale0" class="sg-label">Raison Sociale</label>
                        </div>
                    </div>
                    <div class="sg-row">
                        <span class="sg-asterix">*</span>
                        <div class="sg-field" style="flex:1">
                            <input id="adresse0" name="adresse0" type="text" class="sg-input" placeholder=" " bind:value={$formData.adresse0}>
                            <label for="adresse0" class="sg-label">Adresse</label>
                        </div>
                        <div class="sg-field" style="flex:0.8">
                            <input id="adresseCompl0" name="adresseCompl0" type="text" class="sg-input" placeholder=" " bind:value={$formData.adresseCompl0}>
                            <label for="adresseCompl0" class="sg-label">Complément Adresse</label>
                        </div>
                    </div>
                    <div class="sg-row">
                        <span class="sg-asterix">*</span>
                        <div class="sg-field" style="width:90px">
                            <input id="cp0" name="cp0" type="text" class="sg-input sg-center" placeholder=" " bind:value={$formData.cp0}>
                            <label for="cp0" class="sg-label">Code postal</label>
                        </div>
                        <span class="sg-asterix">*</span>
                        <div class="sg-field" style="flex:1">
                            <input id="ville0" name="ville0" type="text" class="sg-input" placeholder=" " bind:value={$formData.ville0}>
                            <label for="ville0" class="sg-label">Ville</label>
                        </div>
                    </div>
                </fieldset>
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Logo apposé sur les Devis/Facture</legend>
                    <div class="logo-radio-row">
                        <span class="logo-radio-label">Logo :</span>
                        <label class="logo-radio"><input type="radio" name="logoModeRadio" value={0} bind:group={logoMode}> Format Texte</label>
                        <label class="logo-radio"><input type="radio" name="logoModeRadio" value={1} bind:group={logoMode}> Format Image</label>
                    </div>
                    {#if logoMessage}
                        <div class="logo-message" class:logo-msg-success={logoMessageType === 'success'} class:logo-msg-error={logoMessageType === 'error'} transition:fade={{ duration: 300 }}>{logoMessage}</div>
                    {/if}
                    {#if logoMode === 0}
                        <div class="logo-texte-zone" transition:fade={{ duration: 600 }}>
                            <div class="sg-row"><div class="sg-field sg-w-full">
                                <input id="ligne10" name="ligne10" type="text" class="sg-input" placeholder=" " bind:value={$formData.ligne10}>
                                <label for="ligne10" class="sg-label">ligne 1</label>
                            </div></div>
                            <div class="sg-row"><div class="sg-field sg-w-full">
                                <input id="ligne20" name="ligne20" type="text" class="sg-input" placeholder=" " bind:value={$formData.ligne20}>
                                <label for="ligne20" class="sg-label">ligne 2</label>
                            </div></div>
                        </div>
                    {/if}
                    {#if logoMode === 1}
                        <div class="logo-image-zone" transition:fade={{ duration: 200 }}>
                            <div class="logo-apercu">
                                {#if logoPreview}<img src={logoPreview} alt="Logo" class="logo-img">
                                {:else}<span class="logo-apercu-vide">Emplacement pour le logo</span>{/if}
                            </div>
                            <div class="logo-actions">
                                <button type="button" class="btn-logo-select" onclick={triggerFileInput}>Sélectionnez votre Logo</button>
                                <input bind:this={logoFileInput} type="file" accept=".jpg,.jpeg,.png" style="display:none" onchange={handleLogoUpload}>
                                <span class="logo-contraintes">JPG ou PNG — 500 Ko max (redimensionné auto. si &gt; 600×160 px)</span>
                            </div>
                        </div>
                    {/if}
                </fieldset>
            </div>
            <div class="col-droite">
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Communication</legend>
                    <div class="sg-row">
                        <span class="sg-asterix" style="color:white">*</span>
                        <div class="sg-field sg-w-full">
                            <input id="nomPrenomContact0" name="nomPrenomContact0" type="text" class="sg-input" placeholder=" " bind:value={$formData.nomPrenomContact0}>
                            <label for="nomPrenomContact0" class="sg-label">Nom - Prénom du Contact</label>
                        </div>
                    </div>
                    <div class="sg-row">
                        <span class="sg-asterix" style="color:white">*</span>
                        <div class="sg-field" style="flex:1">
                            <input id="telFixe0" name="telFixe0" type="text" class="sg-input" placeholder=" " maxlength="14" bind:value={$formData.telFixe0}>
                            <label for="telFixe0" class="sg-label">☎ Tel. Fixe</label>
                        </div>
                        <div class="sg-field" style="flex:1">
                            <input id="telPortable0" name="telPortable0" type="text" class="sg-input" placeholder=" " maxlength="14" bind:value={$formData.telPortable0}>
                            <label for="telPortable0" class="sg-label">☎ Tel. Portable</label>
                        </div>
                    </div>
                    <div class="sg-row">
                        <span class="sg-asterix" style="color:white">*</span>
                        <div class="sg-field sg-w-full">
                            <input id="urlWeb" name="urlWeb" type="text" class="sg-input" placeholder=" " maxlength="40" bind:value={$formData.urlWeb}>
                            <label for="urlWeb" class="sg-label">Url Site Internet</label>
                        </div>
                    </div>
                    <div class="sg-row">
                        <span class="sg-asterix">*</span>
                        <div class="sg-field" style="width:160px">
                            <input id="siren0" name="siren0" type="text" class="sg-input{sirenDejaSaisi ? ' input-locked' : ''}" placeholder=" " maxlength="11" readonly={sirenDejaSaisi}
                                    title={sirenDejaSaisi ? 'SIREN déjà enregistré — modification impossible' : ''} bind:value={$formData.siren0}>
                            <label for="siren0" class="sg-label">N° Siren</label>
                            {#if sirenDejaSaisi}<span class="lock-icon" title="Verrouillé">🔒</span>{/if}
                        </div>
                    </div>
                    <div class="sg-row sg-row-checkbox">
                        <span class="sg-asterix" style="color:white">*&nbsp;</span>
                        <span>Mention C.G.V. (imprimé sur Devis/Facture)&nbsp;</span>
                        <input id="temoinCgv" name="temoinCgv" type="checkbox" bind:checked={$formData.temoinCgv}>
                    </div>
                </fieldset>
                <fieldset class="sg-fieldset">
                    <legend class="sg-legende">Coordonnées Bancaires</legend>
                    <div class="sg-row">
                        <div class="sg-field" style="flex:2">
                            <input id="iban0" name="iban0" type="text" class="sg-input" placeholder=" " maxlength="33" bind:value={$formData.iban0}>
                            <label for="iban0" class="sg-label">Numéro IBAN</label>
                        </div>
                        <div class="sg-field" style="flex:1">
                            <input id="bic0" name="bic0" type="text" class="sg-input" placeholder=" " maxlength="11" bind:value={$formData.bic0}>
                            <label for="bic0" class="sg-label">BIC</label>
                        </div>
                    </div>
                </fieldset>
            </div>
            <div class="form-footer">
                <button type="submit" class="sg-button" style="font-size:12px;height:30px" disabled={$submitting}>Enregistrer mes modifications</button>
            </div>
        </form>
    </div>
{/if}

<style>
    .identification-page {
        max-width: 85%;
        margin: 0 auto;
        padding: 10px 16px 30px;
        font-family: Verdana, Geneva, Tahoma, sans-serif;
        font-size: 13px;
        color: #333;
    }
    .page-title {
        text-align: center;
        font-size: 15px;
        font-weight: bold;
        color: #444;
        margin: 8px 0 30px;
    }
    .alert-success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
        border-radius: 4px;
        padding: 8px 14px;
        text-align: center;
        margin-bottom: 12px;
        font-size: 13px;
    }
    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px 20px;
        align-items: start;
    }
    .col-gauche, .col-droite {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    /* LOGO ================================= */
    .logo-radio-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 10px;
        font-size: 12px;
    }
    .logo-radio-label {
        font-weight: bold;
        color: #555;
    }
    .logo-radio {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        color: #444;
    }
    .logo-radio input[type="radio"] {
        accent-color: #78a7db;
    }
    .logo-message {
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        margin-bottom: 8px;
        text-align: center;
    }
    .logo-msg-success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }
    .logo-msg-error {
        background: #fdf0ed;
        color: #c0392b;
        border: 1px solid #f5c6cb;
    }
    .logo-texte-zone {
        padding-top: 4px;
        width: 50%;
    }
    .logo-image-zone {
        display: flex;
        align-items: center;
        gap: 16px;
        padding-top: 4px;
    }
    .logo-apercu {
        min-width: 200px;
        min-height: 70px;
        max-width: 260px;
        border: 1.5px solid #78a7db;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6px;
        background: #fff;
    }
    .logo-img {
        max-width: 100%;
        max-height: 80px;
        object-fit: contain;
    }
    .logo-apercu-vide {
        color: #999;
        font-style: italic;
        font-size: 12px;
        padding: 8px;
    }
    .logo-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .btn-logo-select {
        background: #78a7db;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 8px 18px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.2s;
        white-space: nowrap;
    }
    .btn-logo-select:hover {
        background: #5b8fbf;
    }
    .logo-contraintes {
        font-size: 10px;
        color: #999;
        font-style: italic;
        text-align: center;
    }
    /* POP-UP DE BIENVENUE ======================== */
    .welcome-modal {
        background: #fff;
        border-left: 5px solid #27ae60;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        padding: 28px 32px;
        min-width: 380px;
        max-width: 500px;
        text-align: center;
    }
    .welcome-icon {
        font-size: 2.5rem;
        margin-bottom: 8px;
    }
    .welcome-title {
        margin: 0 0 14px;
        font-size: 1.15rem;
        color: #27ae60;
    }
    .welcome-text {
        margin: 6px 0;
        font-size: 13px;
        color: #444;
        line-height: 1.5;
    }
    .welcome-footer {
        margin-top: 18px;
    }
    .welcome-btn {
        background: #27ae60;
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 9px 32px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
    }
    .welcome-btn:hover {
        background: #219a52;
    }
    .popup-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.25);
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding-top: 80px;
        z-index: 9999;
    }
    .popup-erreurs {
        position: relative;
        background: #fff;
        border-left: 5px solid #e74c3c;
        border-radius: 8px;
        box-shadow: rgba(0, 0, 0, 0.25) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px;
        padding: 20px 28px;
        min-width: 360px;
        max-width: 600px;
        max-height: 70vh;
        overflow-y: auto;
    }
    .popup-close {
        position: absolute;
        top: 8px; right: 12px;
        background: none;
        border: none;
        font-size: 1.2rem;
        color: #999;
        cursor: pointer;
    }
    .popup-close:hover {
        color: #e74c3c;
    }
    .popup-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
    }
    .popup-icon {
        font-size: 1.6rem;
        color: #e74c3c;
    }
    .popup-title {
        margin: 0;
        font-size: 1.1rem;
        color: #c0392b;
    }
    .popup-body {
        margin-bottom: 16px;
    }
    .popup-error-item {
        margin: 6px 0;
        padding: 6px 10px;
        background: #fdf0ed;
        border-radius: 4px;
        font-size: 0.9rem;
        color: #333;
    }
    .popup-footer {
        text-align: right;
    }
    .popup-btn {
        background: #e74c3c;
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 8px 24px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .popup-btn:hover {
        background: #c0392b;
    }
    .input-locked {
        background: #f0f0f0 !important;
        color: #666 !important;
        cursor: not-allowed !important;
        border-color: #ccc !important;
    }
    .input-locked:focus {
        border-color: #ccc !important;
        box-shadow: none !important;
    }
    .lock-icon {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 14px;
        pointer-events: none;
    }
</style>