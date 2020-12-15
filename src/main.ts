// Not sure why there are errors
// @ts-nocheck

import App from './App.svelte';

window.APP_DEBUG_MOCK = 1

const app = new App({
	target: document.body,
	props: {
	}
});

export default app;
