# Sélection Basket FFSU — guide de mise en route

Application web à 2 entraîneurs, synchronisée en direct via Firebase.
71 étudiants du fichier FFSU sont déjà intégrés (groupes A/B/C/D).

## 1. Créer le projet Firebase (5 min, gratuit)

1. Allez sur https://console.firebase.google.com → **Ajouter un projet** → donnez-lui un nom (ex: `ffsu-basket`) → suivez les étapes (vous pouvez désactiver Google Analytics).
2. Une fois le projet créé, dans le menu de gauche : **Créer une base de données** sous **Firestore Database**.
   - Choisissez une région proche (ex: `eur3 (europe-west)`).
   - Démarrez en **mode production**.
3. Allez dans **Règles** (onglet en haut de Firestore) et remplacez le contenu par :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   Cliquez **Publier**.
   ⚠️ Ces règles ouvrent l'accès à quiconque a le lien de l'appli — largement suffisant pour un usage ponctuel de sélection entre vous deux, mais ne partagez pas l'URL publiquement. (On peut restreindre avec un mot de passe/authentification si besoin, dites-le moi.)
4. Dans **Paramètres du projet** (roue crantée, en haut à gauche) → onglet **Général** → section **Vos applications** → cliquez l'icône `</>` (Web) → donnez un nom → **Enregistrer l'application**.
5. Copiez l'objet `firebaseConfig` qui s'affiche, il ressemble à :
   ```json
   {
     "apiKey": "AIza...",
     "authDomain": "ffsu-basket.firebaseapp.com",
     "projectId": "ffsu-basket",
     "storageBucket": "ffsu-basket.appspot.com",
     "messagingSenderId": "123456789",
     "appId": "1:123456789:web:abcdef"
   }
   ```

## 2. Mettre l'application en ligne (GitHub Pages)

1. Créez un nouveau repository GitHub (public ou privé).
2. Ajoutez les 3 fichiers fournis : `index.html`, `app.js`, `students-data.js`.
3. Dans **Settings → Pages**, activez GitHub Pages sur la branche `main` (dossier racine).
4. Votre appli sera accessible à une adresse du type `https://votre-compte.github.io/votre-repo/`.

## 3. Premier lancement

1. Ouvrez le lien sur votre téléphone/tablette/ordinateur.
2. Entrez votre **nom** et collez le **firebaseConfig** copié à l'étape 1.5 → **Enregistrer et se connecter**.
3. Allez dans l'onglet **Export** → cliquez **Importer les 71 étudiants du fichier FFSU** (une seule fois, par un seul des deux coachs).
4. Votre collègue fait la même chose que le point 2 sur son propre appareil (même config Firebase) → il/elle voit instantanément les mêmes données.

## Utilisation le jour J

- **Appel** : cochez les présents groupe par groupe, déplacez un étudiant vers un autre créneau via le menu déroulant.
- **Photos** : prenez ou importez la photo du groupe, puis reportez le numéro (gauche→droite) sur chaque étudiant.
- **Évaluation** : cliquez "Évaluer" sur un étudiant → cochez élimination (niveau ou état d'esprit) ou remplissez la fiche (poste, taille, club, observables notés sur 5, note globale, équipe pressentie).
- **Équipes** : vue en direct des 3 équipes, avec la liste des joueurs retenus non encore affectés.
- **Export** : téléchargez le CSV complet à tout moment.

Tout est synchronisé en temps réel entre les deux entraîneurs.
