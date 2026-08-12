<script>
    let { children } = $props();
</script>

<div class="container">
    <div class="content-card">{@render children()}</div>
</div>

<style>
    .container {
        flex: 1;
        display: flex;
        padding: 10px;
        margin-left: 58px; /* ← ajouter pour compenser la sidebar fixe */
        background: #f4f7f6;
        overflow: auto;
        height: 100%;
        box-sizing: border-box;
        min-width: 0;
    }
    .content-card {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow:
            0 4px 6px rgba(0, 0, 0, 0.08),
            0 10px 20px rgba(0, 0, 0, 0.12),
            0 20px 40px rgba(0, 0, 0, 0.08);
        width: 100%;
        box-sizing: border-box;
        overflow: auto;
    }
    @media (max-width: 900px) {
        .container {
            padding: 10px;
        }
        .content-card {
            padding: 15px;
        }
    }
    @media (max-width: 600px) {
        .container {
            padding: 5px;
        }
        .content-card {
            padding: 10px;
            border-radius: 4px;
        }
    }
</style>