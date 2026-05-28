import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CORRECTIONS = {
  sentinelClassic: {
    label: "Custom Facile",
    title: "Sentinel Classic",
    description: "Réponses et configuration attendue pour le custom Sentinel Classic.",
    updatedAt: serverTimestamp(),
    sections: [
      {
        title: "Couleurs",
        items: [
          { label: "Couleur principale", value: "Blanc Pure" },
          { label: "Couleur secondaire", value: "Noir noir" },
          { label: "Couleur nacrée", value: "Aucune" },
          { label: "Couleur intérieure", value: "Aucune" }
        ]
      },
      {
        title: "Roues",
        items: [
          { label: "Type de roue", value: "Sport" },
          { label: "Modèle de roues", value: "23" },
          { label: "Couleur roues", value: "Blanc Blanc" }
        ]
      },
      {
        title: "Options visuelles",
        items: [
          { label: "Autocollants", value: "4" },
          { label: "Phares xénons", value: "Oui" },
          { label: "Couleur des phares", value: "3" },
          { label: "Vitres teintées", value: "1" },
          { label: "Plaque", value: "1" },
          { label: "Néons", value: "Non" }
        ]
      },
      {
        title: "Carrosserie",
        items: [
          { label: "Aileron", value: "5" },
          { label: "Pare-choc avant", value: "5" },
          { label: "Pare-choc arrière", value: "0" },
          { label: "Bas de caisse", value: "0" },
          { label: "Pot d'échappement", value: "3" },
          { label: "Cadre", value: "1" },
          { label: "Calandre", value: "0" },
          { label: "Capot", value: "11" },
          { label: "Aile gauche", value: "0" },
          { label: "Toit", value: "1 et 2" }
        ]
      }
    ]
  },

  argento2f: {
    label: "Custom Moyen",
    title: "Argento 2F",
    description: "Réponses et configuration attendue pour le custom Argento 2F.",
    updatedAt: serverTimestamp(),
    sections: [
      {
        title: "Couleurs",
        items: [
          { label: "Couleur principale", value: "Noir noir" },
          { label: "Couleur secondaire", value: "Aucune" },
          { label: "Couleur nacrée", value: "Blanc Pure" },
          { label: "Couleur intérieure", value: "Aucune" }
        ]
      },
      {
        title: "Performances",
        items: [
          { label: "Full perf", value: "Oui" }
        ]
      },
      {
        title: "Roues",
        items: [
          { label: "Type de roue", value: "Sport" },
          { label: "Modèle de roues", value: "14" },
          { label: "Couleur roues", value: "Noir" }
        ]
      },
      {
        title: "Options visuelles",
        items: [
          { label: "Plaque avant", value: "0" },
          { label: "Pare-boue des ailes", value: "1" },
          { label: "Antennes", value: "0" },
          { label: "Ailes", value: "0" },
          { label: "Bouchon du réservoir", value: "1" },
          { label: "Fenêtres", value: "2" },
          { label: "Autocollants", value: "10" },
          { label: "Phares xénons", value: "Oui" },
          { label: "Couleur des phares", value: "1" },
          { label: "Vitres teintées", value: "1" },
          { label: "Plaque", value: "5" },
          { label: "Extra 1", value: "Non" },
          { label: "Néons", value: "Non" }
        ]
      },
      {
        title: "Carrosserie",
        items: [
          { label: "Aileron", value: "4" },
          { label: "Pare-choc avant", value: "3" },
          { label: "Pare-choc arrière", value: "0" },
          { label: "Bas de caisse", value: "2" },
          { label: "Pot d'échappement", value: "8" },
          { label: "Cadre", value: "0" },
          { label: "Calandre", value: "5" },
          { label: "Capot", value: "3" },
          { label: "Aile gauche", value: "1" },
          { label: "Toit", value: "1" }
        ]
      }
    ]
  },

  cypher: {
    label: "Custom Difficile",
    title: "Cypher",
    description: "Réponses et configuration attendue pour le custom Cypher.",
    updatedAt: serverTimestamp(),
    sections: [
      {
        title: "Couleurs",
        items: [
          { label: "Couleur principale", value: "Noir noir" },
          { label: "Couleur secondaire", value: "Blanc blanc" },
          { label: "Couleur nacrée", value: "Gris rocheux" },
          { label: "Couleur intérieure", value: "Blanc" }
        ]
      },
      {
        title: "Performances",
        items: [
          { label: "Full perf", value: "Oui" }
        ]
      },
      {
        title: "Roues",
        items: [
          { label: "Type de roue", value: "Track" },
          { label: "Modèle de roues", value: "18" },
          { label: "Couleur roues", value: "Noir" }
        ]
      },
      {
        title: "Intérieur et détails techniques",
        items: [
          { label: "Plaque avant", value: "2" },
          { label: "Intérieur", value: "4" },
          { label: "Accessoires", value: "2" },
          { label: "Tableau de bord", value: "2" },
          { label: "Compteur de vitesse", value: "1" },
          { label: "Haut-parleurs - portières", value: "3" },
          { label: "Sièges", value: "0" },
          { label: "Volant", value: "0" },
          { label: "Bloc moteur", value: "2" },
          { label: "Entretoises", value: "0" }
        ]
      },
      {
        title: "Options visuelles",
        items: [
          { label: "Pare-boue des ailes", value: "1" },
          { label: "Antennes", value: "2" },
          { label: "Ailes", value: "1" },
          { label: "Bouchon du réservoir", value: "1" },
          { label: "Autocollants", value: "2" },
          { label: "Phares xénons", value: "Oui" },
          { label: "Couleur des phares", value: "2" },
          { label: "Vitres teintées", value: "1" },
          { label: "Plaque", value: "1" },
          { label: "Néons", value: "Non" }
        ]
      },
      {
        title: "Carrosserie",
        items: [
          { label: "Aileron", value: "11" },
          { label: "Pare-choc avant", value: "11" },
          { label: "Pare-choc arrière", value: "5" },
          { label: "Bas de caisse", value: "4" },
          { label: "Pot d'échappement", value: "6" },
          { label: "Cadre", value: "8" },
          { label: "Calandre", value: "11" },
          { label: "Capot", value: "12" },
          { label: "Aile gauche", value: "1" },
          { label: "Aile droite", value: "0" },
          { label: "Toit", value: "7" }
        ]
      }
    ]
  }
};

async function getUserRole(user) {
  if (!user?.email) return null;

  const userRef = doc(db, "users", user.email);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return null;

  return userSnap.data().role || null;
}

async function updateCorrections(user) {
  const role = await getUserRole(user);

  if (role !== "prof") {
    alert("Accès refusé : seul un compte professeur peut mettre à jour les corrigés.");
    console.warn("Mise à jour refusée, rôle =", role);
    return;
  }

  const confirmed = confirm(
    "Mettre à jour les 3 corrigés Firestore ?\n\n" +
    "- Sentinel Classic\n" +
    "- Argento 2F\n" +
    "- Cypher\n\n" +
    "Ça va remplacer les documents concernés."
  );

  if (!confirmed) {
    console.log("Mise à jour corrigés annulée.");
    return;
  }

  try {
    for (const [docId, data] of Object.entries(CORRECTIONS)) {
      await setDoc(doc(db, "customAnswerKeys", docId), data);
      console.log(`Corrigé mis à jour : customAnswerKeys/${docId}`);
    }

    alert("✅ Corrigés mis à jour avec succès dans Firestore.");

  } catch (error) {
    console.error("Erreur mise à jour corrigés :", error);
    alert(`Erreur pendant la mise à jour : ${error.code || error.message}`);
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    console.warn("Aucun utilisateur connecté. Connecte-toi à l'espace prof d'abord.");
    return;
  }

  await updateCorrections(user);
});
