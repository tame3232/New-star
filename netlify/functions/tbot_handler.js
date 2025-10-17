// netlify/functions/tbot_handler.js - ቋሚ ነጥብ ማስቀመጫ Backend

const admin = require('firebase-admin');
const fetch = require('node-fetch'); // የቴሌግራም APIን ለመጥራት

// ----------------------------------------------------
// TELEGRAM ውቅር (CONFIGURATION)
// ----------------------------------------------------
// !!! ትኩረት: Tokenን ከ Environment Variable እንጠራዋለን !!!
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 

// የመልእክት መላኪያ ተግባር
async function sendTelegramMessage(chatId, text) {
    if (!TELEGRAM_TOKEN) {
        console.error("TELEGRAM_BOT_TOKEN አልተዘጋጀም!");
        return; // Token ከሌለ API ጥሪ አናደርግም
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    
    // የቴሌግራም APIን መጥራት
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML' 
            })
        });
    } catch (e) {
        console.error("Error sending Telegram message:", e);
    }
}
// ----------------------------------------------------

// 1. የ Firebase Admin SDKን ማዘጋጀት
// ... (የEnvironment Variableን መጫን)
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
let serviceAccount;

try {
    serviceAccount = JSON.parse(serviceAccountString);
} catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT Variable በትክክል JSON አይደለም:", e);
    exports.handler = async () => {
        return { statusCode: 500, body: JSON.stringify({ message: 'የአገልጋይ ውቅር ስህተት' }) };
    };
    return;
}

const FIREBASE_DATABASE_URL = `https://${serviceAccount.project_id}.firebaseio.com`;

let firebaseApp; 

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
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ message: "ዘዴው አልተፈቀደም። POST ብቻ ያስፈልጋል" }) 
        };
    }

    try {
        const data = JSON.parse(event.body); // የተቀበለውን ዳታ በሙሉ እንይዛለን

        // ----------------------------------------------------
        // ክፍል A: የቴሌግራም ትዕዛዞችን ማስተናገድ (Handle Telegram Commands)
        // ----------------------------------------------------
        if (data.message) {
            const messageText = data.message.text;
            const chatId = data.message.chat.id;
            const firstName = data.message.chat.first_name || 'ተጠቃሚ';

            if (messageText && messageText.startsWith('/start')) {
                // እዚህ ላይ Web App URL ን መጠቀም እንችላለን!
                const welcomeMessage = `ሰላም ${firstName}፣ እንኳን ደህና መጡ። ነጥብ ለማግኘት Web App ለመክፈት ይህንን አገናኝ ይጫኑ: https://smartgame1.netlify.app`;
                
                await sendTelegramMessage(chatId, welcomeMessage);
            } 
            
            // !!! ትኩረት: ከቴሌግራም ጥያቄ በኋላ መዝጋት !!!
            await firebaseApp.delete();

            // ለቴሌግራም አገልጋይ 200 OK መልስ እንልካለን
            return { 
                statusCode: 200, 
                body: JSON.stringify({ success: true, message: "Telegram command processed" }) 
            };
        }


        // ----------------------------------------------------
        // ክፍል B: Web App ነጥብ ሲል (Score Submissions)
        // ----------------------------------------------------
        const { userId, score, username } = data; // ከቴሌግራም መልእክት ሳይሆን ከWeb App የመጣ ዳታ

        if (!userId || score === undefined) {
            await firebaseApp.delete(); 
            return { statusCode: 400, body: JSON.stringify({ message: 'የተጠቃሚ መታወቂያ እና ነጥብ ያስፈልጋል' }) };
        }

        // Firestore ላይ የውሂብ ማስቀመጫ መንገድ: 'users' collection
        const userRef = db.collection('users').doc(String(userId));
        
        const doc = await userRef.get();
        let currentScore = 0;

        if (doc.exists) {
            currentScore = doc.data().score || 0;
        }

        const newScore = currentScore + score;

        await userRef.set({
            userId: String(userId),
            username: username || 'N/A',
            score: newScore,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // !!! ስኬታማ ሲሆን መዝጊያውን ጨምር !!!
        await firebaseApp.delete();

        // ውጤቱን ለ Frontend (Web App) መመለስ
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
        
        // !!! ስህተት ሲፈጠር መዝጊያውን ጨምር !!!
        if (firebaseApp) {
            await firebaseApp.delete();
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'የውስጥ አገልጋይ ስህተት', error: error.message })
        };
    }
}
