import {
	pageReset,
	Router,
	resolvePath,
	StyleResource,
	NavigationEvent,
	Image,
} from "./libs/nofbiz/nofbiz.base.js";
import { initAppState } from './utils/app-state.js';

pageReset({
	themePath: resolvePath("@/libs/nofbiz/nofbiz.base.css"),
	clearConsole: false,
});

new StyleResource("@/css/app.css");

await initAppState();

new Router(["projects/new", "projects/detail", "programs/new", "programs/detail", "proposals/new", "proposals/detail", "admin"]);

const BACKGROUND = new Image('../SiteAssets/media/bg.jpg',{containerSelector:'#root',class:'background-img'})
NavigationEvent.listener(async()=>{
	BACKGROUND.render()
})