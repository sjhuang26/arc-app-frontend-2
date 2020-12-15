<script lang="ts">
import { rootWidget } from "./core/widget"
import { DomWidget, forceRefreshAllResources } from "./core/shared"
import { onMount } from 'svelte';
import EmbedDom from "./EmbedDom.svelte";

let isLoaded = false
let container: HTMLElement

</script>

{#await forceRefreshAllResources()}
<div style="display: flex;align-items: center;justify-content: center;flex-direction: column;">
  <div class="top-ui-card" style="padding: 2rem; display: flex;align-items: center;justify-content: center;flex-direction: column;">
  <p class="lead">ARC App</p>
  <div class="spinner-border" style="width: 8rem; height: 8rem" role="status">
    <span class="sr-only">Loading...</span>
  </div>
  </div>
  </div>
{:then}
<EmbedDom dom={rootWidget().dom[0]}/>
{/await}
