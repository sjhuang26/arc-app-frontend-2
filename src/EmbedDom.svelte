<script lang="ts">
import { onMount } from "svelte";

export let dom: HTMLElement

let container: HTMLElement

    onMount(() => {
        container.replaceWith(dom)
    })
</script>

<div bind:this={container}></div>
