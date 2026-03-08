require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
let raw = process.env.FIREBASE_ADMIN_KEY || '';
// Handle both escaped and literal newlines in private key
raw = raw.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
// Fix control characters in private key
const serviceAccount = JSON.parse(raw.replace(/\r/g, ''));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
admin.auth().setCustomUserClaims('3NaI798Lcahia7fuDuDTzj2hF', { role: 'super_admin', tenantId: 'bizosto' })
  .then(() => { console.log('Done! Claims set.'); process.exit(0); })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });
