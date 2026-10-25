const fs = require('fs'), path = require('path'), vm = require('vm');
const out = [];
for (const f of ['project.js', 'panel.js', 'i18n.js', 'render.js', 'interaction.js', 'workload.js', 'routines.js', 'state.js', 'storage.js', 'fsys.js', 'diary.js', 'main.js', 'export.js', 'actions.js', 'contextmenu.js', 'touch.js', 'views.js', 'cloud-pcloud.js', 'i18n-de2.js']) {
  try { new vm.Script(fs.readFileSync(path.join(process.argv[2], 'js', f), 'utf8'), { filename: f }); out.push(f + ' ok'); }
  catch (e) { out.push(f + ' ' + e.message); }
}
fs.writeFileSync(process.argv[3], out.join('\n'));
