// netlify/tbot_handler.js - ቋሚ ነጥብ ማስቀመጫ Backend

const admin = require('firebase-admin');

// 1. የ Firebase Admin SDKን ማዘጋጀት
// [!!!] እዚህ ላይ የእርስዎን የ JSON ፋይል ስም ያስገቡ [!!!]
// ቀደም ብሎ ከ Firebase ያወረዱት ቁልፍ ስም ነው።
const serviceAccount = require('./telegram-app-key.json'); 

const FIREBASE_DATABASE_URL = `https://${serviceAccount.project_id}.firebaseio.com`;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
    });
}

const db = admin.firestore();

// 2. የ Netlify Function መግቢያ ነጥብ (API Endpoint)
exports.handler = async (event) => {
    // ይህ Function የሚሰራው POST ጥያቄ ሲደርሰው ብቻ ነው።
    if (event.httpMethod !== 'POST') {
        // GET API ከፈለጉ ይህንን መቀየር ይችላሉ።
        return { 
            statusCode: 405, 
            body: JSON.stringify({ message: "ዘዴው አልተፈቀደም። POST ብቻ ያስፈልጋል" }) 
        };
    }

    try {
        const { userId, score, username } = JSON.parse(event.body);

        if (!userId || score === undefined) {
            return { statusCode: 400, body: JSON.stringify({ message: 'የተጠቃሚ መታወቂያ እና ነጥብ ያስፈልጋል' }) };
        }

        const userRef = db.collection('users').doc(String(userId));
        
        // ያለውን ነጥብ መፈተሽ
        const doc = await userRef.get();
        let currentScore = 0;

        if (doc.exists) {
            currentScore = doc.data().score || 0;
        }

        // አዲሱን ነጥብ መጨመር
        const newScore = currentScore + score;

        // ቋሚ ነጥብ ወደ Firestore ማስቀመጥ
        await userRef.set({
            userId: String(userId),
            username: username || 'N/A',
            score: newScore,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // ውጤቱን ለ Frontend (index.html) መመለስ
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                message: "ነጥብ በተሳካ ሁኔታ ተመዝግቧል", 
                newScore: newScore 
            })
        };

    } catch (error) {
        console.error("Firebase ስህተት:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'የውስጥ አገልጋይ ስህተት', error: error.message })
        };
    }
};
