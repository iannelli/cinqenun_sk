<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { superForm } from 'sveltekit-superforms';
    import { zod4Client } from 'sveltekit-superforms/adapters';
    import { LoginFormSchema } from '$lib/schemas/login';
    import { RegisterFormSchema } from '$lib/schemas/register';
    import { ResetPasswordSchema } from '$lib/schemas/reset-password';
    import { fly } from 'svelte/transition';

    let mounted = $state(false);
    onMount(() => {
        mounted = true;
        document.getElementById('startup-message')?.remove();
    });
    let { mode = 'login', data } = $props();
    // svelte-ignore state_referenced_locally
    const schema = mode === 'reset'
        ? ResetPasswordSchema
        : mode === 'register'
            ? RegisterFormSchema
            : LoginFormSchema;
    // svelte-ignore state_referenced_locally
    const { form, errors, message, enhance, submitting, submit } = superForm(data.form, {
        validators: zod4Client(schema),
        resetForm: false,
    });
    // ─── Copie des identifiants (mode register) ─────────────────
    let copied = $state(false);
    async function copyCredentials() {
        const email = $form.email || '';
        const password = $form.password || '';
        if (!email && !password) return;
        const text = [
            'Vos identifiants Cinqenun :',
            `E-mail : ${email}`,
            `Mot de passe : ${password}`,
        ].join('\n');
        await navigator.clipboard.writeText(text);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }
    // ─── Validation par Enter ───────────────────────────────────
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    }
    // ─── Mot de passe oublié ────────────────────────────────────
    let forgotSubmitting = $state(false);
    let forgotMode = $state(false);
    // ─── Titre dynamique ────────────────────────────────────────
    const title = $derived(
        mode === 'reset'
            ? 'Nouveau mot de passe'
            : forgotMode
                ? 'Mot de passe oublié'
                : mode === 'register'
                    ? 'Créer mon compte'
                    : 'Connexion'
    );
    // ─── Succès reset (pour afficher le lien connexion) ─────────
    const resetSuccess = $derived(mode === 'reset' && $message?.includes('succès'));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="main">
    {#if mounted}
        <div class="card" transition:fly={{y:-250, duration:2000}}>
            <div class="banniere">
                <p><span style="position:relative;left:40px;font-weight:bold">Identification</span><span style="margin-left:200px;font-weight:bold">ERP Cinqenun</span></p>
                <div class="logoPosition"><img src="/network.png" alt=""/></div>
            </div>
            <h2>{title}</h2>
            {#if $message}
                <div class="message-box" class:message-success={!$message.includes('échoué') && !$message.includes('incorrect') && !$message.includes('Veuillez') && !$message.includes('Aucun') && !$message.includes('provisoire') && !$message.includes('expiré') && !$message.includes('invalide')}>{$message}</div>
            {/if}
            {#if resetSuccess}
                <!-- Après succès du reset, afficher uniquement le lien connexion -->
                <div class="actions">
                    <div class="divBouton">
                        <a href={resolve('/login')} class="sg-button" style="width:120px;height:30px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;">Se connecter</a>
                    </div>
                </div>
            {:else}
                <form method="POST" use:enhance >
                    <!-- ══════ MODE LOGIN & REGISTER : champ email ══════ -->
                    {#if mode !== 'reset'}
                        <div class="sg-row">
                            <div class="sg-field sg-w-full">
                                <input id="email" name="email" type="email" bind:value={$form.email} placeholder=" " class="sg-input" style="width:300px"/>
                                <label for="email" class="sg-label"><span style="font-size:12px;">&#x2709;</span> Adresse courriel</label>
                            </div>
                            <div>
                                {#if $errors.email}
                                    <span class="field-error">{$errors.email}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <!-- ══════ MODE REGISTER : confirmation email ══════ -->
                    {#if mode === 'register'}
                        <div class="sg-row">
                            <div class="sg-field sg-w-full">
                                <input id="emailConfirm" name="emailConfirm" type="email" bind:value={$form.emailConfirm} placeholder=" " class="sg-input" style="width:300px"/>
                                <label for="emailConfirm" class="sg-label"><span style="font-size:12px;">&#x2709;</span> Confirme Adresse courriel</label>
                            </div>
                            <div>
                                {#if $errors.emailConfirm}
                                    <span class="field-error">{$errors.emailConfirm}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <!-- ══════ MODE RESET : mot de passe provisoire ══════ -->
                    {#if mode === 'reset'}
                        <div class="sg-row">
                            <div class="sg-field sg-w-full">
                                <input id="tempPassword" name="tempPassword" type="password" bind:value={$form.tempPassword} placeholder=" " class="sg-input" style="width:200px"/>
                                <label for="tempPassword" class="sg-label"><span>&#128274;</span> MdP provisoire</label>
                            </div>
                            <div>
                                {#if $errors.tempPassword}
                                    <span class="field-error">{$errors.tempPassword}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <!-- ══════ MODE LOGIN (hors forgot) & REGISTER : mot de passe ══════ -->
                    {#if (mode === 'login' && !forgotMode) || mode === 'register'}
                        <div class="sg-row">
                            <div class="sg-field sg-w-full">
                                <input id="password" name="password" type="password" bind:value={$form.password} placeholder=" " class="sg-input" style="width:200px"/>
                                <label for="password" class="sg-label"><span>&#128274;</span> Mot de passe</label>
                            </div>
                            <div>
                                {#if $errors.password}
                                    <span class="field-error field-error-multiline">{String($errors.password)}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <!-- ══════ MODE RESET : nouveau mot de passe ══════ -->
                    {#if mode === 'reset'}
                        <div class="sg-row">
                            <div class="sg-field sg-w-full">
                                <input id="password" name="password" type="password" bind:value={$form.password} placeholder=" " class="sg-input" style="width:200px"/>
                                <label for="password" class="sg-label"><span>&#128274;</span> Nouveau MdP</label>
                            </div>
                            <div>
                                {#if $errors.password}
                                    <span class="field-error field-error-multiline">{String($errors.password)}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <!-- ══════ MODE REGISTER & RESET : confirmation mot de passe ══════ -->
                    {#if mode === 'register' || mode === 'reset'}
                        <div class="sg-row">
                            <div class="sg-field sg-w-full">
                                <input id="passwordConfirm" name="passwordConfirm" type="password" bind:value={$form.passwordConfirm} placeholder=" " class="sg-input" style="width:200px"/>
                                <label for="passwordConfirm" class="sg-label"><span>&#128274;</span> Confirmer MdP</label>
                            </div>
                            <div>
                                {#if $errors.passwordConfirm}
                                    <span class="field-error">{$errors.passwordConfirm}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    <!-- ══════ MODE RESET : token caché ══════ -->
                    {#if mode === 'reset'}
                        <input type="hidden" name="token" value={data.token} />
                    {/if}
                    <!-- ══════ MODE LOGIN : se souvenir de moi ══════ -->
                    {#if mode === 'login' && !forgotMode}
                        <div class="form-row checkbox-row">
                            <label for="remember">Se souvenir de moi</label>
                            <input id="remember" type="checkbox" name="remember" />
                        </div>
                    {/if}
                    <!-- ══════ MODE REGISTER : rappel identifiants ══════ -->
                    {#if mode === 'register'}
                        <div class="credentials-reminder">
                            <p class="reminder-text"> ⚠ Pensez à noter vos identifiants. Ils ne vous seront plus communiqués après l'inscription.</p>
                            <button type="button" class="btn-copy" onclick={copyCredentials}>{copied ? '✓ Identifiants copiés !' : '📋 Copier mes identifiants'}</button>
                        </div>
                    {/if}
                    <hr />
                    <!-- ══════ ACTIONS ══════ -->
                    <div class="actions">
                        {#if mode === 'reset'}
                            <!-- Mode reset : Enregistrer + Retour -->
                            <div class="divBouton">
                                <button type="submit" class="sg-button" style="width:120px;height:30px" disabled={$submitting}>{$submitting ? 'En cours…' : 'Enregistrer'}</button>
                            </div>
                            <div class="divLink">
                                <a href={resolve('/login')} class="btn-link">Retour</a>
                            </div>
                        {:else if forgotMode}
                            <!-- Mode forgot : Envoyer + Retour -->
                            <div class="divBouton">
                                <button type="submit" formaction="?/forgot" formnovalidate class="sg-button" style="width:120px;height:30px" disabled={forgotSubmitting}>{forgotSubmitting ? 'Envoi…' : 'Envoyer'}</button>
                            </div>
                            <div class="divLink">
                                <button type="button" class="btn-link" onclick={() => { forgotMode = false; }}>Retour</button>
                            </div>
                        {:else}
                            <!-- Mode login / register -->
                            <div class="divBouton">
                                <button type="submit" class="sg-button" style="width:100px;height:30px"
                                    disabled={$submitting}
                                    formaction={mode === 'login' ? '?/login' : undefined}>
                                    {$submitting ? 'En cours…' : mode === 'login' ? 'Connexion' : "S'inscrire"}
                                </button>
                            </div>
                            <div class="divLink">
                                {#if mode === 'login'}
                                    <button type="button" class="btn-link" onclick={() => { forgotMode = true; }}>Mot de passe oublié</button>
                                {/if}
                                {#if mode === 'login'}
                                    <a href={resolve('/register')} class="btn-link">Créer mon compte</a>
                                {:else}
                                    <a href={resolve('/login')} class="btn-link">Retour</a>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </form>
            {/if}
        </div>
    {/if}
</div>

<style>
    :root {
        --primary-color: #4a90e2;
        --primary-hover: #357abd;
    }
    .main {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f0f4f8;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
    }
    .card {
        background: white;
        padding: 2.5rem 2rem;
        border-radius: 12px;
        box-shadow: rgba(0, 0, 0, 0.25) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px;
        width: 100%;
        max-width: 420px;
    }
    .banniere {
        background-color: rgb(155, 186, 219);
        height: 35px;
        line-height: 35px;
        color: white;
        margin-top: -20px;
        margin-bottom: 20px;
    }
    .logoPosition {
        position: relative;
        top: -85px;
        left: -25px;
        z-index: 0;
    }
    h2 {
        text-align: center;
        color: #2c2c2c;
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 2rem;
    }
    .message-box {
        margin-bottom: 1rem;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        font-size: 0.875rem;
        color: #c0392b;
        border: 1px solid #e74c3c;
        background-color: #fff5f5;
    }
    .message-success {
        color: #155724;
        border-color: #c3e6cb;
        background-color: #d4edda;
    }
    .field-error {
        display: block;
        color: #c0392b;
        font-size: 0.8rem;
        margin-top: 3px;
    }
    .field-error-multiline {
        white-space: pre-line;
        line-height: 1.5;
    }
    form {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
    }
    .form-row {
        display: grid;
        grid-template-columns: 110px 1fr;
        align-items: start;
        gap: 0.5rem 12px;
    }
    .form-row label {
        text-align: right;
        color: #555;
        font-size: 0.875rem;
        white-space: nowrap;
        padding-top: 8px;
    }
    .form-row input:not([type="checkbox"]) {
        padding: 8px 10px;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        font-size: 0.9rem;
        color: #333;
        transition: border-color 0.2s;
    }
    .form-row input:not([type="checkbox"]):focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.12);
    }
    .checkbox-row {
        grid-template-columns: 110px auto;
        align-items: center;
    }
    .checkbox-row label {
        padding-top: 0;
    }
    input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--primary-color);
        cursor: pointer;
        margin: 0;
        justify-self: start;
    }
    .credentials-reminder {
        margin-top: 0.25rem;
        padding: 0.75rem 1rem;
        background: #fffbeb;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        text-align: center;
    }
    .reminder-text {
        margin: 0 0 0.5rem;
        font-size: 0.82rem;
        font-weight: 600;
        color: #92400e;
        line-height: 1.4;
    }
    .btn-copy {
        display: inline-block;
        padding: 6px 14px;
        border: 1px solid #d97706;
        background: #fff;
        color: #92400e;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
    }
    .btn-copy:hover {
        background: #fef3c7;
    }
    .actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-top: -10px;
        flex-wrap: wrap;
    }
    .divBouton {
        margin-top: 20px;
    }
    .divLink {
        margin-top: 10px;
    }
    .divLink .btn-link {
        margin-right: 16px;
    }
    .divLink .btn-link:last-child {
        margin-right: 0;
    }
    hr {
        width: 100%;
        height: 1px;
        margin-top: 10px;
        margin-bottom: 0px;
        padding: 0;
        background-color: #1976d2;
        border: none;
    }
    .btn-link {
        background: none;
        border: none;
        color: #1976d2;
        padding: 0;
        font-size: 13px;
        font-style: italic;
        text-decoration: underline;
        cursor: pointer;
        margin-top: 10px;
    }
    .btn-link:hover {
        color: #ff3e00;
        text-decoration: none;
    }
</style>