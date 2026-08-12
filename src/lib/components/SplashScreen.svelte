<script lang="ts">
    import { onMount } from 'svelte';
    onMount(() => {
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) splash.remove();
        }, 200);
    });
</script>

<span></span>