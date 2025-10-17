// netlify/functions/tbot_handler.js - ቋሚ ነጥብ ማስቀመጫ Backend

const admin = require('firebase-admin');

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
    return; // ትኩረት: እዚህ Functionን እንዘጋለን
}

const FIREBASE_DATABASE_URL = `https://${serviceAccount.project_id}.firebaseio.com`;

let firebaseApp; // <--- የተጨመረ

if (!admin.apps.length) {
    firebaseApp = admin.initializeApp({ // <--- የተቀየረ
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
    });
} else {
    firebaseApp = admin.app(); // <--- የተጨመረ
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
        const { userId, score, username } = JSON.parse(event.body);

        if (!userId || score === undefined) {
            // !!! አዲስ: 400 ሲመለስም መዘጋት አለበት
            await firebaseApp.delete(); 
            // !!! መጨረሻ !!!

            return { statusCode: 400, body: JSON.stringify({ message: 'የተጠቃሚ መታወቂያ እና ነጥብ ያስፈልጋል' }) };
        }

        // Firestore ላይ የውሂብ ማስቀመጫ መንገድ: 'users' collection
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

        // !!! ስኬታማ ሲሆን መዝጊያውን ጨምር !!!
        await firebaseApp.delete();
        // !!! መጨረሻ !!!

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
        
        // !!! ስህተት ሲፈጠር መዝጊያውን ጨምር !!!
        if (firebaseApp) {
            await firebaseApp.delete();
        }
        // !!! መጨረሻ !!!

        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'የውስጥ አገልጋይ ስህተት', error: error.message })
        };
    }
}
