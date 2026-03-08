import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const sa = JSON.parse(readFileSync('/tmp/sa_clean.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
admin.auth()
  .setCustomUserClaims('3NaI798Lcahia7fuDuDTzj2hF', { role: 'super_admin', tenantId: 'bizosto' })
  .then(() => { console.log('✅ Claims set!'); process.exit(0); })
  .catch(e => { console.error('❌', e.message); process.exit(1); });
