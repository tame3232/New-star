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
    
    // የPOST ጥያቄ መላክ
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML' 
        })
    });
    // ምላሽ ካልተሳካ ስህተት ማሳየት
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Error sending Telegram message: ${response.status} - ${errorBody}`);
    }
}
// ----------------------------------------------------

// 1. የ Firebase Admin SDKን ማዘጋጀት
// የEnvironment Variableን ከNetlify ላይ እንጠራለን
const serviceAccountString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS; 
let serviceAccount;

// ለ Firebase Initialization የሚሆን ግሎባል ተለዋዋጮች
let firebaseApp; 
let db;

try {
    if (!serviceAccountString) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS is not set in Netlify Environment.");
    }

    serviceAccount = JSON.parse(serviceAccountString);

    // Firebase Appን መጀመሪያ መጀመር (አፕሊኬሽኑ ካልተጀመረ ብቻ)
    if (!admin.apps.length) {
        // የDatabase URLን ከ serviceAccount መውሰድ
        const FIREBASE_DATABASE_URL = `https://${serviceAccount.project_id}.firebaseio.com`;

        firebaseApp = admin.initializeApp({ 
            credential: admin.credential.cert(serviceAccount),
            databaseURL: FIREBASE_DATABASE_URL
        });
    } else {
        // ቀደም ሲል የጀመረውን መተግበሪያ መጠቀም
        firebaseApp = admin.app(); 
    }

    // Firestore instanceን ማግኘት
    db = admin.firestore();

} catch (e) {
    console.error("FIREBASE ውቅር ስህተት:", e.message);
    // የአገልጋይ ውቅር ስህተት ከባድ ስለሆነ ማስኬዱን እናቆማለን
    // ይህ ስህተት የሚከሰተው Deployment ላይ ነው።
    const handler = async () => ({
        statusCode: 500, 
        body: JSON.stringify({ message: `የአገልጋይ ውቅር ስህተት: ${e.message}` })
    });
    exports.handler = handler;
    return;
}


// 2. የ Netlify Function መግቢያ ነጥብ (API Endpoint)
exports.handler = async (event) => {
    // የውቅር ስህተት ካለ፣ እዚህ ጋር ይያዛል
    if (exports.handler.name !== 'handler') {
        return exports.handler(event);
    }
    
    // 405 POST check
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
            
            // የFirebase Connectionን መዝጋት አያስፈልግም
            
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

        // የFirebase Connectionን መዝጋት አያስፈልግም

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
        
        // የFirebase Connectionን መዝጋት አያስፈልግም
        
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'የውስጥ አገልጋይ ስህተት', error: error.message })
        };
    }
}
