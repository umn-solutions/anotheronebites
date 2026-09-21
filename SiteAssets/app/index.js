import {
	pageReset,
	Router,
	resolvePath,
	StyleResource,
	NavigationEvent,
	Image,
} from "./libs/nofbiz/nofbiz.base.js";
import { initAppState } from './utils/app-state.js';
import { initAppHeader, updateAppHeader } from './utils/app-header.js';

pageReset({
	themePath: resolvePath("@/libs/nofbiz/nofbiz.base.css"),
	clearConsole: false,
});

new StyleResource("@/css/app.css");

await initAppState();

// Mount the global app header above the Router outlet.
// initAppHeader() prepends a #app-header-mount div before #root and renders
// the initial header state. The NavigationEvent listener below keeps it in
// sync on every route transition.
initAppHeader();

new Router(["projects/new", "projects/detail", "programs/new", "programs/detail", "proposals/new", "proposals/detail", "admin"]);

// Render the background image once at startup. render() appends an <img>
// element to #root and is NOT idempotent — calling it on every navigation
// would accumulate duplicate elements.
const BACKGROUND = new Image('../SiteAssets/media/bg.jpg',{containerSelector:'#root',class:'background-img'})
BACKGROUND.render()

NavigationEvent.listener(async(e)=>{
	// Re-render the header with the new route. The event's `to` property
	// carries the destination path (e.g. "projects/detail", "/").
	updateAppHeader(e?.to ?? Router.location)
})
