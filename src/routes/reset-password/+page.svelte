<script lang="ts">
    import AuthForm from '$lib/components/AuthForm.svelte';

    let { data } = $props();
</script>

<AuthForm mode="reset" {data} />