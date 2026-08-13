/* Entry point. Adding a view = create js/views/<name>.js exporting the view
   contract (see core/registry.js), then import + register it here — no
   bundler, so no file globbing; this import list is the one manual step. */
import {registerView,startRegistry} from './core/registry.js?v=20260813-timeline2';
import {initServerWidget} from './core/server-widget.js';
import {dashboardView,graphView,timeView} from './views/atlas.js?v=20260813-wikisetup1';
import sessionsView from './views/sessions.js?v=20260725-sessions2';
import projectsView from './views/projects.js';
/* Chat is deliberately hidden from the tab bar: re-import ./views/chat.js
   and register it below to bring the tab back. */
import wikiView from './views/wiki.js?v=20260813-update1';
import quirqView from './views/quirq.js?v=20260725-quirq3';
import secretsView from './views/secrets.js?v=20260813-update1';

/* app-shell bulkhead: a fatal script error logs instead of white-screening */
addEventListener('error',e=>console.error('Space shell error:',e.error||e.message));
addEventListener('unhandledrejection',e=>console.error('Space unhandled rejection:',e.reason));

try{
  registerView(dashboardView);
  registerView(graphView);
  registerView(timeView);
  registerView(sessionsView);
  registerView(projectsView);
  registerView(wikiView);
  registerView(quirqView);
  registerView(secretsView);
  startRegistry({defaultView:'dashboard'});
}catch(err){console.error('Space registry failed to start:',err);}

try{initServerWidget();}catch(err){console.error('Server widget failed to start:',err);}
