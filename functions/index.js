const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

admin.initializeApp();

exports.createUserByAdmin = functions.https.onCall(async (data, context) => {
  // Only admin can create users
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Not logged in");
  }

  const uid = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(uid).get();

  if (!userDoc.exists || userDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admins only");
  }

  const { email, password, role, name } = data;

  if (!email || !password || !role) {
    throw new functions.https.HttpsError("invalid-argument", "Missing fields");
  }

  // create Firebase Auth user
  const newUser = await admin.auth().createUser({
    email,
    password,
    displayName: name || "",
  });

  // create Firestore user doc
  await admin.firestore().collection("users").doc(newUser.uid).set({
    name: name || "",
    email,
    role,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { uid: newUser.uid, message: "User created successfully" };
});

exports.pollEmailInboxes = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  const mailboxesSnap = await admin
    .firestore()
    .collection("userMailboxes")
    .where("enabled", "==", true)
    .get();

  for (const mailboxDoc of mailboxesSnap.docs) {
    const mailbox = mailboxDoc.data() || {};
    const tenantId = mailbox.tenantId || "";
    const emailAccountId = mailbox.emailAccountId || "";
    if (!emailAccountId) continue;

    const accountSnap = await admin.firestore().collection("emailAccounts").doc(emailAccountId).get();
    if (!accountSnap.exists) continue;
    const account = accountSnap.data() || {};
    if (!account.enabled) continue;

    const client = new ImapFlow({
      host: account.imapHost,
      port: Number(account.imapPort || 993),
      secure: Boolean(account.imapSecure),
      auth: {
        user: account.username,
        pass: account.passwordEncrypted,
      },
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const lastUid = Number(mailbox.lastUid || 0);
        const range = lastUid ? `${lastUid + 1}:*` : "1:*";
        for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true })) {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.map((v) => v.address) || [];
          const to = parsed.to?.value?.map((v) => v.address) || [];
          const cc = parsed.cc?.value?.map((v) => v.address) || [];
          const subject = parsed.subject || "(no subject)";
          const bodyText = parsed.text || "";
          const bodyHtml = parsed.html || null;
          let leadId = null;
          if (from.length) {
            const leadSnap = await admin
              .firestore()
              .collection("leads")
              .where("tenantId", "==", tenantId)
              .where("contactEmail", "==", from[0])
              .limit(1)
              .get();
            if (!leadSnap.empty) {
              leadId = leadSnap.docs[0].id;
            }
          }
          const threadKey = `${subject.toLowerCase().replace(/^re:\s*/i, "").trim()}::${[...from, ...to]
            .map((a) => a.toLowerCase())
            .sort()
            .join("|")}`;

          const emailRef = admin.firestore().collection("emails").doc();
          await emailRef.set({
            id: emailRef.id,
            tenantId,
            mailboxUserId: mailbox.userId || "",
            emailAccountId,
            direction: "inbound",
            messageId: parsed.messageId || null,
            threadKey,
            subject,
            from,
            to,
            cc,
            bodyText,
            bodyHtml,
            leadId,
            clientId: null,
            status: "received",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
          });

          if (mailbox.userId) {
            const notificationRef = admin.firestore().collection("notifications").doc();
            await notificationRef.set({
              id: notificationRef.id,
              toUserId: mailbox.userId,
              title: "New email received",
              body: `New email from ${from[0] || "unknown"}: ${subject}`,
              type: "info",
              entityType: "email",
              entityId: emailRef.id,
              deepLink: "/sales/inbox",
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          if (msg.uid && msg.uid > lastUid) {
            mailboxDoc.ref.set({ lastUid: msg.uid }, { merge: true });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error("IMAP poll error:", err);
    } finally {
      await client.logout().catch(() => null);
    }
  }
});
