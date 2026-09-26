<script lang="ts">
    import '../app.css';
    import DrawerInfo from '$lib/components/DrawerInfo.svelte';

    let { children } = $props();
</script>

<DrawerInfo />
<main>
    {@render children()}
</main>