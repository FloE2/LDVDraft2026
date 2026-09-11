# Sélection Basket FFSU — guide de mise en route

Application web à 2 entraîneurs, synchronisée en direct via Firebase.
71 étudiants du fichier FFSU sont déjà intégrés (groupes A/B/C/D).

## 1. Projet Firebase

Le projet Firebase (`ldvdraft2026`) est déjà créé et sa configuration est intégrée directement dans `app.js` — rien à copier-coller. Il reste une vérification à faire une fois :

1. Allez sur https://console.firebase.google.com → ouvrez le projet `ldvdraft2026`.
2. Dans le menu de gauche, vérifiez que **Firestore Database** est bien créée (sinon cliquez **Créer une base de données**, région proche type `eur3 (europe-west)`, mode production).
3. Onglet **Règles** de Firestore → remplacez le contenu par :
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
   ⚠️ Ces règles ouvrent l'accès en lecture/écriture à quiconque a le lien de l'appli — largement suffisant pour un usage ponctuel entre vous deux, mais ne partagez pas l'URL publiquement. (Je peux ajouter une authentification si besoin.)

## 2. Mettre l'application en ligne (GitHub Pages)

1. Créez un nouveau repository GitHub (public ou privé).
2. Ajoutez les 3 fichiers fournis : `index.html`, `app.js`, `students-data.js`.
3. Dans **Settings → Pages**, activez GitHub Pages sur la branche `main` (dossier racine).
4. Votre appli sera accessible à une adresse du type `https://votre-compte.github.io/votre-repo/`.

## 3. Premier lancement

1. Ouvrez le lien sur votre téléphone/tablette/ordinateur.
2. Entrez votre **nom** → **Commencer**.
3. Allez dans l'onglet **Export** → cliquez **Importer les 71 étudiants du fichier FFSU** (une seule fois, par un seul des deux coachs).
4. Votre collègue ouvre le même lien sur son propre appareil, entre son nom → il/elle voit instantanément les mêmes données.

## Utilisation le jour J

- **Appel** : cochez les présents groupe par groupe, déplacez un étudiant vers un autre créneau via le menu déroulant.
- **Photos** : prenez ou importez la photo du groupe, puis reportez le numéro (gauche→droite) sur chaque étudiant.
- **Évaluation** : cliquez "Évaluer" sur un étudiant → cochez élimination (niveau ou état d'esprit) ou remplissez la fiche (poste, taille, club, observables notés sur 5, note globale, équipe pressentie).
- **Équipes** : vue en direct des 3 équipes, avec la liste des joueurs retenus non encore affectés.
- **Export** : téléchargez le CSV complet à tout moment.

Tout est synchronisé en temps réel entre les deux entraîneurs.
