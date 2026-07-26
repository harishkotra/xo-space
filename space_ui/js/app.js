/* Entry point. Adding a view = create js/views/<name>.js exporting the view
   contract (see core/registry.js), then import + register it here — no
   bundler, so no file globbing; this import list is the one manual step. */
import {registerView,startRegistry} from './core/registry.js?v=20260725-quirq1';
import {initServerWidget} from './core/server-widget.js';
import {dashboardView,graphView,timeView,sixView} from './views/atlas.js?v=20260726-environments1';
import sessionsView from './views/sessions.js?v=20260725-sessions2';
import projectsView from './views/projects.js';
import chatView from './views/chat.js';
import wikiView from './views/wiki.js?v=20260726-environments1';
import quirqView from './views/quirq.js?v=20260725-quirq3';
import secretsView from './views/secrets.js?v=20260725-roots1';

/* app-shell bulkhead: a fatal script error logs instead of white-screening */
addEventListener('error',e=>console.error('Space shell error:',e.error||e.message));
addEventListener('unhandledrejection',e=>console.error('Space unhandled rejection:',e.reason));

try{
  registerView(dashboardView);
  registerView(graphView);
  registerView(timeView);
  registerView(sixView);
  registerView(sessionsView);
  registerView(projectsView);
  registerView(chatView);
  registerView(wikiView);
  registerView(quirqView);
  registerView(secretsView);
  startRegistry({defaultView:'dashboard'});
}catch(err){console.error('Space registry failed to start:',err);}

try{initServerWidget();}catch(err){console.error('Server widget failed to start:',err);}
