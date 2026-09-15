/* ════════════════════════════════════════════════════════════════
   DEEP LINKS — which URL opens which screen.
   ════════════════════════════════════════════════════════════════
   The app had no linking config, so simplicity://clients (or any link a
   notification, an email or the web app could hand over) opened on
   whatever screen was last shown. Paths are web's ROUTES, without the
   leading slash, so one address means one place in both apps — the test
   holds them to that.

   `simplicity://` is registered by app.json's scheme. The https prefix is
   listed so a verified app link works the day one is set up (that needs
   intent filters and a hosted assetlinks/apple-app-site-association, which
   this does not add); until then the browser keeps those URLs.
   ════════════════════════════════════════════════════════════════ */
export const linking = {
  prefixes: ['simplicity://', 'https://simplicity-os.com'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: '',
          Clients: 'clients',
          Tasks: 'tasks',
          Finance: 'finance',
        },
      },
      Goals: 'goals',
      Leads: 'leads',
      Calendar: 'calendar',
      Moon: 'moon',
      Settings: 'settings',
      Trash: 'trash',
      Projects: 'projects',
      ProjectDetail: 'projects/:projectId',
      Reports: 'reports',
      Insights: 'insights',
      Pages: 'pages',
      Connections: 'connections',
      Help: 'help',
      Admin: 'admin',
    },
  },
}
