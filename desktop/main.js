/* FlowLab — versione desktop (Windows e macOS) */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';

function createWindow(){
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'FlowLab',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'icone', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  /* i link esterni si aprono nel browser */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if(/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  /* modifiche non salvate: chiede conferma prima di chiudere */
  win.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Esci senza salvare', 'Annulla'],
      defaultId: 1,
      cancelId: 1,
      title: 'FlowLab',
      message: 'Ci sono modifiche non salvate.',
      detail: 'Vuoi chiudere FlowLab comunque?'
    });
    if(choice === 0) event.preventDefault();
  });
}

const template = [
  ...(isMac ? [{ role: 'appMenu', label: 'FlowLab' }] : []),
  { label: 'Modifica', submenu: [
    { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
    { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' }, { role: 'selectAll', label: 'Seleziona tutto' }
  ]},
  { label: 'Vista', submenu: [
    { role: 'reload', label: 'Ricarica' }, { type: 'separator' },
    { role: 'resetZoom', label: 'Dimensione reale' }, { role: 'zoomIn', label: 'Ingrandisci' }, { role: 'zoomOut', label: 'Riduci' },
    { type: 'separator' }, { role: 'togglefullscreen', label: 'Schermo intero' }
  ]},
  { role: 'windowMenu', label: 'Finestra' },
  { label: 'Aiuto', submenu: [
    { label: 'Sito di FlowLab', click: () => shell.openExternal('https://github.com/RosarioMarra/FlowLab') }
  ]}
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => { if(BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if(!isMac) app.quit(); });
