/* Firma "ad-hoc" dell'app macOS: senza firma l'app non si avvia sui Mac con chip Apple */
const { execSync } = require('child_process');
const path = require('path');
exports.default = async function(context){
  if(context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  execSync('codesign --force --deep --sign - "' + app + '"', { stdio:'inherit' });
};
