const functions = require('firebase-functions');
const admin = require('firebase-admin');
const uniqid = require('uniqid');
admin.initializeApp();
const db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
//
exports.sendPushNotification = functions.https.onRequest((request, response) => {
    let toPhones = request.body.to;
    let from = request.body.from;
    let comment = request.body.comment;
    let highfiveId = request.body.highfiveId;
    let id = uniqid();

    let toSaveReceivingPhones = [];
    let data = {sender: from, comment: comment, highfiveId: highfiveId, timestamp: String(Date.now()), id: id};
    Promise.all(toPhones.map(phone => {
        return db.collection('users').doc(phone).get()
            .then(document => {
                let documentData = document.data();
                if (!documentData) {
                    console.warn("Found an empty document - skip.")
                    return;
                }
                let tokens = documentData.tokens;
                const message = {
                    data: data,
                    notification: {
                        title: "Вам дали пятюню!",
                        body: "Коснитесь уведомления, чтобы увидеть детали."
                    },
                    tokens: tokens,
                }

                let batchResponsePromise = Promise.resolve();
                try {
                    batchResponsePromise = admin.messaging().sendMulticast(message);
                } catch (e) {
                    console.error(new Error(e.toString()))
                    return Promise.resolve();
                }
                return batchResponsePromise
                    .then((response) => {
                        if (response.failureCount > 0) {
                            const failedTokens = [];
                            response.responses.forEach((resp, idx) => {
                                if (!resp.success) {
                                    console.error(resp.error)
                                    failedTokens.push(tokens[idx])
                                    tokens = tokens.splice(idx, 0)
                                }
                            });
                            if (failedTokens.length > 0) {
                                console.log('List of tokens that caused failures: ' + failedTokens);
                                db.collection('users').doc(document.id).update({
                                    tokens: tokens
                                }).then();
                            }

                        }
                        if (response.failureCount < tokens.length) {
                            toSaveReceivingPhones.push(phone);
                        }
                    });
            });
    }))
        .catch(reason => console.error(new Error(reason.toString())))
        .then(result => {
            console.warn('Phones that receive a notification ' + toSaveReceivingPhones);
            if (toSaveReceivingPhones.length > 0) {
                data.to = toSaveReceivingPhones;
                data.id = null;
                db.collection('highfives')
                    .doc(id)
                    .set(data)
                    .then();
            }
        });

    response.status(200);
    response.json({status: 'done'})
});

