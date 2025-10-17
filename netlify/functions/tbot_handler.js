const admin = require('firebase-admin');
const fetch = require('node-fetch'); 

// ----------------------------------------------------
// TELEGRAM ውቅር (CONFIGURATION)
// ----------------------------------------------------
// Token ከ Netlify Environment Variable ይወሰዳል
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 

// የመልእክት መላኪያ ተግባር
async function sendTelegramMessage(chatId, text) {
    // Token መኖሩን ማረጋገጥ
    if (!TELEGRAM_TOKEN) {
        console.error("TELEGRAM_BOT_TOKEN is not set.");
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML' 
        })
    });
}
// ----------------------------------------------------

// 1. የ Firebase Admin SDKን ማዘጋጀት
// የEnvironment Variableን ከNetlify ላይ እንጠራለን
const serviceAccountString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS; // <--- ይህ መስመር GOOGLE_SERVICE_ACCOUNT_CREDENTIALSን ይጠራል!
let serviceAccount;

try {
    // Variable ከሌለ ወይም ባዶ ከሆነ ስህተት መመለስ
    if (!serviceAccountString) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS is not set in Netlify Environment.");
    }

    serviceAccount = JSON.parse(serviceAccountString);
} catch (e) {
    console.error("FIREBASE Variable በትክክል JSON አይደለም ወይም የለም:", e);
    // ትኩረት: እዚህ Functionን እንዘጋለን
    exports.handler = async () => {
        return { statusCode: 500, body: JSON.stringify({ message: 'የአገልጋይ ውቅር ስህተት: Firebase Key ችግር' }) };
    };
    return;
}

const FIREBASE_DATABASE_URL = `https://${serviceAccount.project_id}.firebaseio.com`;

let firebaseApp; 

// Firebase appን መጀመሪያ መጀመር
if (!admin.apps.length) {
    firebaseApp = admin.initializeApp({ 
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
    });
} else {
    firebaseApp = admin.app(); 
}

const db = admin.firestore();

// 2. የ Netlify Function መግቢያ ነጥብ (API Endpoint)
exports.handler = async (event) => {
    // ... (405 POST check)
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ message: "ዘዴው አልተፈቀደም። POST ብቻ ያስፈልጋል" }) 
        };
    }

    try {
        const data = JSON.parse(event.body); 

        // ----------------------------------------------------
        // ክፍል A: የቴሌግራም ትዕዛዞችን ማስተናገድ (Handle Telegram Commands)
        // ----------------------------------------------------
        if (data.message) {
            const messageText = data.message.text;
            const chatId = data.message.chat.id;
            const firstName = data.message.chat.first_name || 'ተጠቃሚ';

            if (messageText && messageText.startsWith('/start')) {
                // እዚህ ላይ የእርስዎን Web App URL ማካተት ይችላሉ
                const webAppUrl = "https://smartgame1.netlify.app/"; 
                
                const welcomeMessage = `ሰላም ${firstName}፣ እንኳን ደህና መጡ! ነጥብ ማስመዝገብ ለመጀመር ከታች ያለውን አዝራር ይጫኑ።`;
                
                // በተሻሻለ መልኩ አዝራር እንጨምራለን
                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: welcomeMessage,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'ጨዋታውን ጀምር', web_app: { url: webAppUrl } }]
                            ]
                        }
                    })
                });
            } 
            
            // የFirebase Connectionን መዝጋት
            await firebaseApp.delete();

            return { 
                statusCode: 200, 
                body: JSON.stringify({ success: true, message: "Telegram command processed" }) 
            };
        }


        // ----------------------------------------------------
        // ክፍል B: Web App ነጥብ ሲል (Score Submissions)
        // ----------------------------------------------------
        const { userId, score, username } = data; 

        if (!userId || score === undefined) {
            await firebaseApp.delete(); 
            return { statusCode: 400, body: JSON.stringify({ message: 'የተጠቃሚ መታወቂያ እና ነጥብ ያስፈልጋል' }) };
        }

        // Firestore ላይ የውሂብ ማስቀመጫ መንገድ
        const userRef = db.collection('users').doc(String(userId));
        
        const doc = await userRef.get();
        let currentScore = 0;

        if (doc.exists) {
            currentScore = doc.data().score || 0;
        }

        const newScore = currentScore + score;

        // ቋሚ ነጥብ ወደ Firestore ማስቀመጥ
        await userRef.set({
            userId: String(userId),
            username: username || 'N/A',
            score: newScore,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // ስኬታማ ሲሆን የFirebase Connectionን መዝጋት
        await firebaseApp.delete();

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                message: "ነጥብ በተሳካ ሁኔታ ተመዝግቧል", 
                newScore: newScore 
            })
        };

    } catch (error) {
        console.error("Firebase/Handler ስህተት:", error);
        
        // ስህተት ሲፈጠር የFirebase Connectionን መዝጋት
        if (firebaseApp) {
            await firebaseApp.delete();
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'የውስጥ አገልጋይ ስህተት', error: error.message })
        };
    }
}
