<script>
    import Sidebar   from '$lib/components/Sidebar.svelte';
    import Container from '$lib/components/Container.svelte';
    import '../../app.css';
    let { children } = $props();
</script>

<div class="app-layout">
    <Sidebar />
    <Container>{@render children()}</Container>
</div>

<style>
    .app-layout {
        display: flex;
        height: 100vh;
        width: 100%;
        overflow: hidden;
    }
</style>